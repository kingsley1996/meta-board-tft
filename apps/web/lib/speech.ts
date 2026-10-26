// Helpers for reading Coach AI answers aloud. Server synthesis caps the text
// length; when the server cannot synthesize, the same text is spoken by the
// browser's speech engine in sentence-sized chunks (some engines truncate long
// utterances).

const maxSpokenCharacters = 500;
export const maxSpeechChunkCharacters = 180;

export type VoiceLike = {
  name: string;
  lang: string;
  default?: boolean;
  localService?: boolean;
  voiceURI?: string;
};

// Answers are written for reading: markdown, emoji, arrows, and star ratings
// would be read aloud as symbols or rejected by the speech limit. Reduce them
// to plain spoken prose and cut at a sentence boundary; the full answer stays
// readable in the chat bubble.
export function spokenText(answer: string, limit = maxSpokenCharacters): string {
  const plain = answer
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    // Markdown table separator rows (|---|---|) carry no spoken content.
    .replace(/^\s*[\p{Pd}:|\s]+$/gmu, ' ')
    .replace(/(\*\*\*|\*\*|__|\*|~~)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(
      /[\p{Extended_Pictographic}\u{2022}\u{2023}\u{2043}\u{2190}-\u{21FF}\u{2500}-\u{25FF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{00A9}\u{00AE}]/gu,
      ' '
    )
    .replace(/[*_~#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= limit) return plain;
  const boundary = Math.max(
    plain.lastIndexOf('.', limit),
    plain.lastIndexOf('!', limit),
    plain.lastIndexOf('?', limit)
  );
  return plain.slice(0, boundary > limit * 0.6 ? boundary + 1 : limit).trim();
}

export function chunkForSpeech(text: string, maxChars = maxSpeechChunkCharacters): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const sentences = normalized.match(/[^.!?…]+[.!?…]*\s*/gu) ?? [normalized];
  const chunks: string[] = [];
  let current = '';

  const flush = () => {
    if (current) chunks.push(current);
    current = '';
  };

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      flush();
      chunks.push(...splitLongPiece(piece, maxChars));
      continue;
    }
    if (!current) current = piece;
    else if (current.length + 1 + piece.length <= maxChars) current += ` ${piece}`;
    else {
      flush();
      current = piece;
    }
  }
  flush();
  return chunks;
}

function splitLongPiece(piece: string, maxChars: number): string[] {
  const parts: string[] = [];
  let rest = piece;
  while (rest.length > maxChars) {
    const punctuation = Math.max(
      rest.lastIndexOf(',', maxChars),
      rest.lastIndexOf(';', maxChars),
      rest.lastIndexOf(':', maxChars)
    );
    const space = rest.lastIndexOf(' ', maxChars);
    const cut =
      punctuation > maxChars * 0.5 ? punctuation + 1 : space > maxChars * 0.5 ? space : maxChars;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

function normalizeLang(lang: string): string {
  return lang.trim().toLowerCase().replace('_', '-');
}

export function voicesForLanguage<T extends VoiceLike>(voices: readonly T[], lang: string): T[] {
  const target = normalizeLang(lang);
  const base = target.split('-')[0];
  return voices.filter((voice) => {
    const voiceLang = normalizeLang(voice.lang);
    return voiceLang === target || voiceLang.split('-')[0] === base;
  });
}

export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string): T | null {
  const target = normalizeLang(lang);
  const matches = voicesForLanguage(voices, target);
  if (!matches.length) return null;
  return matches.reduce((best, voice) => (voiceScore(voice, target) > voiceScore(best, target) ? voice : best));
}

// Coach AI answers in the language of the question, which can differ from the
// UI language. Vietnamese diacritics are a reliable signal, so a Vietnamese
// answer on the English UI is not read with an English voice.
const vietnameseLetters =
  /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;

export function speechLanguageFor(text: string, uiLang: string): string {
  if (vietnameseLetters.test(text)) return 'vi-VN';
  return uiLang === 'vi' ? 'vi-VN' : 'en-US';
}

function voiceScore(voice: VoiceLike, target: string): number {
  let score = 0;
  if (normalizeLang(voice.lang) === target) score += 4;
  if (voice.localService) score += 2;
  if (voice.default) score += 1;
  return score;
}

// Chrome exposes an empty voice list on first access and fills it later, and it
// does not always fire `voiceschanged` for a list that was already in flight.
// Polling instead of only listening keeps the fallback engine from reporting
// "no voices" seconds before the voices show up.
export function loadVoices(synth: SpeechSynthesis, timeoutMs = 2_000): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', finish);
      clearInterval(poll);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const poll = setInterval(() => {
      if (synth.getVoices().length) finish();
    }, 150);
    const timer = setTimeout(finish, timeoutMs);
    synth.addEventListener('voiceschanged', finish);
  });
}

// Only iOS Safari gates speech behind a user gesture. Priming elsewhere is not
// just unnecessary: the silent utterance joins the queue with the default
// voice, and Chrome can then read the queued answer in that default (often
// English) voice instead of the requested one.
export function needsSpeechPriming(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  // iPadOS reports a desktop Safari user agent; touch support gives it away.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

// Speaking a silent utterance during a click unlocks the audio session for the
// speech that arrives after an await.
export function primeSpeechSynthesis(synth: SpeechSynthesis, lang?: string): void {
  if (typeof navigator !== 'undefined' && !needsSpeechPriming(navigator.userAgent, navigator.maxTouchPoints)) return;
  try {
    const utterance = new SpeechSynthesisUtterance(' ');
    utterance.volume = 0;
    if (lang) utterance.lang = lang;
    synth.speak(utterance);
  } catch {
    // Best effort: playback still works in browsers that do not need priming.
  }
}
