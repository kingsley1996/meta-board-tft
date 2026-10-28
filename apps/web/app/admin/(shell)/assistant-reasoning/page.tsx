import Link from 'next/link';
import { AdminPageHeader, btnGhost, inputCls } from '@/components/admin/ui';
import { sessionCookieHeader } from '@/lib/session';
import { backendJson } from '@/lib/backend';
import { prettyString } from '@/lib/trace-format';

export const dynamic = 'force-dynamic';

type ReasoningStep = {
  id: string;
  conversation_id: string;
  request_id: string;
  step: string;
  step_index: number;
  intent: string | null;
  mode: string | null;
  status: string | null;
  input_summary: string | null;
  output_summary: string | null;
  details: Record<string, unknown>;
  duration_ms: number | null;
  created_at: string;
};

type ReasoningTrace = {
  requestId: string;
  conversationId: string;
  startedAt: string;
  steps: ReasoningStep[];
};

type ReasoningResponse = {
  traces: ReasoningTrace[];
  total: number;
  limit: number;
  offset: number;
};

type SearchParams = Promise<{ requestId?: string | string[]; conversationId?: string | string[]; offset?: string | string[] }>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 50;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

const STEP_LABELS: Record<string, string> = {
  intent_detection: 'Intent',
  entity_resolution: 'Entities',
  tool_call: 'Tools',
  llm_generation: 'Generation',
  validation: 'Validation',
  fallback: 'Fallback',
  deterministic_answer: 'Answer',
};

function queryHref(requestId: string, conversationId: string, offset: number): string {
  const params = new URLSearchParams();
  if (requestId) params.set('requestId', requestId);
  if (conversationId) params.set('conversationId', conversationId);
  if (offset > 0) params.set('offset', String(offset));
  return `/admin/assistant-reasoning?${params.toString()}`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function duration(ms: number | null): string | null {
  if (ms === null) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function span(steps: ReasoningStep[]): number {
  if (!steps.length) return 0;
  const first = new Date(steps[0].created_at).getTime();
  const last = new Date(steps[steps.length - 1].created_at).getTime();
  return Math.max(0, last - first);
}

function lastWith<T>(steps: ReasoningStep[], pick: (step: ReasoningStep) => T | null): T | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const value = pick(steps[index]);
    if (value !== null) return value;
  }
  return null;
}

function statusClass(status: string | null): string {
  if (status === 'error' || status === 'insufficient_data') return 'text-tier-s';
  if (status === 'needs_clarification') return 'text-tier-a';
  if (status === 'answered') return 'text-tier-c';
  return 'text-mist';
}

function stepBadgeClass(step: ReasoningStep): string {
  if (step.status === 'error' || step.status === 'insufficient_data') return 'border-tier-s/40 bg-tier-s/10 text-tier-s';
  if (step.step === 'fallback') return 'border-tier-a/40 bg-tier-a/10 text-tier-a';
  if (step.step === 'deterministic_answer') return 'border-tier-c/40 bg-tier-c/10 text-tier-c';
  return 'border-brand/40 bg-brand/10 text-brand';
}

function DetailRow({ name, text }: { name?: string; text: string }) {
  return (
    <p className="break-words font-mono">
      {name ? <span className="font-bold text-fog">{name}: </span> : null}
      {text}
    </p>
  );
}

function DetailValue({ name, value }: { name?: string; value: unknown }) {
  if (value !== null && typeof value === 'object') {
    const entries: [string, unknown][] = Array.isArray(value)
      ? value.map((item, index) => [`[${index}]`, item])
      : Object.entries(value);
    if (!entries.length) return <DetailRow name={name} text={Array.isArray(value) ? '[]' : '{}'} />;
    return (
      <div className="flex flex-col gap-1">
        {name ? <p className="break-words font-mono font-bold text-fog">{name}</p> : null}
        <div className="flex flex-col gap-1 border-l border-line pl-3">
          {entries.map(([key, item]) => <DetailValue key={key} name={key} value={item} />)}
        </div>
      </div>
    );
  }
  if (typeof value === 'string') {
    const text = prettyString(value);
    if (!text.includes('\n')) return <DetailRow name={name} text={text} />;
    return (
      <div className="flex flex-col gap-1">
        {name ? <p className="break-words font-mono font-bold text-fog">{name}</p> : null}
        <pre className="whitespace-pre-wrap break-words rounded bg-panel p-2 font-mono">{text}</pre>
      </div>
    );
  }
  return <DetailRow name={name} text={value === null ? 'null' : String(value)} />;
}

