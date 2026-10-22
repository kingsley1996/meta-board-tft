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
  response?: AssistantResponse;
};

type StoredChat = { conversationId?: string; messages?: ChatMessage[] };

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = loadStored(storageKey);
    setMessages(stored.messages ?? []);
    setConversationId(stored.conversationId);
    setHydrated(true);
  }, [storageKey]);

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

  async function submit(raw: string, addUser = true) {
    const text = raw.trim();
    if (!text || loading) return;
    setError(null);
    setRetryText(null);
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
      setMessages((current) => [...current, { id: makeId(), role: 'assistant', content: response.answer, response }]);
    } catch (caught) {
      setError(errorText(caught));
      setRetryText(text);
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    if (loading) return;
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setError(null);
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
  onCopy,
  onRate,
  onFollowUp,
  statusLabel,
}: {
  message: ChatMessage;
  lang: Lang;
  feedback: boolean | undefined;
  copied: boolean;
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
