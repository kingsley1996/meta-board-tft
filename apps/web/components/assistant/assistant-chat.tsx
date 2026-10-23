'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AugmentTile, ItemHex, Panel, UnitHex, tierColor } from '@/components/ui';
import type { AssistantRecommendation } from '@/lib/api';
import type { Tier } from '@/lib/tiers';
import {
  AssistantApiError,
  askAssistant,
  sendAssistantFeedback,
  type AssistantQueryRequest,
  type AssistantResponse,
} from '@/lib/api';
import type { Lang } from '@/lib/i18n';
import { messages as uiMessages } from '@/lib/messages';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  voiceResponse?: boolean;
  response?: AssistantResponse;
};

type StoredChat = { conversationId?: string; messages?: ChatMessage[] };

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal: boolean };

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type SherpaVoiceSession = {
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

function closeSherpaSession(session: SherpaVoiceSession): Promise<void> {
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

function historyFor(messages: ChatMessage[], excludeLastUser: boolean): { role: 'user' | 'assistant'; content: string }[] {
  const base = excludeLastUser && messages[messages.length - 1]?.role === 'user' ? messages.slice(0, -1) : messages;
  return base
    .filter((message) => message.role === 'user' || message.response)
    .slice(-6)
    .map(({ role, content }) => ({ role, content }));
}

export function AssistantChat({ lang, compSlug, compTitle }: { lang: Lang; compSlug: string | null; compTitle: string | null }) {
  const t = uiMessages[lang].assistant;
  const storageKey = `metaboard:assistant:${lang}`;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);
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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const sherpaSessionRef = useRef<SherpaVoiceSession | null>(null);
  const speechRequestRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const voiceBaseRef = useRef('');
  const voiceTranscriptRef = useRef('');
  const autoSubmitVoiceRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadStored(storageKey);
    setMessages(stored.messages ?? []);
    setConversationId(stored.conversationId);
    setHydrated(true);
  }, [storageKey]);

  useEffect(
    () => () => {
      autoSubmitVoiceRef.current = false;
      recognitionRef.current?.stop();
      const session = sherpaSessionRef.current;
      sherpaSessionRef.current = null;
      if (session) void closeSherpaSession(session).catch((caught: unknown) => console.error('Could not close Sherpa audio session', caught));
      speechRequestRef.current?.abort();
      audioRef.current?.pause();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      window.speechSynthesis?.cancel();
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
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, loading]);

  function errorText(caught: unknown): string {
    if (caught instanceof AssistantApiError) {
      if (caught.status === 429) return t.errors.rate;
      if (caught.code === 'assistant_disabled') return t.errors.disabled;
      if (caught.status === 504) return t.errors.timeout;
    }
    return t.errors.generic;
  }

  function stopAnswerSpeech() {
    speechRequestRef.current?.abort();
    speechRequestRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setSpeakingMessageId(null);
  }

  async function speakAnswer(answer: string, messageId: string) {
    stopAnswerSpeech();
    setSpeechError(null);
    const controller = new AbortController();
    speechRequestRef.current = controller;
    setSpeaking(true);
    setSpeakingMessageId(messageId);
    try {
      const response = await fetch('/api/voice/tts/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: answer }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 503) {
        setSpeechError(t.voiceTtsUnavailable);
        setSpeaking(false);
        setSpeakingMessageId(null);
        return;
      }
      if (!response.ok) throw new Error(`VieNeu TTS responded ${response.status}`);
      const audioUrl = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted) {
        URL.revokeObjectURL(audioUrl);
        return;
      }
      const audio = new Audio(audioUrl);
      audioUrlRef.current = audioUrl;
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        audioUrlRef.current = null;
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
        setSpeakingMessageId(null);
      };
      audio.onerror = () => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        audioUrlRef.current = null;
        URL.revokeObjectURL(audioUrl);
        setSpeaking(false);
        setSpeakingMessageId(null);
        setSpeechError(t.voiceSpeechError);
      };
      await audio.play();
    } catch (caught) {
      if (controller.signal.aborted) return;
      console.error('VieNeu speech playback failed', caught);
      stopAnswerSpeech();
      setSpeechError(t.voiceSpeechError);
    } finally {
      if (speechRequestRef.current === controller) speechRequestRef.current = null;
    }
  }

  async function submit(raw: string, addUser = true, speakResponse = false) {
    const text = raw.trim();
    if (!text || loading) return;
    if (addUser) stopAnswerSpeech();
    setError(null);
    setRetryText(null);
    setSpeechError(null);
    if (addUser) {
      setMessages((current) => [...current, { id: makeId(), role: 'user', content: text }]);
      setInput('');
    }
    setLoading(true);
    const request: AssistantQueryRequest = {
      message: text,
      lang,
      conversationId,
      history: historyFor(messages, !addUser),
      context: { pageType: compSlug ? 'comp' : 'assistant', compSlug, entityIds: [] },
    };
    try {
      const response = await askAssistant(request);
      setConversationId(response.conversationId);
      const assistantMessageId = makeId();
      setMessages((current) => [
        ...current,
        { id: assistantMessageId, role: 'assistant', content: response.answer, response, voiceResponse: speakResponse },
      ]);
      if (speakResponse) void speakAnswer(response.answer, assistantMessageId);
    } catch (caught) {
      setError(errorText(caught));
      setRetryText(text);
    } finally {
      setLoading(false);
    }
  }

  async function startSherpaVoiceInput() {
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
        setVoiceError(t.voiceSherpaError);
        return;
      }
      const status = (await statusResponse.json()) as { available?: boolean };
      if (!status.available) {
        setVoiceError(t.voiceSherpaUnavailable);
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      audioContext = new AudioContext();
      await audioContext.resume();
      await audioContext.audioWorklet.addModule('/audio-capture-processor.js');
      const source = audioContext.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(audioContext, 'metaboard-audio-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      const session: SherpaVoiceSession = {
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
      sherpaSessionRef.current = session;
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

  async function stopSherpaVoiceInput() {
    const session = sherpaSessionRef.current;
    if (!session) return;
    sherpaSessionRef.current = null;
    setListening(false);
    setVoiceTranscribing(true);
    try {
      await closeSherpaSession(session);
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
        headers: { 'Content-Type': 'application/octet-stream', 'X-Sample-Rate': '16000' },
        body: floatSamplesToBuffer(resampled.getChannelData(0)),
      });
      if (response.status === 413) {
        setVoiceError(t.voiceTooLong);
        return;
      }
      if (response.status === 503) {
        setVoiceError(t.voiceSherpaUnavailable);
        return;
      }
      if (response.status === 429) {
        setVoiceError(t.voiceBusy);
        return;
      }
      const result = (await response.json()) as { text?: unknown; error?: unknown };
      if (response.status === 422 || result.error === 'no_speech') {
        setVoiceError(t.voiceNoSpeech);
        return;
      }
      if (!response.ok || typeof result.text !== 'string') {
        setVoiceError(t.voiceSherpaError);
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
      await submit(question, true, true);
    } catch (caught) {
      console.error('Sherpa transcription failed', caught);
      setVoiceError(t.voiceSherpaError);
    } finally {
      setVoiceTranscribing(false);
    }
  }

  function cancelSherpaVoiceInput() {
    const session = sherpaSessionRef.current;
    sherpaSessionRef.current = null;
    if (session) void closeSherpaSession(session).catch((caught: unknown) => console.error('Could not close Sherpa audio session', caught));
    setListening(false);
  }

  function toggleVoiceInput() {
    if (lang === 'vi') {
      if (sherpaSessionRef.current) void stopSherpaVoiceInput();
      else if (!voiceStarting && !voiceTranscribing) void startSherpaVoiceInput();
      return;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceError(t.voiceUnsupported);
      return;
    }

    setVoiceError(null);
    setSpeechError(null);
    stopAnswerSpeech();
    voiceBaseRef.current = input.trim();
    voiceTranscriptRef.current = '';
    autoSubmitVoiceRef.current = true;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? '';
        if (result.isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      const transcript = `${finalTranscript}${interimTranscript}`.trim();
      voiceTranscriptRef.current = finalTranscript.trim();
      const base = voiceBaseRef.current;
      setInput(`${base}${base && transcript ? ' ' : ''}${transcript}`.slice(0, 2000));
    };
    recognition.onerror = (event) => {
      if (event.error !== 'aborted') autoSubmitVoiceRef.current = false;
      if (event.error === 'not-allowed') {
        setVoiceError(t.voicePermission);
      } else if (event.error === 'service-not-allowed') {
        setVoiceError(t.voiceServiceUnavailable);
      } else if (event.error === 'no-speech') {
        setVoiceError(t.voiceNoSpeech);
      } else if (event.error === 'audio-capture') {
        setVoiceError(t.voiceNoMicrophone);
      } else if (event.error === 'network') {
        setVoiceError(t.voiceNetwork);
      } else if (event.error === 'language-not-supported') {
        setVoiceError(t.voiceLanguageUnavailable);
      } else if (event.error !== 'aborted') {
        setVoiceError(t.voiceError);
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      const transcript = voiceTranscriptRef.current;
      const shouldAutoSubmit = autoSubmitVoiceRef.current;
      const shouldSubmit = shouldAutoSubmit && !!transcript;
      autoSubmitVoiceRef.current = false;
      voiceTranscriptRef.current = '';
      if (shouldSubmit) {
        const base = voiceBaseRef.current;
        void submit(`${base}${base ? ' ' : ''}${transcript}`, true, true);
      } else if (shouldAutoSubmit && !transcript) {
        setVoiceError(t.voiceNoSpeech);
      }
    };
    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError(t.voiceError);
    }
  }

  function newChat() {
    if (loading) return;
    stopAnswerSpeech();
    autoSubmitVoiceRef.current = false;
    recognitionRef.current?.stop();
    cancelSherpaVoiceInput();
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setError(null);
    setVoiceError(null);
    setSpeechError(null);
    setRetryText(null);
    setFeedback({});
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      // Ignore storage failures.
    }
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

  return (
    <Panel className="mx-auto flex min-h-[68vh] w-full max-w-4xl flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-fog">{t.assistant}</p>
          {compTitle || compSlug ? <p className="truncate text-xs text-mist">{t.context(compTitle ?? compSlug ?? '')}</p> : null}
        </div>
        <button type="button" onClick={newChat} className="smooth rounded-md border border-line bg-util px-3 py-1.5 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog">
          {t.clear}
        </button>
      </div>

      <div role="log" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5">
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
                  className="smooth rounded-full border border-line bg-util px-3 py-1.5 text-left text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
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
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-brand-hot px-4 py-2.5 text-sm leading-relaxed text-white">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-white/70">{t.you}</span>
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
              onSpeak={() => (speakingMessageId === message.id ? stopAnswerSpeech() : void speakAnswer(message.content, message.id))}
              onCopy={() => void copyAnswer(message)}
              onRate={rate}
              onFollowUp={(question) => void submit(question)}
              statusLabel={message.response ? statusLabel(message.response) : null}
            />
          )
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-mist" role="status">
            <span className="h-2 w-2 animate-pulse rounded-full bg-brand" />
            {t.sending}
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-t border-tier-s/40 bg-tier-s/10 px-4 py-2.5 text-sm text-fog">
          <span>{error}</span>
          {retryText ? (
            <button type="button" onClick={() => void submit(retryText, false)} className="smooth rounded-md border border-line bg-panel px-3 py-1 text-xs font-semibold hover:border-brand-soft">
              {t.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
        className="border-t border-line bg-panel p-3"
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
            placeholder={t.placeholder}
            aria-label={t.placeholder}
            className="min-h-12 flex-1 resize-none rounded-lg border border-line bg-page px-3 py-2 text-sm text-fog outline-none placeholder:text-mist focus:border-brand-soft"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="smooth h-12 rounded-lg border border-brand-hot bg-brand-hot px-5 text-sm font-semibold text-white hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? t.sending : t.send}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-mist">{t.disclaimer}</p>
      </form>
    </Panel>
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
          <Link href={`/${lang}/tierlist/comps/${slug}`} className="smooth flex min-w-0 flex-1 items-start gap-2 text-sm font-semibold text-fog hover:text-brand-soft">
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
      <Link href={`/${lang}/tierlist/comps/${slug}`} className="smooth mt-2 inline-flex text-xs font-semibold text-brand-soft hover:text-fog">
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
  onSpeak,
  onCopy,
  onRate,
  onFollowUp,
  statusLabel,
}: {
  message: ChatMessage;
  lang: Lang;
  feedback: boolean | undefined;
  copied: boolean;
  speaking: boolean;
  onSpeak: () => void;
  onCopy: () => void;
  onRate: (response: AssistantResponse, helpful: boolean) => Promise<void>;
  onFollowUp: (question: string) => void;
  statusLabel: string | null;
}) {
  const t = uiMessages[lang].assistant;
  const response = message.response;
  const limitations = response ? [...new Set(response.limitations)].slice(0, 4) : [];

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-line bg-util px-4 py-3 text-sm leading-relaxed text-fog sm:max-w-[85%]">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-soft">{t.assistant}</span>
          {message.voiceResponse ? (
            <span className="inline-flex items-center gap-1 rounded border border-brand-soft/40 bg-brand-soft/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-soft" title={t.voiceAnswer}>
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
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-soft">{section.heading}</p>
                <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-mist">
                  {section.points.map((point, pointIndex) => (
                    <li key={`${point}-${pointIndex}`}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
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
                <Link key={source.id} href={source.url} className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog">
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
                  className="smooth rounded-full border border-line bg-panel px-2.5 py-1 text-left text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {response ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            {message.voiceResponse ? (
              <button
                type="button"
                onClick={onSpeak}
                aria-label={speaking ? t.voiceStopSpeaking : t.voiceReplay}
                className="smooth inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog"
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
                {speaking ? t.voiceStopSpeaking : t.voiceReplay}
              </button>
            ) : null}
            <button type="button" onClick={onCopy} className="smooth rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-semibold text-mist hover:border-brand-soft hover:text-fog">
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
