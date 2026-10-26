// apps/api/scripts/stt-bench.mjs
// Measures the candidate Vietnamese STT providers against the same audio, on the
// three axes that decide the default: accuracy, latency, and how many requests
// each survives before it answers 429. Run from apps/api so .env is loaded:
//   cd apps/api && node --env-file-if-exists=.env scripts/stt-bench.mjs
// Keys are only ever read from process.env and never printed.

// Test audio comes from the local VieNeu engine so generating the corpus costs
// nothing; STT_BENCH_TTS_URL overrides the loopback default.
const sampleRate = 16_000;
const vieneuUrl = (process.env.STT_BENCH_TTS_URL?.trim() || 'http://127.0.0.1:8001').replace(/\/+$/, '');
const vieneuVoice = process.env.VIENEU_TTS_VOICE?.trim() || 'Hải Đăng';

// Ground truth is authored here because the audio is synthesized from it.
const phrases = [
  'Hôm nay tôi muốn hỏi về đội hình mạnh nhất của bản hiện tại.',
  'Lên cấp tám thì mở hệ Bilgewater và lấy Gangplank làm chủ lực.',
  'Cho Ekko cầm Vô Cực Kiếm với Gậy Force rồi ghép thêm Giày Rapid.',
  'Đội hình pháp sư mạnh ở đầu trận nhưng yếu dần về cuối game.',
  'Bảng bổ trợ này phù hợp với người mới vì không yêu cầu kỹ năng cao.',
];

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function wordErrorRate(reference, hypothesis) {
  const ref = normalize(reference);
  const hyp = normalize(hypothesis);
  const rows = ref.length + 1;
  const cols = hyp.length + 1;
  const dist = Array.from({ length: rows }, (_, i) => {
    const row = new Array(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j += 1) dist[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      dist[i][j] = Math.min(
        dist[i - 1][j] + 1,
        dist[i][j - 1] + 1,
        dist[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
      );
    }
  }
  return { wer: ref.length ? dist[ref.length][hyp.length] / ref.length : 0, ref, hyp };
}

async function synthClips() {
  const clips = [];
  for (const phrase of phrases) {
    const response = await fetch(`${vieneuUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.VIENEU_TTS_MODEL?.trim() || 'vieneu-v4',
        input: phrase,
        voice: vieneuVoice,
        response_format: 'wav',
        sample_rate: sampleRate,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`VieNeu responded ${response.status}: ${await response.text()}`);
    clips.push({ phrase, wav: Buffer.from(await response.arrayBuffer()) });
  }
  return clips;
}

const geminiPrompt =
  'Transcribe the speech in this recording verbatim in its original language, preserving the exact wording. ' +
  'Output only the transcript with no commentary. If the recording contains no speech, output an empty string.';

const deepgramProvider = (model) => ({
  id: `deepgram/${model}`,
  enabled: () => Boolean(process.env.DEEPGRAM_API_KEY),
  run: async (wav) => {
    const response = await fetch(
      `https://api.deepgram.com/v1/listen?model=${model}&language=vi&smart_format=true&punctuate=true`,
      {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' },
        body: wav,
        signal: AbortSignal.timeout(60_000),
      }
    );
    const body = await response.json().catch(() => ({}));
    return {
      text: body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
      meta: { seconds: body.metadata?.duration ?? null, cost: null, requestId: body.request_id ?? null, retryAfter: response.headers.get('retry-after') },
      status: response.status,
      error: body.err_msg ?? null,
    };
  },
});

const providers = [
  {
    id: 'gemini (current free tier)',
    enabled: () => Boolean(process.env.GOOGLE_API_KEY),
    run: async (wav) => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${process.env.STT_GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite'}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: geminiPrompt }, { inline_data: { mime_type: 'audio/wav', data: wav.toString('base64') } }] },
            ],
            generationConfig: { temperature: 0, maxOutputTokens: 4096 },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );
      const body = await response.json().catch(() => ({}));
      const parts = body.candidates?.[0]?.content?.parts ?? [];
      return {
        text: parts.map((p) => p.text ?? '').join('').trim(),
        meta: { seconds: null, cost: null, requestId: null, retryAfter: response.headers.get('retry-after') },
        status: response.status,
        error: body.error?.message ?? null,
      };
    },
  },
  {
    id: 'openrouter/whisper-large-v3-turbo',
    enabled: () => Boolean(process.env.OPENROUTER_API_KEY),
    run: async (wav) => {
      const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.STT_OPENROUTER_MODEL?.trim() || 'openai/whisper-large-v3-turbo',
          input_audio: { data: wav.toString('base64'), format: 'wav' },
          language: 'vi',
          response_format: 'json',
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json().catch(() => ({}));
      return {
        text: typeof body.text === 'string' ? body.text : '',
        meta: { seconds: body.usage?.seconds ?? null, cost: body.usage?.cost ?? null, requestId: null, retryAfter: response.headers.get('retry-after') },
        status: response.status,
        error: body.error?.message ?? null,
      };
    },
  },
  {
    id: 'groq/whisper-large-v3-turbo',
    enabled: () => Boolean(process.env.GROQ_API_KEY),
    run: async (wav) => {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav');
      form.append('model', process.env.STT_GROQ_MODEL?.trim() || 'whisper-large-v3-turbo');
      form.append('language', 'vi');
      form.append('response_format', 'json');
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json().catch(() => ({}));
      return {
        text: typeof body.text === 'string' ? body.text : '',
        meta: { seconds: body.usage?.seconds ?? null, cost: null, requestId: response.headers.get('x-groq-id'), retryAfter: response.headers.get('retry-after') },
        status: response.status,
        error: body.error?.message ?? null,
      };
    },
  },
];

