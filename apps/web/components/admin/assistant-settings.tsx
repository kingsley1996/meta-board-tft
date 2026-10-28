'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveAssistantSettings, type AssistantSettingEntry, type AssistantSettingsView } from '@/lib/api';
import { btnGhost, btnPrimary, inputCls } from '@/components/admin/ui';

const sourceBadge: Record<AssistantSettingEntry['source'], string> = {
  database: 'border-brand/40 bg-brand/15 text-fog',
  environment: 'border-line bg-page text-mist',
  unset: 'border-dashed border-line text-mist',
};

function Field({
  entry,
  value,
  error,
  onChange,
}: {
  entry: AssistantSettingEntry;
  value: string;
  error?: string;
  onChange: (next: string) => void;
}) {
  const id = `setting-${entry.env}`;
  const control =
    entry.kind === 'provider' || entry.kind === 'bool' ? (
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={`${inputCls} min-w-[190px]`}>
        <option value="">host environment{entry.source === 'unset' ? ' (not set)' : ''}</option>
        {(entry.options ?? (entry.kind === 'bool' ? ['true', 'false'] : [])).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    ) : (
      <input
        id={id}
        value={value}
        placeholder={entry.placeholder}
        type={entry.kind === 'int' ? 'number' : 'text'}
        min={entry.min}
        max={entry.max}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className={`${inputCls} min-w-[190px] flex-1 font-mono`}
      />
    );

  return (
    <div className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-fog">
          {entry.label}
        </label>
        <code className="text-[11px] text-mist">{entry.env}</code>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${sourceBadge[entry.source]}`}>
          {entry.source === 'database' ? `saved: ${entry.databaseValue}` : entry.source === 'environment' ? 'from env' : 'unset'}
        </span>
      </div>
      <div className="flex items-center gap-2">{control}</div>
      <p className="text-xs text-mist">{entry.hint}</p>
      {error ? <p className="text-xs font-semibold text-tier-s">{error}</p> : null}
    </div>
  );
}

export function AssistantSettingsForm({ initial }: { initial: AssistantSettingsView }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.settings.map((entry) => [entry.env, entry.value]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const provider = (draft.ASSISTANT_PROVIDER || view.active.provider) as AssistantSettingsView['active']['provider'];
  // Model ids only mean something to the adapter that is currently selected.
  const visible = view.settings.filter((entry) => !entry.provider || entry.provider === provider);

  const changes = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const entry of view.settings) {
      const next = (draft[entry.env] ?? '').trim();
      if (next === entry.value) continue;
      out[entry.env] = next || null;
    }
    return out;
  }, [draft, view]);
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    setBusy(true);
    setErrors({});
    const result = await saveAssistantSettings(changes);
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fields);
      if (!Object.keys(result.fields).length) setErrors({ '(request)': result.error });
      return;
    }
    setView(result.view);
    setDraft(Object.fromEntries(result.view.settings.map((entry) => [entry.env, entry.value])));
    setSavedAt(new Date().toLocaleTimeString());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-brand/40 bg-panel p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-mist">Answering right now</p>
          <p className="font-display text-2xl font-bold text-fog">
            {view.active.provider} <span className="text-brand">/</span> {view.active.model}
          </p>
          <p className="mt-1 text-xs text-mist">
            Read back from the live process after the last save, so it is what the next answer uses.
            {savedAt ? ` Saved at ${savedAt}.` : ''}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-[11px] font-bold uppercase tracking-widest text-mist">Credentials (not editable here)</p>
          <ul className="mt-1 flex flex-col gap-1">
            {view.credentials.map((credential) => (
              <li key={credential.env} className="flex items-baseline justify-between gap-3 text-xs">
                <code className="text-fog">{credential.env}</code>
                <span className={credential.present ? 'font-semibold text-tier-a' : 'text-mist'}>
                  {credential.present ? 'set' : 'not set'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-mist">
            Keys stay in the host environment on purpose: putting them in a readable database row would be a downgrade.
          </p>
        </div>
      </div>

      {view.warnings.length ? (
        <ul className="flex flex-col gap-1 rounded-xl border border-tier-s/50 bg-panel p-4">
          {view.warnings.map((warning) => (
            <li key={warning} className="text-xs font-semibold text-tier-s">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        {visible.map((entry) => (
          <Field
            key={entry.env}
            entry={entry}
            value={draft[entry.env] ?? ''}
            error={errors[entry.env]}
            onChange={(next) => setDraft((current) => ({ ...current, [entry.env]: next }))}
          />
        ))}
      </div>

      {errors['(request)'] ? <p className="text-xs font-semibold text-tier-s">{errors['(request)']}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy || !dirty} className={btnPrimary}>
          {busy ? 'Saving…' : `Save${dirty ? ` (${Object.keys(changes).length})` : ''}`}
        </button>
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => {
            setDraft(Object.fromEntries(view.settings.map((entry) => [entry.env, entry.value])));
            setErrors({});
          }}
          className={btnGhost}
        >
          Discard edits
        </button>
        <p className="text-xs text-mist">
          Empty field = no override, so the value falls back to the host environment. Applies to this process immediately.
        </p>
      </div>
    </div>
  );
}
