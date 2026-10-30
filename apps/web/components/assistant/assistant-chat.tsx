'use client';

import Link from 'next/link';
import { Tomo, TomoSprite, type TomoCue, type TomoReaction } from '@/components/assistant/tomo';
import { useEffect, useRef, useState } from 'react';
import { AugmentTile, ItemHex, Panel, UnitHex, tierColor } from '@/components/ui';
import type { AssistantRecommendation } from '@/lib/api';
import type { Tier } from '@/lib/tiers';
import {
  AssistantApiError,
  askAssistantStream,
  deleteAssistantConversation,
  getAssistantConversation,
  getMembershipUsage,
  listAssistantConversations,
  sendAssistantFeedback,
  type AssistantConversation,
  type AssistantMessageRecord,
  type AssistantQueryRequest,
  type AssistantResponse,
  type MembershipUsage,
} from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { messages as uiMessages } from '@/lib/messages';
import {
  chunkForSpeech,
  maxSpeechChunkCharacters,
  spokenText,
} from '@/lib/speech';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  voiceResponse?: boolean;
  response?: AssistantResponse;
};

type StoredChat = { conversationId?: string; messages?: ChatMessage[] };

// /api/voice/tts/status answers with the engine's own chunk limit, so the
// client never sends a request the server would reject.
type VoiceTtsStatus = { available: boolean; maxChars: number };

// A refused speech request carries the server's code, so the UI can say "not in
// your plan" or "out of characters" instead of a generic failure.
class SpeechDenied extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(status: number, code: string | null) {
    super(`Speech request failed with ${status}`);
    this.status = status;
    this.code = code;
  }
}

// Flux Vietnamese reads slowly and Deepgram's `speed` is ignored for vi, so the
// pace is adjusted on the client; Aura-2 English is already at a normal pace.
const vietnameseSpeechPlaybackRate = 1.15;

type VoiceSession = {
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: AudioWorkletNode;
  chunks: Float32Array[];
  sampleCount: number;
  maxSamples: number;
  tooLong: boolean;
};

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

// The ledger's idempotency key: 8-64 characters from [A-Za-z0-9_-], so the
// Math.random fallback is base-36 digits only (no decimal point).
function newRequestKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

// The server owns the chunk size it will synthesize; anything implausible falls
// back to the size the local VieNeu engine answers in about a second.
function chunkLimitFrom(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < 40) return 150;
  return Math.min(parsed, 400);
}

function closeVoiceSession(session: VoiceSession): Promise<void> {
  session.processor.port.onmessage = null;
  session.processor.disconnect();
  session.source.disconnect();
  session.stream.getTracks().forEach((track) => track.stop());
  return session.audioContext.close();
}

function floatSamplesToBuffer(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * Float32Array.BYTES_PER_ELEMENT);
  const view = new DataView(buffer);
  samples.forEach((sample, index) => view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, sample, true));
  return buffer;
}

function loadStored(key: string): StoredChat {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? 'null') as StoredChat | null;
    if (!parsed || !Array.isArray(parsed.messages)) return {};
    const messages = parsed.messages.filter(
      (message): message is ChatMessage =>
        !!message && (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string'
    );
    return { conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : undefined, messages: messages.slice(-12) };
  } catch {
    return {};
  }
}

function restoredMessages(records: AssistantMessageRecord[]): ChatMessage[] {
  return records.map((message) => ({
    id: message.id,
    role: message.role,
    // response.answer is untruncated; content was capped at 2000 chars for the DB check.
    content: message.response?.answer ?? message.content,
    response: message.response ?? undefined,
  }));
}

function historyFor(messages: ChatMessage[], excludeLastUser: boolean): { role: 'user' | 'assistant'; content: string }[] {
  const base = excludeLastUser && messages[messages.length - 1]?.role === 'user' ? messages.slice(0, -1) : messages;
  return base.slice(-6).map(({ role, content }) => ({ role, content }));
}

function QuotaBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex max-w-[780px] items-start gap-3 rounded-[10px] border border-line border-l-[3px] border-l-brand bg-page px-3.5 py-2.5 text-[12.5px] leading-relaxed text-mist">
      <div className="min-w-0">
        <b className="mb-0.5 block text-[13px] font-semibold text-fog">{title}</b>
        <span>{body}</span>
      </div>
    </div>
  );
}