providers.push(deepgramProvider(process.env.STT_DEEPGRAM_MODEL?.trim() || 'nova-2'), deepgramProvider('nova-3'));

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const clips = await synthClips();
console.log(`synthesized ${clips.length} clips, ${(clips[0].wav.length / 1024) | 0} KB each @16kHz mono\n`);

if (process.argv.includes('--load')) {
  // Round 2: one long utterance (what a real 30-60 s voice question looks like)
  // plus three un-spaced waves of 6 requests to find each provider's quota wall.
  const longText =
    'Hôm nay tôi muốn hỏi về đội hình mạnh nhất của bản hiện tại, vì tuần trước tôi thử tốc chiến nhưng thắng rất ít. ' +
    'Lên cấp tám thì mở hệ Bilgewater và lấy Gangplank làm chủ lực, cho nó cầm Vô Cực Kiếm với Gậy Force. ' +
    'Bảng bổ trợ này phù hợp với người mới vì không yêu cầu kỹ năng cao.';
  const synth = await fetch(`${vieneuUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'vieneu-v4', input: longText, voice: vieneuVoice, response_format: 'wav', sample_rate: sampleRate }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!synth.ok) throw new Error(`long synth failed ${synth.status}`);
  const longWav = Buffer.from(await synth.arrayBuffer());
  console.log(`long clip: ${longText.length} chars -> ${(longWav.length / 1024) | 0} KB ≈ ${(((longWav.length - 44) / (sampleRate * 2)) | 0)} s audio\n`);

  const load = [];
  for (const provider of providers) {
    if (!provider.enabled()) continue;
    const started = performance.now();
    const longOutcome = await provider.run(longWav).catch((error) => ({ text: '', status: 0, error: String(error), meta: {} }));
    const longMs = Math.round(performance.now() - started);
    const { wer } = wordErrorRate(longText, longOutcome.text);

    // Three waves of 6 with no spacing: shows the exact point where a provider's
    // per-minute quota starts answering 429, and what it returns.
    const waves = [];
    const seen429 = [];
    for (let wave = 1; wave <= 3; wave += 1) {
      const waveStarted = performance.now();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          provider
            .run(clips[(index + wave) % clips.length].wav)
            .then((outcome) => ({
              status: outcome.status,
              retryAfter: outcome.meta?.retryAfter ?? null,
              error: outcome.error ?? null,
            }))
            .catch((error) => ({ status: 0, retryAfter: null, error: String(error?.name ?? error) }))
        )
      );
      const rejected = results.filter((item) => item.status !== 200);
      for (const item of rejected) {
        const label = `${item.status}${item.retryAfter ? ` retry-after=${item.retryAfter}` : ''}${item.error ? ` ${item.error.slice(0, 70)}` : ''}`;
        if (!seen429.includes(label)) seen429.push(label);
      }
      waves.push(`w${wave} ${results.filter((item) => item.status === 200).length}/6 in ${Math.round(performance.now() - waveStarted)} ms`);
    }

    load.push({
      provider: provider.id,
      longLatencyMs: longMs,
      longWer: +wer.toFixed(3),
      longSeconds: longOutcome.meta?.seconds ?? ((longWav.length - 44) / (sampleRate * 2) | 0),
      longStatus: longOutcome.status,
      transcriptHead: (longOutcome.text || '').slice(0, 55),
      waves: waves.join(' | '),
      rejections: seen429.join(' ;; ') || 'none',
      error: longOutcome.error ?? null,
    });
  }
  console.table(load);
} else {

const report = [];
for (const provider of providers) {
  if (!provider.enabled()) {
    report.push({ provider: provider.id, skipped: 'no key in env' });
    continue;
  }
  const rows = [];
  for (const clip of clips) {
    const started = performance.now();
    let outcome;
    try {
      outcome = await provider.run(clip.wav);
    } catch (error) {
      outcome = { text: '', status: 0, error: String(error?.name ?? error), meta: {} };
    }
    const ms = Math.round(performance.now() - started);
    const { wer } = wordErrorRate(clip.phrase, outcome.text);
    rows.push({ ms, status: outcome.status, wer, chars: outcome.text.length, cost: outcome.meta?.cost ?? null, error: outcome.error ?? null });
  }

  // 429 headroom: fire N requests with no spacing, count what survives.
  const burst = 6;
  const burstStarted = performance.now();
  const burstResults = await Promise.all(
    Array.from({ length: burst }, (_, index) => clips[index % clips.length])
      .map((clip) =>
        provider
          .run(clip.wav)
          .then((outcome) => outcome.status)
          .catch(() => 0)
      )
  );
  const burstMs = Math.round(performance.now() - burstStarted);

  report.push({
    provider: provider.id,
    werAvg: +(rows.reduce((sum, row) => sum + row.wer, 0) / rows.length).toFixed(3),
    werWorst: +Math.max(...rows.map((row) => row.wer)).toFixed(3),
    exact: rows.filter((row) => row.wer === 0).length,
    latencyMs: { p50: median(rows.map((row) => row.ms)), max: Math.max(...rows.map((row) => row.ms)) },
    statuses: rows.map((row) => row.status).join(','),
    costUsdSum: +rows.reduce((sum, row) => sum + (row.cost ?? 0), 0).toPrecision(3),
    burst: `${burstResults.filter((status) => status === 200).length}/${burst} ok, ` +
      `${burstResults.filter((status) => status === 429).length} 429, other ${burstResults.filter((status) => status !== 200 && status !== 429).join('/') || '-'}` +
      ` in ${burstMs} ms`,
    errors: rows.map((row) => row.error).filter(Boolean).slice(0, 2),
  });
}

console.table(report);
console.log('\nsample transcripts (clip 2):');
for (const provider of providers) {
  if (!provider.enabled()) continue;
  const outcome = await provider.run(clips[1].wav).catch((error) => ({ text: `!${error}`, status: 0 }));
  console.log(`  ${provider.id} [${outcome.status}] ${JSON.stringify(outcome.text)}`);
}
}