function TraceCard({ trace }: { trace: ReasoningTrace }) {
  const question = trace.steps.find((step) => step.input_summary)?.input_summary ?? '';
  const intent = trace.steps.find((step) => step.intent)?.intent ?? null;
  const mode = lastWith(trace.steps, (step) => step.mode);
  const status = lastWith(trace.steps, (step) => step.status);
  const errorCount = trace.steps.filter((step) => step.status === 'error' || step.status === 'insufficient_data').length;
  const totalMs = span(trace.steps);

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4">
      {question ? <p className="break-words text-sm font-semibold text-fog">{question}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist">
        <time dateTime={trace.startedAt}>{new Date(trace.startedAt).toLocaleString()}</time>
        {intent ? <span>Intent: <strong className="font-semibold text-fog">{intent}</strong></span> : null}
        {mode ? <span>Mode: {mode}</span> : null}
        {status ? <span className={statusClass(status)}>Status: {status}</span> : null}
        <span>{trace.steps.length} steps</span>
        {totalMs > 0 ? <span title="Time between the first and last trace event">{duration(totalMs)}</span> : null}
        {errorCount ? <span className="font-semibold text-tier-s">{errorCount} error{errorCount === 1 ? '' : 's'}</span> : null}
        <span className="ml-auto flex flex-wrap gap-3">
          <Link href={queryHref(trace.requestId, '', 0)} className="font-mono break-all hover:text-fog">
            Request {shortId(trace.requestId)}
          </Link>
          <Link href={queryHref('', trace.conversationId, 0)} className="font-mono break-all hover:text-fog">
            Conversation {shortId(trace.conversationId)}
          </Link>
        </span>
      </div>

      <ol className="flex flex-col gap-4 border-l border-line pl-4">
        {trace.steps.map((step) => (
          <li key={step.id} className="relative flex flex-col gap-1">
            <span className="absolute top-2 -left-[21px] h-2 w-2 rounded-full border border-panel bg-brand" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-mist">#{step.step_index}</span>
              <span className={`rounded border px-2 py-0.5 text-[11px] font-bold ${stepBadgeClass(step)}`}>
                {STEP_LABELS[step.step] ?? step.step}
              </span>
              {step.status ? <span className={`text-[11px] ${statusClass(step.status)}`}>{step.status}</span> : null}
              {step.duration_ms !== null ? <span className="text-[11px] text-mist">{duration(step.duration_ms)}</span> : null}
            </div>
            {step.output_summary ? <p className="break-words text-xs text-mist">{step.output_summary}</p> : null}
            {Object.keys(step.details ?? {}).length ? (
              <details className="text-xs text-mist">
                <summary className="cursor-pointer text-[11px] font-semibold hover:text-fog">Details</summary>
                <div className="mt-1 flex flex-col gap-2 rounded-lg bg-page p-3">
                  {Object.entries(step.details).map(([key, value]) => (
                    <DetailValue key={key} name={key} value={value} />
                  ))}
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </article>
  );
}

export default async function AdminAssistantReasoningPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const requestId = first(params.requestId).trim();
  const conversationId = first(params.conversationId).trim();
  const rawOffset = first(params.offset) || '0';
  const parsedOffset = Number(rawOffset);
  const offset = Number.isSafeInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const invalidFilter = (requestId && !UUID_PATTERN.test(requestId)) || (conversationId && !UUID_PATTERN.test(conversationId));
  const cookie = await sessionCookieHeader();
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
  if (requestId && !invalidFilter) query.set('requestId', requestId);
  if (conversationId && !invalidFilter) query.set('conversationId', conversationId);
  const data = invalidFilter
    ? null
    : await backendJson<ReasoningResponse>(`/api/admin/assistant-reasoning?${query.toString()}`, {
        headers: { cookie },
      });
  if (!invalidFilter && !data) throw new Error('backend is unreachable');

  return (
    <>
      <AdminPageHeader
        title="Assistant reasoning"
        sub="One card per request. Steps follow the coach's order: intent, entities, tool calls, every model call (provider, model, messages, raw response, retries), validation, fallback and answer. The near-constant system prompt is stored as a hash + preview; per-request evidence stays in the messages. No hidden chain-of-thought."
      />

      <form action="/admin/assistant-reasoning" className="grid gap-3 rounded-xl border border-line bg-panel p-4 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">
          Request ID
          <input name="requestId" defaultValue={requestId} className={inputCls} placeholder="UUID" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-mist">
          Conversation ID
          <input name="conversationId" defaultValue={conversationId} className={inputCls} placeholder="UUID" />
        </label>
        <button type="submit" className={btnGhost}>Filter</button>
        <Link href="/admin/assistant-reasoning" className={btnGhost}>Clear</Link>
      </form>

      {invalidFilter ? <p role="alert" className="text-sm text-tier-s">Enter a valid UUID for each filter.</p> : null}
      {data ? (
        <>
          <p className="text-xs text-mist">
            Showing {data.traces.length ? offset + 1 : 0}–{offset + data.traces.length} of {data.total} requests.
          </p>
          <div className="flex flex-col gap-4">
            {data.traces.map((trace) => (
              <TraceCard key={trace.requestId} trace={trace} />
            ))}
          </div>
          {!data.traces.length ? <p className="text-sm text-mist">No reasoning events found.</p> : null}
          <div className="flex justify-between">
            {offset > 0 ? <Link href={queryHref(requestId, conversationId, Math.max(0, offset - PAGE_SIZE))} className={btnGhost}>Previous</Link> : <span />}
            {offset + data.traces.length < data.total ? <Link href={queryHref(requestId, conversationId, offset + PAGE_SIZE)} className={btnGhost}>Next</Link> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