export function AssistantChat({
  lang,
  compSlug,
  compTitle,
  membershipEnforced,
}: {
  lang: Lang;
  compSlug: string | null;
  compTitle: string | null;
  membershipEnforced: boolean;
}) {
  const t = uiMessages[lang].assistant;
  const storageKey = `metaboard:assistant:${lang}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The turn that failed, with the key it was sent under: retrying reuses the key so
  // a turn the server already completed is replayed instead of charged again. A voice
  // turn keeps its id too, so the retry spends the chat unit the recording reserved.
  const [retryTurn, setRetryTurn] = useState<{ text: string; requestKey: string; voiceTurnId?: string } | null>(null);
  const [feedback, setFeedback] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceStarting, setVoiceStarting] = useState(false);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tomoCue, setTomoCue] = useState<TomoCue | null>(null);
  // The ledger's own answer to "how much is left". It is refreshed after every turn
  // and after voice/read-aloud, never computed locally: a locally decremented
  // counter drifts from what the next reserve will accept.
  const [usage, setUsage] = useState<MembershipUsage | null>(null);

  const voiceSessionRef = useRef<VoiceSession | null>(null);
  // One turn at a time: Stop cancels the stream, and the server releases the turn
  // if Coach never started answering.
  const answerAbortRef = useRef<AbortController | null>(null);
  // Speech callbacks outlive the request that created them; the sequence token
  // lets a stopped or superseded playback ignore its own late events.
  const speechSeqRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsAbortRef = useRef<AbortController | null>(null);
  // Chunk audio is cached by voice+text so "Listen again" is instant, and the
  // status probe is cached too — a click should not pay for two round trips.
  const ttsCacheRef = useRef<Map<string, Promise<string>>>(new Map());
  const ttsStatusRef = useRef<{ lang: Lang; task: Promise<VoiceTtsStatus | null>; at: number } | null>(null);

  const voiceBaseRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const pendingVoiceRef = useRef<HTMLDivElement>(null);
  // Voice callbacks fire long after the render that created them (speech end,
  // async transcription); they must submit with the latest conversationId and
  // messages, not the ones captured when recording started.
  const submitRef = useRef<
    ((raw: string, addUser?: boolean, speakResponse?: boolean, retryKey?: string, voiceTurnId?: string) => Promise<void>) | null
  >(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      // Load conversation list from server. Graceful: if there is no session
      // yet (first visit), simply show an empty list.
      try {
        setConversationsLoading(true);
        const list = await listAssistantConversations();
        if (mounted) setConversations(list);
      } catch {
        if (mounted) setConversations([]);
      } finally {
        if (mounted) setConversationsLoading(false);
      }

      // Load stored conversation from sessionStorage as the initial conversationId.
      const stored = loadStored(storageKey);
      if (mounted) {
        setMessages(stored.messages ?? []);
        setConversationId(stored.conversationId);
        setHydrated(true);
      }

      // If we have a stored conversationId, fetch its messages from the server to restore history.
      if (mounted && stored.conversationId) {
        try {
          const detail = await getAssistantConversation(stored.conversationId);
          if (mounted && detail.messages.length) {
            setMessages(restoredMessages(detail.messages));
            setConversationId(stored.conversationId);
          }
        } catch {
          // Server fetch failed; fall back to sessionStorage messages already loaded above.
        }
      }
    }

    // Probe TTS availability up front: the answer engine needs ~1-3s to answer,
    // and a click on "Listen again" should not also pay for this round trip.
    void readTtsStatus();
    void load();
    if (membershipEnforced) void refreshUsage();
    return () => {
      mounted = false;
    };
  }, [storageKey, membershipEnforced]);

  useEffect(
    () => () => {
      speechSeqRef.current += 1;
      const session = voiceSessionRef.current;
      voiceSessionRef.current = null;
      if (session) void closeVoiceSession(session).catch((caught: unknown) => console.error('Could not close audio capture session', caught));
      ttsAbortRef.current?.abort();
      ttsAbortRef.current = null;
      audioRef.current?.pause();
      audioRef.current = null;
      for (const task of ttsCacheRef.current.values()) {
        void task.then((url) => URL.revokeObjectURL(url)).catch(() => {});
      }
      ttsCacheRef.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!hydrated) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ conversationId, messages: messages.slice(-12) }));
    } catch {
      // Session storage can be unavailable in private mode; the chat still works.
    }
  }, [conversationId, hydrated, messages, storageKey]);

  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = messages[messages.length - 1];
    // A fresh answer opens at its top, not its tail; user messages and the
    // thinking indicator still hug the bottom.
    if (last && last.role === 'assistant') {
      log.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(last.id)}"]`)?.scrollIntoView({ block: 'start' });
    } else {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, loading]);

  // The pending spoken-question bubble pops in at the tail; follow it down
  // immediately so the recording state is where the user is looking.
  useEffect(() => {
    if (listening || voiceTranscribing) pendingVoiceRef.current?.scrollIntoView({ block: 'end' });
  }, [listening, voiceTranscribing]);

  function errorText(caught: unknown): string {
    if (caught instanceof AssistantApiError) {
      switch (caught.code) {
        case 'unauthenticated':
          return t.errors.signIn;
        case 'quota_exhausted':
          return t.errors.quota;
        case 'daily_cap':
          return t.errors.dailyCap;
        case 'feature_locked':
          return t.errors.locked;
        case 'period_expired':
          return t.errors.expired;
        case 'request_in_progress':
          return t.errors.inProgress;
        case 'request_conflict':
          return t.errors.conflict;
        case 'membership_unavailable':
          return t.errors.membership;
        case 'assistant_disabled':
          return t.errors.disabled;
        case 'rate_limited':
        case 'too_many_in_flight':
          return t.errors.rate;
        default:
          break;
      }
      if (caught.status === 504) return t.errors.timeout;
    }
    return t.errors.generic;
  }

  // Voice denials arrive as {code} on the transcribe response, not as an
  // AssistantApiError; a recording also has no retry turn to attach to.
  function voiceDenialText(status: number, code: string | null): string | null {
    switch (code) {
      case 'unauthenticated':
        return t.errors.signIn;
      case 'feature_locked':
        return t.voicePlanRequired;
      case 'quota_exhausted':
        return t.errors.quota;
      case 'daily_cap':
        return t.errors.dailyCap;
      case 'period_expired':
        return t.errors.expired;
      case 'membership_unavailable':
        return t.errors.membership;
      case 'rate_limited':
        return t.errors.rate;
      case 'too_many_in_flight':
      case 'transcription_busy':
        return t.voiceBusy;
      case 'audio_too_long':
        return t.voiceTooLong;
      case 'no_speech':
        return t.voiceNoSpeech;
      case 'voice_unavailable':
        return t.voiceSttUnavailable;
      case 'invalid_audio':
      case 'transcription_failed':
      case 'already_answered':
      case 'request_in_progress':
      case 'request_conflict':
        return t.voiceSttError;
      default:
        break;
    }
    if (status === 401) return t.errors.signIn;
    if (status === 413) return t.voiceTooLong;
    if (status === 422) return t.voiceNoSpeech;
    if (status === 429) return t.voiceBusy;
    if (status === 503) return t.voiceSttUnavailable;
    return null;
  }

  function cueTomo(name: TomoReaction) {
    setTomoCue({ name, id: `${Date.now()}-${Math.random()}` });
  }

  async function refreshUsage(): Promise<void> {
    if (!membershipEnforced) return;
    try {
      setUsage(await getMembershipUsage());
    } catch {
      // A failed quota read must not break the chat: the chip keeps its last value
      // and the next turn asks again.
    }
  }

  function stopAnswerSpeech(): void {
    speechSeqRef.current += 1;
    setSpeaking(false);
    setSpeakingMessageId(null);
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    const audio = audioRef.current;
    audioRef.current = null;
    audio?.pause();
  }

  // Unlike a read-aloud stop, this ends the turn itself; the ledger then decides
  // whether Coach had already started answering (charged) or not (returned).
  function stopAnswer(): void {
    answerAbortRef.current?.abort();
  }

  // A denial will answer the same way until the clock or the plan changes, so only
  // failures that can succeed on a second try keep a Retry button.
  function retryable(caught: unknown): boolean {
    if (!(caught instanceof AssistantApiError)) return true;
    return ![
      'unauthenticated',
      'quota_exhausted',
      'daily_cap',
      'feature_locked',
      'period_expired',
      'request_in_progress',
      'request_conflict',
    ].includes(caught.code);
  }

  async function readTtsStatus(): Promise<VoiceTtsStatus | null> {
    const cached = ttsStatusRef.current;
    // The in-flight promise is shared, so React's double mount in dev and a
    // click that lands while the warm-up is still running cost one probe. The
    // language is part of the identity because it picks the engine.
    if (cached && cached.lang === lang && Date.now() - cached.at < 60_000) return cached.task;
    const task = (async (): Promise<VoiceTtsStatus | null> => {
      try {
        const response = await fetch(`/api/voice/tts/status?lang=${lang}`, { cache: 'no-store' });
        if (!response.ok) return null;
        const payload = (await response.json()) as { available?: unknown; maxChars?: unknown };
        return {
          available: payload.available === true,
          maxChars: chunkLimitFrom(payload.maxChars),
        };
      } catch {
        // The API is unreachable; there is no browser engine to fall back to.
        return null;
      }
    })();
    ttsStatusRef.current = { lang, task, at: Date.now() };
    return task;
  }

  function fetchChunkAudio(key: string, request: () => Promise<Response>): Promise<string> {
    const cache = ttsCacheRef.current;
    const existing = cache.get(key);
    if (existing) return existing;
    const task = (async () => {
      const response = await request();
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
        throw new SpeechDenied(response.status, typeof body?.code === 'string' ? body.code : null);
      }
      return URL.createObjectURL(await response.blob());
    })().catch((caught: unknown) => {
      // A failed request must not poison the key: a later replay asks again.
      if (cache.get(key) === task) cache.delete(key);
      throw caught;
    });
    cache.set(key, task);
    // Keep the last dozen chunks around so replaying a recent answer is free,
    // and release older blob URLs instead of leaking them.
    while (cache.size > 12) {
      const oldest = cache.entries().next();
      if (oldest.done) break;
      cache.delete(oldest.value[0]);
      void oldest.value[1]
        .then((url) => URL.revokeObjectURL(url))
        .catch(() => {});
    }
    return task;
  }

  // Pre-pilot playback: the browser owns the text and sends it. The same sentence is
  // different audio in each language, so the voice is part of the cache key.
  function legacyChunkAudio(text: string, signal: AbortSignal): Promise<string> {
    return fetchChunkAudio(`${lang}:${text}`, () =>
      fetch('/api/voice/tts/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, lang }),
        signal,
      })
    );
  }

  // Enforced playback (task #85): the server owns the text and the chunking, so the
  // browser sends the ledger request, its version and an index. The key is per
  // playback attempt plus chunk, so a transport retry replays the same ledger row
  // instead of buying a second synthesis.
  function plannedChunkAudio(
    requestId: string,
    version: string,
    chunk: number,
    attemptKey: string,
    signal: AbortSignal
  ): Promise<string> {
    return fetchChunkAudio(`${lang}:${requestId}:${version}:${chunk}`, () =>
      fetch('/api/voice/tts/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Key': `${attemptKey}-${chunk}` },
        body: JSON.stringify({ requestId, version, chunk, lang }),
        signal,
      })
    );
  }

  async function fetchSpeechPlan(requestId: string, signal: AbortSignal): Promise<{ version: string; chunks: number }> {
    const response = await fetch(`/api/voice/tts/plan?requestId=${encodeURIComponent(requestId)}`, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      throw new SpeechDenied(response.status, typeof body?.code === 'string' ? body.code : null);
    }
    const body = (await response.json()) as { version?: unknown; chunks?: unknown };
    return {
      version: typeof body.version === 'string' ? body.version : '',
      chunks: Number.isSafeInteger(body.chunks) ? Math.max(0, body.chunks as number) : 0,
    };
  }

  function playChunkAudio(url: string, seq: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.playbackRate = lang === 'vi' ? vietnameseSpeechPlaybackRate : 1;
      audioRef.current = audio;
      const settle = () => {
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = () => {
        settle();
        resolve();
      };
      audio.onerror = () => {
        settle();
        reject(new Error('Audio playback failed'));
      };
      // The stop button pauses rather than ends playback, so without this the
      // chunk loop would wait for an "ended" event that never arrives.
      audio.onpause = () => {
        if (seq !== speechSeqRef.current) {
          settle();
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      audio.play().catch((caught: unknown) => {
        settle();
        reject(caught instanceof Error ? caught : new Error('Audio playback failed'));
      });
    });
  }

  // A refusal names the reason so auto-read stops with a specific message instead
  // of retrying a chunk the plan will never cover.
  function speechDenialText(error: SpeechDenied): string {
    switch (error.code) {
      case 'unauthenticated':
        return t.errors.signIn;
      case 'feature_locked':
        return t.voiceReadPlanRequired;
      case 'quota_exhausted':
        return t.voiceReadQuota;
      case 'membership_unavailable':
        return t.errors.membership;
      default:
        return t.voiceSpeechError;
    }
  }

  function playbackErrorText(caught: unknown): string {
    if (caught instanceof SpeechDenied) return speechDenialText(caught);
    return caught instanceof DOMException && caught.name === 'NotAllowedError' ? t.voiceSpeechBlocked : t.voiceSpeechError;
  }

  // The server owns the engine choice — Aura-2 for English, Flux then VieNeu for
  // Vietnamese. A playback error is reported to the user; there is no browser
  // speech engine anymore.
  async function playWithServerTts(spoken: string, status: VoiceTtsStatus, seq: number): Promise<void> {
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    const chunks = chunkForSpeech(spoken, Math.min(status.maxChars, maxSpeechChunkCharacters));
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        const current = legacyChunkAudio(chunks[index], controller.signal);
        if (index + 1 < chunks.length) {
          // The server caps concurrent synthesis; prefetch exactly one chunk
          // ahead so the next sentence is ready when the current one ends.
          void legacyChunkAudio(chunks[index + 1], controller.signal).catch(() => {});
        }
        const url = await current;
        if (seq !== speechSeqRef.current) return;
        await playChunkAudio(url, seq);
      }
      setSpeaking(false);
      setSpeakingMessageId(null);
    } catch (caught: unknown) {
      if (seq !== speechSeqRef.current || controller.signal.aborted) return;
      console.error('Server speech playback failed', caught);
      setSpeechError(playbackErrorText(caught));
      setSpeaking(false);
      setSpeakingMessageId(null);
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
      // Every synthesized chunk is ledger spend; read the balance back once the
      // playback settles, whether it ended, failed or was stopped.
      void refreshUsage();
    }
  }

  // Enforced playback (task #85): the plan comes from the server, which also owns
  // the text and the character count, so a synthesized-but-unheard chunk may cost
  // quota and an exhausted allowance stops auto-read with the answer still on screen.
  async function playWithPlannedTts(requestId: string, seq: number): Promise<void> {
    const controller = new AbortController();
    ttsAbortRef.current = controller;
    const attemptKey = newRequestKey();
    try {
      const plan = await fetchSpeechPlan(requestId, controller.signal);
      if (seq !== speechSeqRef.current) return;
      if (plan.chunks === 0) {
        setSpeaking(false);
        setSpeakingMessageId(null);
        return;
      }
      for (let index = 0; index < plan.chunks; index += 1) {
        const current = plannedChunkAudio(requestId, plan.version, index, attemptKey, controller.signal);
        if (index + 1 < plan.chunks) {
          void plannedChunkAudio(requestId, plan.version, index + 1, attemptKey, controller.signal).catch(() => {});
        }
        const url = await current;
        if (seq !== speechSeqRef.current) return;
        await playChunkAudio(url, seq);
      }
      setSpeaking(false);
      setSpeakingMessageId(null);
    } catch (caught: unknown) {
      if (seq !== speechSeqRef.current || controller.signal.aborted) return;
      console.error('Server speech playback failed', caught);
      setSpeechError(playbackErrorText(caught));
      setSpeaking(false);
      setSpeakingMessageId(null);
    } finally {
      if (ttsAbortRef.current === controller) ttsAbortRef.current = null;
      void refreshUsage();
    }
  }

  async function speakAnswer(message: { content: string; response?: AssistantResponse }, messageId: string) {
    stopAnswerSpeech();
    setSpeechError(null);
    const spoken = spokenText(message.content);
    // Nothing audible after stripping markdown and symbols (emoji-only or
    // table-only answers); skip synthesis instead of surfacing an error.
    if (!spoken) return;
    const seq = speechSeqRef.current;
    setSpeaking(true);
    setSpeakingMessageId(messageId);

    const status = await readTtsStatus();
    if (seq !== speechSeqRef.current) return;
    if (!status?.available) {
      setSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechError(t.voiceSpeechError);
      return;
    }
    if (!membershipEnforced) {
      await playWithServerTts(spoken, status, seq);
      return;
    }
    // Without a ledger request there is no text the server is willing to read.
    const requestId = message.response?.requestId;
    if (!requestId) {
      setSpeaking(false);
      setSpeakingMessageId(null);
      setSpeechError(t.voiceSpeechError);
      return;
    }
    await playWithPlannedTts(requestId, seq);
  }

  async function submit(raw: string, addUser = true, speakResponse = false, retryKey?: string, voiceTurnId?: string) {
    const text = raw.trim();
    if (!text || loading) return;
    // The composer is disabled when the day or the period is out, but Enter still
    // fires; refusing here keeps a doomed request off the wire.
    if (membershipEnforced && usage) {
      const dailyOut = usage.chatToday.allowance > 0 && usage.chatToday.remaining <= 0;
      if (dailyOut || usage.metrics.chat.remaining <= 0) return;
    }
    if (addUser) stopAnswerSpeech();
    setError(null);
    setRetryTurn(null);
    setSpeechError(null);
    if (addUser) {
      setMessages((current) => [...current, { id: makeId(), role: 'user', content: text }]);
      setInput('');
    }
    setLoading(true);
    const controller = new AbortController();
    answerAbortRef.current = controller;
    const turnKey = retryKey ?? newRequestKey();
    const request: AssistantQueryRequest = {
      message: text,
      lang,
      conversationId,
      requestKey: turnKey,
      ...(voiceTurnId ? { voiceTurnId } : {}),
      history: historyFor(messages, !addUser),
      context: { pageType: compSlug ? 'comp' : 'assistant', compSlug, entityIds: [] },
    };
    const streamId = makeId();
    let accumulated = '';
    let streamed = false;
    try {
      const response = await askAssistantStream(
        request,
        (chunk) => {
          // Grow the answer bubble as Tomo generates; updates always carry the
          // full accumulated text so they stay idempotent under batching.
          accumulated += chunk;
          const content = accumulated;
          setMessages((current) => {
            const exists = current.some((message) => message.id === streamId);
            return exists
              ? current.map((message) => (message.id === streamId ? { ...message, content } : message))
              : [...current, { id: streamId, role: 'assistant' as const, content }];
          });
          streamed = true;
        },
        controller.signal
      );
      setConversationId(response.conversationId);
      setMessages((current) =>
        streamed
          ? current.map((message) =>
              message.id === streamId
                ? { ...message, content: response.answer, response, voiceResponse: speakResponse }
                : message
            )
          : [
              ...current,
              { id: streamId, role: 'assistant' as const, content: response.answer, response, voiceResponse: speakResponse },
            ]
      );
      if (speakResponse) void speakAnswer({ content: response.answer, response }, streamId);
      cueTomo('sparkle');
      // Refresh conversation list so the new conversation appears with its title.
      void listAssistantConversations().then((list) => setConversations(list)).catch(() => {
        // Ignore list refresh failures.
      });
    } catch (caught) {
      if (streamed) setMessages((current) => current.filter((message) => message.id !== streamId));
      if (controller.signal.aborted) {
        // Stopped by the user: not a failure, so no error bar and no Retry. The
        // server already settled the turn; the balance read below shows the result.
        setError(null);
        setRetryTurn(null);
      } else {
        setError(errorText(caught));
        if (retryable(caught)) setRetryTurn({ text, requestKey: turnKey, ...(voiceTurnId ? { voiceTurnId } : {}) });
        cueTomo('surprised');
      }
    } finally {
      if (answerAbortRef.current === controller) answerAbortRef.current = null;
      setLoading(false);
      void refreshUsage();
    }
  }

  useEffect(() => {
    submitRef.current = submit;
  });

  async function startVoiceInput() {
    if (
      !navigator.mediaDevices?.getUserMedia ||
      !window.AudioContext ||
      !window.OfflineAudioContext ||
      !window.AudioWorkletNode
    ) {
      setVoiceError(t.voiceUnsupported);
      return;
    }

    setVoiceStarting(true);
    stopAnswerSpeech();
    setVoiceError(null);
    setSpeechError(null);
    voiceBaseRef.current = input.trim();
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;
    try {
      const statusResponse = await fetch('/api/voice/status', { cache: 'no-store' });
      if (!statusResponse.ok) {
        setVoiceError(t.voiceSttError);
        return;
      }
      const status = (await statusResponse.json()) as { available?: boolean };
      if (!status.available) {
        setVoiceError(t.voiceSttUnavailable);
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioContext = new AudioContext();
      await audioContext.resume();
      await audioContext.audioWorklet.addModule('/audio-capture-processor.js');
      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, 'tftiq-audio-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const session: VoiceSession = {
        stream,
        audioContext,
        source,
        processor,
        chunks: [],
        sampleCount: 0,
        maxSamples: Math.ceil(audioContext.sampleRate * 60),
        tooLong: false,
      };
      processor.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const inputSamples = new Float32Array(event.data);
        const remaining = session.maxSamples - session.sampleCount;
        if (remaining <= 0) {
          session.tooLong = true;
          return;
        }
        const captured = inputSamples.slice(0, Math.min(inputSamples.length, remaining));
        session.chunks.push(captured);
        session.sampleCount += captured.length;
        if (captured.length < inputSamples.length) session.tooLong = true;
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      voiceSessionRef.current = session;
      setListening(true);
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== 'closed') {
        await audioContext.close();
      }
      if (caught instanceof DOMException && caught.name === 'NotAllowedError') {
        setVoiceError(t.voicePermission);
      } else if (caught instanceof DOMException && ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(caught.name)) {
        setVoiceError(t.voiceNoMicrophone);
      } else {
        setVoiceError(t.voiceError);
      }
    } finally {
      setVoiceStarting(false);
    }
  }

  async function stopVoiceInput() {
    const session = voiceSessionRef.current;
    if (!session) return;
    voiceSessionRef.current = null;
    setListening(false);
    setVoiceTranscribing(true);
    try {
      await closeVoiceSession(session);
      if (session.tooLong) {
        setVoiceError(t.voiceTooLong);
        return;
      }
      if (!session.sampleCount) {
        setVoiceError(t.voiceNoSpeech);
        return;
      }

      const capturedSamples = new Float32Array(session.sampleCount);
      let offset = 0;
      for (const chunk of session.chunks) {
        capturedSamples.set(chunk, offset);
        offset += chunk.length;
      }
      const outputLength = Math.ceil((capturedSamples.length * 16_000) / session.audioContext.sampleRate);
      const offlineContext = new OfflineAudioContext(1, outputLength, 16_000);
      const audioBuffer = offlineContext.createBuffer(1, capturedSamples.length, session.audioContext.sampleRate);
      audioBuffer.copyToChannel(capturedSamples, 0);
      const source = offlineContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(offlineContext.destination);
      source.start();
      const resampled = await offlineContext.startRendering();
      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Sample-Rate': '16000',
          'X-Language': lang,
          // One key per recording, so a retried upload cannot be billed twice.
          'X-Request-Key': newRequestKey(),
        },
        body: floatSamplesToBuffer(resampled.getChannelData(0)),
      });
      const result = (await response.json().catch(() => ({}))) as { text?: unknown; code?: unknown; turnId?: unknown };
      const denial = voiceDenialText(response.status, typeof result.code === 'string' ? result.code : null);
      if (denial) {
        setVoiceError(denial);
        return;
      }
      if (!response.ok || typeof result.text !== 'string') {
        setVoiceError(t.voiceSttError);
        return;
      }
      const transcript = result.text.trim();
      if (!transcript) {
        setVoiceError(t.voiceNoSpeech);
        return;
      }
      const base = voiceBaseRef.current;
      const question = `${base}${base ? ' ' : ''}${transcript}`.slice(0, 2000);
      setVoiceError(null);
      setVoiceTranscribing(false);
      // The server held a chat turn for this recording; sending its id with the
      // question spends that hold instead of booking a second turn.
      const turnId = typeof result.turnId === 'string' ? result.turnId : undefined;
      await submitRef.current?.(question, true, true, undefined, turnId);
    } catch (caught) {
      console.error('Voice transcription failed', caught);
      setVoiceError(t.voiceSttError);
    } finally {
      setVoiceTranscribing(false);
      // Transcription spends voice-in seconds whether or not it produced text.
      void refreshUsage();
    }
  }

  function cancelVoiceInput() {
    const session = voiceSessionRef.current;
    voiceSessionRef.current = null;
    if (session) void closeVoiceSession(session).catch((caught: unknown) => console.error('Could not close audio capture session', caught));
    setListening(false);
  }

  function toggleVoiceInput() {
    if (voiceSessionRef.current) void stopVoiceInput();
    else if (!voiceStarting && !voiceTranscribing) void startVoiceInput();
  }

  async function openConversation(id: string) {
    if (loading || id === conversationId) {
      setSidebarOpen(false);
      return;
    }
    stopAnswerSpeech();
    setSidebarOpen(false);
    try {
      const detail = await getAssistantConversation(id);
      setConversationId(id);
      setMessages(restoredMessages(detail.messages));
      setInput('');
      setError(null);
    } catch {
      setError('Failed to load conversation');
    }
  }

  // Deleting from the sidebar removes history only. If the deleted row is the
  // conversation on screen, newChat() has to run too: leaving its id behind would
  // send the next question to a conversation the database no longer has.
  async function removeConversation(conversation: AssistantConversation) {
    if (deletingConversationId) return;
    const title = conversation.title || t.untitledConversation;
    if (!window.confirm(t.conversationDeleteConfirm(title))) return;
    setDeletingConversationId(conversation.id);
    setError(null);
    try {
      await deleteAssistantConversation(conversation.id);
      setConversations((current) => current.filter((entry) => entry.id !== conversation.id));
      if (conversation.id === conversationId) newChat();
    } catch {
      setError(t.conversationDeleteFailed);
    } finally {
      setDeletingConversationId(null);
    }
  }

  function newChat() {
    setSidebarOpen(false);
    if (loading) return;
    stopAnswerSpeech();
    cancelVoiceInput();
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setError(null);
    setVoiceError(null);
    setSpeechError(null);
    setRetryTurn(null);
    setFeedback({});
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures.
    }
    void listAssistantConversations().then((list) => setConversations(list)).catch(() => {
      // Ignore list refresh failures; new chat still works.
    });
  }

  async function copyAnswer(message: ChatMessage) {
    const sections = (message.response?.sections ?? []).map(
      (section) => `${section.heading}\n${section.points.map((point) => `- ${point}`).join('\n')}`
    );
    try {
      await navigator.clipboard.writeText([message.content, ...sections].join('\n\n'));
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((current) => (current === message.id ? null : current)), 1800);
    } catch {
      // Clipboard permission is optional.
    }
  }

  async function rate(response: AssistantResponse, helpful: boolean) {
    if (feedback[response.requestId] !== undefined) return;
    setFeedback((current) => ({ ...current, [response.requestId]: helpful }));
    try {
      await sendAssistantFeedback({ requestId: response.requestId, conversationId: response.conversationId, helpful });
    } catch {
      setFeedback((current) => {
        const next = { ...current };
        delete next[response.requestId];
        return next;
      });
    }
  }

  function statusLabel(response: AssistantResponse): string | null {
    if (response.status === 'answered' || response.status === 'error') return null;
    return t.status[response.status];
  }

  const voiceStatus = voiceStarting
    ? t.voiceStarting
    : voiceTranscribing
      ? t.voiceTranscribing
      : speaking
        ? t.voiceSpeaking
        : listening
          ? t.voiceRecording
          : null;

  // Everything below reads the ledger's answer once, so the chip, the banners and
  // the composer cannot disagree about whether a turn is available.
  const quota = membershipEnforced ? usage : null;
  const voiceLocked = !!quota && quota.metrics.stt_seconds.allowance <= 0;
  const readLocked = !!quota && quota.metrics.tts_characters.allowance <= 0;
  const readExhausted = !!quota && quota.metrics.tts_characters.allowance > 0 && quota.metrics.tts_characters.remaining <= 0;
  const dailyExhausted = !!quota && quota.chatToday.allowance > 0 && quota.chatToday.remaining <= 0;
  const periodExhausted = !!quota && quota.metrics.chat.remaining <= 0;
  // "Running low" is a quarter of the daily allowance; for Plus (30 a day) the
  // warning appears with 7 left, which is enough to change how you spend them.
  const nearDaily =
    !!quota &&
    quota.chatToday.allowance > 0 &&
    quota.chatToday.remaining > 0 &&
    quota.chatToday.remaining <= Math.max(1, Math.floor(quota.chatToday.allowance / 4));
  const composerLocked = dailyExhausted || periodExhausted;
  const speakLabel = readExhausted ? t.quota.readUsedUp : readLocked ? t.quota.readLocked : null;
  const composerPlaceholder = periodExhausted ? t.quota.composerPeriod : dailyExhausted ? t.quota.composerDaily : t.placeholder;
  const quotaDate = (iso: string | null): string => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(lang === 'vi' ? 'vi-VN' : 'en-GB', {
      day: '2-digit',
      month: lang === 'vi' ? '2-digit' : 'short',
      year: 'numeric',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(date);
  };

  return (
    <div className="flex w-full gap-4">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label={t.sidebarClose}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-50 bg-black/50 lg:hidden"
        />
      ) : null}
      <aside
        className={`${sidebarOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-[60] w-72 flex-col gap-3 overflow-hidden border-r border-line bg-panel p-3 shadow-xl lg:sticky lg:top-28 lg:z-auto lg:flex lg:max-h-[calc(100dvh-15rem)] lg:w-72 lg:shrink-0 lg:self-start lg:rounded-xl lg:border lg:shadow-none`}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={newChat}
            className="smooth flex flex-1 items-center gap-2 rounded-lg border border-line bg-util px-3 py-2 text-left text-sm font-semibold text-fog hover:border-brand"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.9]">
              <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
            </svg>
            <span className="truncate">{t.clear}</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label={t.sidebarClose}
            className="smooth rounded-lg border border-line px-2.5 py-2 text-sm text-mist hover:border-brand hover:text-fog lg:hidden"
          >
            ×
          </button>
        </div>
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.history}</p>
        <nav aria-label={t.history} aria-busy={conversationsLoading} className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length ? (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void openConversation(conversation.id)}
                    aria-current={conversation.id === conversationId ? 'true' : undefined}
                    title={conversation.title || t.untitledConversation}
                    className={`smooth min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left text-xs font-semibold ${
                      conversation.id === conversationId ? 'bg-util text-brand' : 'text-mist hover:bg-util hover:text-fog'
                    }`}
                  >
                    {conversation.title || t.untitledConversation}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeConversation(conversation)}
                    disabled={deletingConversationId === conversation.id}
                    aria-label={`${t.conversationDelete}: ${conversation.title || t.untitledConversation}`}
                    title={t.conversationDelete}
                    className="smooth shrink-0 rounded-md p-1.5 text-mist hover:bg-util hover:text-tier-s disabled:opacity-40"
                  >
                    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 fill-none stroke-current stroke-[1.6]">
                      <path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.9 10a1 1 0 0 0 1 .9h5.2a1 1 0 0 0 1-.9l.9-10M8.5 8.5v6M11.5 8.5v6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-1 text-xs text-mist">{conversationsLoading ? '…' : t.noConversations}</p>
          )}
        </nav>
      </aside>
      <Panel className="flex h-[calc(100dvh-16rem)] min-h-[18rem] min-w-0 flex-1 flex-col overflow-hidden lg:h-[calc(100dvh-15rem)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t.sidebarOpen}
            className="smooth rounded-md border border-line bg-util px-2.5 py-2 text-sm font-semibold text-mist hover:border-brand hover:text-fog lg:hidden"
          >
            <span aria-hidden>☰</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold text-fog">{t.assistant}</p>
            {compTitle || compSlug ? <p className="truncate text-xs text-mist">{t.context(compTitle ?? compSlug ?? '')}</p> : null}
          </div>
          {/* The chip carries a whole sentence in Vietnamese; on a phone it gets its
              own line instead of squeezing the title and running off the panel. */}
          <div className="order-last flex w-full min-w-0 items-center gap-1.5 sm:order-none sm:ml-auto sm:w-auto">
            {quota ? (
              <span
                aria-live="polite"
                className={`inline-flex min-w-0 items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${
                  quota.plan.paid ? 'border-brand/55 text-brand' : 'border-line text-mist'
                }`}
              >
                {loading
                  ? t.quota.chipInFlight(1)
                  : quota.plan.paid
                    ? t.quota.chipDaily(quota.chatToday.remaining, quota.chatToday.allowance)
                    : t.quota.chipMonthly(quota.metrics.chat.remaining, quota.metrics.chat.allowance)}
              </span>
            ) : (
              <span
                aria-hidden
                className="hidden rounded-full border border-line bg-util px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist sm:inline"
              >
                Tomo
              </span>
            )}
          </div>
          <Tomo cue={tomoCue} busy={loading} ariaLabel={t.mascotBoop} />
        </div>

        <div ref={logRef} role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
          {!messages.length ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center">
              <p className="font-display text-2xl font-bold text-fog">{t.emptyTitle}</p>
              <p className="max-w-lg text-sm leading-relaxed text-mist">{t.emptyBody}</p>
              <div className="flex max-w-xl flex-wrap justify-center gap-2 pt-2">
                {t.samples.map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => void submit(sample)}
                    className="smooth rounded-full border border-line bg-util px-3 py-1.5 text-left text-xs font-semibold text-mist hover:border-brand hover:text-fog"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm leading-relaxed text-on-brand">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-on-brand/70">{t.you}</span>
                  <span className="whitespace-pre-wrap">{message.content}</span>
                </div>
              </div>
            ) : (
              <AssistantBubble
                key={message.id}
                message={message}
                lang={lang}
                feedback={message.response ? feedback[message.response.requestId] : undefined}
                copied={copiedId === message.id}
                speaking={speakingMessageId === message.id}
                onCopy={() => void copyAnswer(message)}
                onSpeak={() => {
                  if (speakingMessageId === message.id) {
                    stopAnswerSpeech();
                    return;
                  }
                  void speakAnswer(message, message.id);
                }}
                onRate={rate}
                onFollowUp={(question) => void submit(question)}
                statusLabel={message.response ? statusLabel(message.response) : null}
                speechLockedLabel={speakLabel}
              />
            )
          )}

          {listening || voiceTranscribing ? (
            <div ref={pendingVoiceRef} className="flex justify-end" role="status">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand px-4 py-2.5 text-sm text-on-brand">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-on-brand/70">{t.you}</span>
                <span className="flex items-center gap-1 py-1" aria-hidden>
                  <span className="chat-typing-dot" style={{ animationDelay: '0s' }} />
                  <span className="chat-typing-dot" style={{ animationDelay: '0.2s' }} />
                  <span className="chat-typing-dot" style={{ animationDelay: '0.4s' }} />
                </span>
              </div>
            </div>
          ) : null}

          {loading ? (
            quota ? (
              <div className="flex max-w-[85%] flex-col gap-1.5 self-start" role="status">
                <div className="flex items-center gap-2.5 rounded-[10px] border border-dashed border-brand/45 px-3 py-2 text-xs text-mist">
                  <span aria-hidden className="agent-step" />
                  {t.quota.reserved}
                  <button
                    type="button"
                    onClick={stopAnswer}
                    className="smooth ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-semibold text-mist hover:border-brand hover:text-fog"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden className="h-2.5 w-2.5 fill-current">
                      <rect x="2" y="2" width="12" height="12" rx="1.5" />
                    </svg>
                    {t.quota.stop}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-sm text-mist" role="status">
                <span aria-hidden className="agent-step" />
                {t.sending}
              </div>
            )
          ) : null}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <div
            role="alert"
            className="mx-4 mt-2 flex flex-wrap items-start gap-2.5 rounded-[10px] border border-line px-3 py-2 text-xs text-mist"
          >
            <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 h-4 w-4 shrink-0 fill-none stroke-current stroke-[1.7]">
              <path d="M10 3.5 18 17H2L10 3.5Z" strokeLinejoin="round" />
              <path d="M10 8v4M10 14.5v.5" strokeLinecap="round" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-fog">{error}</p>
              {retryTurn ? <p className="mt-0.5 text-[11.5px]">{t.quota.nothingCharged}</p> : null}
            </div>
            {retryTurn ? (
              <button
                type="button"
                onClick={() => void submit(retryTurn.text, false, false, retryTurn.requestKey, retryTurn.voiceTurnId)}
                className="smooth ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-panel px-2.5 py-1 text-[11px] font-semibold text-fog hover:border-brand"
              >
                <svg viewBox="0 0 20 20" aria-hidden className="h-3 w-3 fill-none stroke-current stroke-[1.8]">
                  <path d="M16 10a6 6 0 1 1-1.8-4.3M16 3.5V6h-2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t.retry}
              </button>
            ) : null}
          </div>
        ) : null}

        {quota && (periodExhausted || dailyExhausted || nearDaily || readExhausted) ? (
          <div className="flex flex-col gap-2 px-4 pt-3">
            {periodExhausted ? (
              <QuotaBanner title={t.quota.periodTitle} body={t.quota.periodBody} />
            ) : dailyExhausted ? (
              <QuotaBanner title={t.quota.dailyTitle} body={t.quota.dailyBody(quota.metrics.chat.remaining)} />
            ) : nearDaily ? (
              <QuotaBanner
                title={t.quota.nearTitle(quota.chatToday.remaining)}
                body={t.quota.nearBody(quota.chatToday.allowance, quota.metrics.chat.remaining)}
              />
            ) : null}
            {readExhausted ? (
              <QuotaBanner title={t.quota.readExhaustedTitle} body={t.quota.readExhaustedBody(quotaDate(quota.periodEnd))} />
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit(input);
          }}
          className="shrink-0 border-t border-line bg-panel p-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submit(input);
                }
              }}
              rows={2}
              maxLength={2000}
              disabled={composerLocked}
              placeholder={composerPlaceholder}
              aria-label={composerPlaceholder}
              className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog placeholder:text-mist disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading || voiceStarting || voiceTranscribing || composerLocked || voiceLocked}
              aria-label={voiceLocked ? t.voicePlanRequired : listening ? t.voiceStop : t.voiceStart}
              aria-pressed={listening}
              title={voiceLocked ? t.voicePlanRequired : listening ? t.voiceStop : t.voiceStart}
              className={`smooth relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                listening
                  ? 'border-tier-s bg-tier-s/20 text-tier-s'
                  : 'border-line bg-page text-mist hover:border-brand hover:text-fog'
              }`}
            >
              {listening ? (
                <span aria-hidden className="h-3.5 w-3.5 rounded-full bg-current" />
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 fill-none stroke-current stroke-[1.8]">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 11a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" />
                </svg>
              )}
              {voiceLocked ? (
                <span aria-hidden className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full border border-line bg-page text-mist">
                  <svg viewBox="0 0 12 12" aria-hidden className="h-2.5 w-2.5 fill-none stroke-current stroke-[1.5]">
                    <rect x="2.5" y="5" width="7" height="5" rx="1" />
                    <path d="M4 5V3.8a2 2 0 0 1 4 0V5" />
                  </svg>
                </span>
              ) : null}
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim() || composerLocked}
              className="smooth h-12 rounded-lg border border-brand bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? '…' : t.send}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-mist">
            <p>{t.disclaimer}</p>
            <div className="flex items-center gap-2">
              {voiceStarting || voiceTranscribing ? <span aria-hidden className="agent-step" /> : null}
              <p role="status">{voiceStatus}</p>
              {speaking ? (
                <button type="button" onClick={stopAnswerSpeech} className="underline underline-offset-2">
                  {t.voiceStopSpeaking}
                </button>
              ) : null}
            </div>
          </div>
          {voiceError ? <p role="status" className="mt-2 text-xs text-tier-s">{voiceError}</p> : null}
          {speechError ? <p role="status" className="mt-2 text-xs text-tier-s">{speechError}</p> : null}
        </form>
      </Panel>
    </div>
  );
}

function RecommendationCard({ recommendation, lang }: { recommendation: AssistantRecommendation; lang: Lang }) {
  const t = uiMessages[lang].assistant;
  const slug = recommendation.slug ?? recommendation.compId.replace(/^comp:/, '');
  const units = recommendation.units ?? [];
  const items = recommendation.items ?? [];
  const augments = recommendation.augments ?? [];
  const tier = recommendation.tier as Tier | undefined;

  return (
    <li className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/${lang}/tierlist/comps/${slug}`} className="smooth flex min-w-0 flex-1 items-start gap-2 text-sm font-semibold text-fog hover:text-brand">
            {tier ? (
              <span className="rounded border px-1.5 py-0.5 font-display text-xs font-bold" style={{ borderColor: tierColor[tier], color: tierColor[tier] }}>
                {tier}
              </span>
            ) : null}
            <span className="min-w-0 break-words leading-snug">{recommendation.title}</span>
          </Link>
          {recommendation.style ? <p className="mt-0.5 text-[11px] text-mist">{recommendation.style}</p> : null}
        </div>
        {recommendation.score ? (
          <span className="shrink-0 text-xs text-mist">
            {t.score} {recommendation.score}
          </span>
        ) : null}
      </div>

      {units.length ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-mist">{t.units}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {units.map((unit) => {
              const tile = <UnitHex name={unit.name} cost={unit.cost} icon={unit.icon} size={24} />;
              return unit.slug ? (
                <Link key={unit.name} href={`/${lang}/champions/${unit.slug}`} aria-label={unit.name} className="smooth shrink-0 hover:opacity-80">
                  {tile}
                </Link>
              ) : (
                <span key={unit.name} title={unit.name} className="shrink-0">
                  {tile}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {items.length || augments.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {items.length ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.items}</span>
              {items.slice(0, 4).map((item) => (
                <Link key={item.name} href={`/${lang}/items?q=${encodeURIComponent(item.name)}`} aria-label={item.name} className="smooth hover:opacity-80">
                  <ItemHex name={item.name} icon={item.icon} size={18} />
                </Link>
              ))}
            </span>
          ) : null}
          {augments.length ? (
            <span className="flex flex-wrap items-center gap-1">
              <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.augments}</span>
              {augments.slice(0, 4).map((augment) => (
                <Link key={augment.name} href={`/${lang}/augments?q=${encodeURIComponent(augment.name)}`} aria-label={augment.name} className="smooth hover:opacity-80">
                  <AugmentTile name={augment.name} icon={augment.icon} size={18} />
                </Link>
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      {recommendation.reasons.length ? (
        <p className="mt-2 text-xs leading-relaxed text-mist">{recommendation.reasons.slice(0, 2).join(' ')}</p>
      ) : null}
      <Link href={`/${lang}/tierlist/comps/${slug}`} className="smooth mt-2 inline-flex text-xs font-semibold text-brand hover:text-fog">
        {t.viewComp} {'\u2192'}
      </Link>
    </li>
  );
}

function AssistantBubble({
  message,
  lang,
  feedback,
  copied,
  speaking,
  onCopy,
  onSpeak,
  onRate,
  onFollowUp,
  statusLabel,
  speechLockedLabel,
}: {
  message: ChatMessage;
  lang: Lang;
  feedback: boolean | undefined;
  copied: boolean;
  speaking: boolean;
  onCopy: () => void;
  onSpeak: () => void;
  onRate: (response: AssistantResponse, helpful: boolean) => Promise<void>;
  onFollowUp: (question: string) => void;
  statusLabel: string | null;
  speechLockedLabel: string | null;
}) {
  const t = uiMessages[lang].assistant;
  const response = message.response;
  const limitations = response ? [...new Set(response.limitations)].slice(0, 4) : [];

  return (
    <div data-message-id={message.id} className="flex scroll-mt-5 justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-util px-4 py-3 text-sm leading-relaxed text-fog sm:max-w-[85%]">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TomoSprite />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">{t.mascotName}</span>
          {message.voiceResponse ? (
            <span className="inline-flex items-center gap-1 rounded border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand" title={t.voiceAnswer}>
              <svg viewBox="0 0 20 20" aria-hidden className="h-3.5 w-3.5 fill-none stroke-current stroke-[1.7]">
                <path d="M3 8v4h3l4 3V5L6 8H3Z" strokeLinejoin="round" />
                <path d="M13 7.5a4 4 0 0 1 0 5M15 5a7.5 7.5 0 0 1 0 10" strokeLinecap="round" />
              </svg>
              {t.voiceAnswer}
            </span>
          ) : null}
          {response ? (
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold text-mist">
              {response.mode === 'llm' ? t.llmMode : t.dataMode}
            </span>
          ) : null}
          {statusLabel ? <span className="rounded border border-tier-a/50 px-1.5 py-0.5 text-[10px] font-semibold text-tier-a">{statusLabel}</span> : null}
        </div>
        <p className="whitespace-pre-wrap">{message.content}</p>

        {response?.sections?.length ? (
          <div className="mt-2 flex flex-col gap-2">
            {response.sections.map((section, index) => (
              <div key={`${section.heading}-${index}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">{section.heading}</p>
                <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-mist">
                  {section.points.map((point, pointIndex) => (
                    <li key={`${point}-${pointIndex}`}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {response?.mentions?.length ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {response.mentions.map((ref) => {
              // Route segments are plural: champions/items/traits/augments.
              const base = { champion: 'champions', item: 'items', trait: 'traits', augment: 'augments' }[ref.type];
              const href = ref.slug
                ? `/${lang}/${base}/${ref.slug}`
                : `/${lang}/${base}?q=${encodeURIComponent(ref.name)}`;
              const tile =
                ref.type === 'champion' ? (
                  <UnitHex name={ref.name} cost={ref.cost ?? 1} icon={ref.icon} size={22} />
                ) : ref.type === 'trait' ? (
                  <ItemHex name={ref.name} icon={ref.icon} size={16} />
                ) : (
                  <AugmentTile name={ref.name} icon={ref.icon} size={20} />
                );
              return (
                <Link
                  key={ref.id}
                  href={href}
                  className="smooth flex items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pr-2 pl-0.5 text-[11px] font-medium text-mist hover:border-brand hover:text-fog"
                >
                  {tile}
                  <span className="max-w-44 truncate">{ref.name}</span>
                </Link>
              );
            })}
          </div>
        ) : null}

        {response?.recommendations.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.recommendations}</p>
            <ul className="flex flex-col gap-2">
              {response.recommendations.slice(0, 3).map((recommendation) => (
                <RecommendationCard key={recommendation.compId} recommendation={recommendation} lang={lang} />
              ))}
            </ul>
          </div>
        ) : null}

        {response?.sources.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.sources}</p>
            <div className="flex flex-wrap gap-2">
              {response.sources.map((source) => (
                <Link key={source.id} href={source.url} className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand hover:text-fog">
                  {source.title}
                  <span className="ml-1 font-normal text-[10px] text-mist/70">{source.version}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {limitations.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.limitations}</p>
            <ul className="list-inside list-disc text-xs text-mist">
              {limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {response?.followUpQuestions.length ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-mist">{t.followUps}</p>
            <div className="flex flex-wrap gap-2">
              {response.followUpQuestions.slice(0, 3).map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => onFollowUp(question)}
                  className="smooth rounded-full border border-line bg-panel px-2.5 py-1 text-left text-xs font-semibold text-mist hover:border-brand hover:text-fog"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {response ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button
              type="button"
              onClick={onSpeak}
              disabled={speechLockedLabel !== null && !speaking}
              title={speechLockedLabel ?? undefined}
              aria-label={speechLockedLabel ?? (speaking ? t.voiceStopSpeaking : t.voiceReplay)}
              className="smooth inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand hover:text-fog disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line disabled:hover:text-mist"
            >
              <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4 fill-none stroke-current stroke-[1.7]">
                {speaking ? (
                  <path d="M7 5h2v10H7zM11 5h2v10h-2z" fill="currentColor" stroke="none" />
                ) : (
                  <>
                    <path d="M3 8v4h3l4 3V5L6 8H3Z" strokeLinejoin="round" />
                    <path d="M13 7.5a4 4 0 0 1 0 5M15 5a7.5 7.5 0 0 1 0 10" strokeLinecap="round" />
                  </>
                )}
              </svg>
              {speechLockedLabel ?? (speaking ? t.voiceStopSpeaking : t.voiceReplay)}
            </button>
            <button type="button" onClick={onCopy} className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand hover:text-fog">
              {copied ? t.copied : t.copy}
            </button>
            <span className="text-[11px] text-mist">{t.feedbackPrompt}</span>
            {feedback === undefined ? (
              <>
                <button
                  type="button"
                  onClick={() => void onRate(response, true)}
                  className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-tier-c hover:text-tier-c"
                >
                  {t.helpful}
                </button>
                <button
                  type="button"
                  onClick={() => void onRate(response, false)}
                  className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-tier-s hover:text-tier-s"
                >
                  {t.notHelpful}
                </button>
              </>
            ) : (
              <span className="text-[11px] text-tier-c">{t.feedbackThanks}</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
