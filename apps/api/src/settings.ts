import { pool } from './db.ts';
import { activeAssistantModel, activeAssistantProvider, type AssistantProviderId } from './assistant/provider.ts';

// Assistant/voice configuration that an admin can change without a redeploy.
//
// The whole assistant config path reads process.env on every request (see
// src/assistant/provider.ts), so instead of teaching each reader about a new
// source we keep one table of overrides and copy it onto process.env at boot and
// after every write. One precedence rule: a row in app_settings beats the host
// environment, and deleting the row hands the value back to the host environment.
//
// Deliberately absent: credentials. API keys stay in the platform's secret store
// because putting them in a readable database row is a downgrade; this module can
// only ever report whether a key is set.
export type SettingKind = 'provider' | 'model' | 'baseUrl' | 'ollamaUrl' | 'int' | 'bool';

export type AssistantSettingSpec = {
  env: string;
  label: string;
  hint: string;
  kind: SettingKind;
  provider?: AssistantProviderId;
  options?: readonly string[];
  min?: number;
  max?: number;
  placeholder?: string;
};

export const ASSISTANT_SETTING_SPECS: readonly AssistantSettingSpec[] = [
  {
    env: 'ASSISTANT_ENABLED',
    label: 'Assistant enabled',
    hint: 'Kill switch. When off, every /api/assistant request answers 503 assistant_disabled.',
    kind: 'bool',
  },
  {
    env: 'ASSISTANT_PROVIDER',
    label: 'Provider',
    hint: 'Which adapter answers. ollama needs a local model server; google and openai call out over the network.',
    kind: 'provider',
    options: ['ollama', 'google', 'openai'],
  },
  {
    env: 'ASSISTANT_MODEL',
    label: 'Ollama model',
    hint: 'Tag as it appears in `ollama list`, e.g. qwen3.5:9b.',
    kind: 'model',
    provider: 'ollama',
    placeholder: 'qwen3.5:9b',
  },
  {
    env: 'ASSISTANT_BASE_URL',
    label: 'Ollama server URL',
    hint: 'Loopback HTTP only — the code rejects anything else, so this cannot point the API at an external host.',
    kind: 'ollamaUrl',
    provider: 'ollama',
    placeholder: 'http://127.0.0.1:11434',
  },
  {
    env: 'GOOGLE_MODEL',
    label: 'Google model',
    hint: 'Gemini model id, e.g. gemini-3.5-flash-lite. Gemma ids take the no-tools fallback path.',
    kind: 'model',
    provider: 'google',
    placeholder: 'gemini-3.5-flash-lite',
  },
  {
    env: 'OPENAI_MODEL',
    label: 'Model id',
    hint: 'Sent verbatim as `model`. Also used when the gateway key is an OpenRouter one.',
    kind: 'model',
    provider: 'openai',
    placeholder: 'gpt-6-luna',
  },
  {
    env: 'OPENAI_BASE_URL',
    label: 'Base URL',
    hint: 'OpenAI-compatible root, no trailing /chat/completions. Shared with speech-to-text: the OpenAI STT provider falls back to this value, so changing it moves both.',
    kind: 'baseUrl',
    provider: 'openai',
    placeholder: 'https://api.shopaikey.com/v1',
  },
  {
    env: 'OPENROUTER_MODEL',
    label: 'OpenRouter model',
    hint: 'Only read when OPENAI_API_KEY is absent and an OpenRouter key is present.',
    kind: 'model',
    provider: 'openai',
    placeholder: 'google/gemma-4-31b-it:free',
  },
  {
    env: 'ASSISTANT_REQUEST_TIMEOUT_MS',
    label: 'Request timeout (ms)',
    hint: 'Deadline for one model call, including retries. Reasoning models need headroom here.',
    kind: 'int',
    min: 2_000,
    max: 180_000,
    placeholder: '90000',
  },
  {
    env: 'ASSISTANT_MAX_CONCURRENCY',
    label: 'Max concurrent model calls',
    hint: 'Per process. Protects the provider rate limit; other instances keep their own queue.',
    kind: 'int',
    min: 1,
    max: 16,
    placeholder: '2',
  },
  {
    env: 'ASSISTANT_RATE_LIMIT',
    label: 'Requests per client per minute',
    hint: 'Per visitor, not per model call.',
    kind: 'int',
    min: 1,
    max: 1_000,
    placeholder: '12',
  },
  {
    env: 'ASSISTANT_DAILY_REQUESTS',
    label: 'Requests per client per day',
    hint: 'Caps a single visitor’s daily spend.',
    kind: 'int',
    min: 1,
    max: 100_000,
    placeholder: '200',
  },
  {
    env: 'ASSISTANT_TOOL_RESULT_CHARS',
    label: 'Tool result budget (chars)',
    hint: 'How much comp/item data one tool round may put in the prompt. Bigger prompt, slower and more expensive answers.',
    kind: 'int',
    min: 200,
    max: 20_000,
    placeholder: '4000',
  },
];

// Never editable through this module, and never printed: they stay in the host
// environment. Listed so the UI can say which providers are actually usable.
export const CREDENTIAL_ENVIRONMENT_VARIABLES: readonly { env: string; providers: AssistantProviderId[]; note: string }[] = [
  { env: 'OPENAI_API_KEY', providers: ['openai'], note: 'any OpenAI-compatible gateway, including shopaikey' },
  { env: 'OPENROUTER_API_KEY', providers: ['openai'], note: 'used only when OPENAI_API_KEY is unset' },
  { env: 'GOOGLE_API_KEY', providers: ['google'], note: 'Gemini API key' },
];

const specsByEnv = new Map(ASSISTANT_SETTING_SPECS.map((spec) => [spec.env, spec]));

export function settingSpec(env: string): AssistantSettingSpec | undefined {
  return specsByEnv.get(env);
}

const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

function validateUrl(env: string, value: string, spec: AssistantSettingSpec): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${env} must be an absolute URL`;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `${env} must be http(s)`;
  if (url.username || url.password) return `${env} must not embed credentials`;
  if (spec.kind === 'ollamaUrl' && !(url.protocol === 'http:' && LOOPBACK_HOSTS.includes(url.hostname))) {
    return `${env} must be a loopback HTTP address`;
  }
  return null;
}

// Returns an error message, or null when the value is acceptable. An empty value
// means "no override", which is what makes reset-to-environment possible.
export function validateSettingValue(env: string, raw: unknown): string | null {
  const spec = specsByEnv.get(env);
  if (!spec) return `${env} is not a configurable setting`;
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return `${env} must be text`;
  const value = raw.trim();
  if (!value) return null;

  switch (spec.kind) {
    case 'provider':
      return spec.options!.includes(value.toLowerCase()) ? null : `${env} must be one of ${spec.options!.join(', ')}`;
    case 'bool':
      return value.toLowerCase() === 'true' || value.toLowerCase() === 'false' ? null : `${env} must be true or false`;
    case 'int': {
      const number = Number(value);
      if (!Number.isSafeInteger(number)) return `${env} must be a whole number`;
      if (spec.min !== undefined && number < spec.min) return `${env} must be at least ${spec.min}`;
      if (spec.max !== undefined && number > spec.max) return `${env} must be at most ${spec.max}`;
      return null;
    }
    case 'model':
      return MODEL_ID_PATTERN.test(value) ? null : `${env} is not a valid model id`;
    case 'baseUrl':
    case 'ollamaUrl':
      return validateUrl(env, value, spec);
  }
}

// The adapters compare these verbatim, so lowercase the enums and drop the
// trailing slash a pasted URL brings with it — `${base}/chat/completions` would
// otherwise double the separator.
function normalizeSettingValue(env: string, value: string): string {
  const spec = specsByEnv.get(env);
  if (!spec) return value;
  if (spec.kind === 'provider' || spec.kind === 'bool') return value.toLowerCase();
  if (spec.kind === 'baseUrl' || spec.kind === 'ollamaUrl') return value.replace(/\/+$/, '');
  return value;
}

// process.env is the only copy the adapters read, so deleting an override would
// also delete whatever the host environment provided at boot. Each key's original
// value is remembered on first touch and put back when the override is removed.
const hostValues = new Map<string, string | undefined>();

export function applyEnvSetting(env: string, value: string | null | undefined): void {
  if (!hostValues.has(env)) hostValues.set(env, process.env[env]);
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed) {
    process.env[env] = normalizeSettingValue(env, trimmed);
    return;
  }
  const host = hostValues.get(env);
  if (host === undefined) delete process.env[env];
  else process.env[env] = host;
}

// Test seam: a case that wants to simulate a different boot environment has to
// drop what this process already remembered about the previous one.
export function forgetHostValues(): void {
  hostValues.clear();
}

export type AssistantSettingEntry = AssistantSettingSpec & {
  value: string;
  source: 'database' | 'environment' | 'unset';
  databaseValue: string | null;
};

export type AssistantSettingsView = {
  settings: AssistantSettingEntry[];
  credentials: { env: string; providers: AssistantProviderId[]; note: string; present: boolean }[];
  active: { provider: AssistantProviderId; model: string };
  warnings: string[];
};

export function buildAssistantSettingsView(databaseValues: Map<string, string>): AssistantSettingsView {
  const settings = ASSISTANT_SETTING_SPECS.map((spec) => {
    const databaseValue = databaseValues.get(spec.env) ?? null;
    const environmentValue = typeof process.env[spec.env] === 'string' ? process.env[spec.env]!.trim() : '';
    return {
      ...spec,
      value: process.env[spec.env] ?? '',
      source: databaseValue ? 'database' : environmentValue ? 'environment' : 'unset',
      databaseValue,
    } satisfies AssistantSettingEntry;
  });

  const credentials = CREDENTIAL_ENVIRONMENT_VARIABLES.map((entry) => ({
    ...entry,
    present: Boolean((process.env[entry.env] ?? '').trim()),
  }));

  const provider = activeAssistantProvider();
  const warnings: string[] = [];
  if (provider === 'openai' && !credentials.some((c) => c.providers.includes('openai') && c.present)) {
    warnings.push('Provider is openai but neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set on the host, so the assistant will fail every answer.');
  }
  if (provider === 'google' && !credentials.some((c) => c.providers.includes('google') && c.present)) {
    warnings.push('Provider is google but GOOGLE_API_KEY is not set on the host, so the assistant will fail every answer.');
  }
  if (process.env.ASSISTANT_ENABLED === 'false') warnings.push('The assistant is switched off: every /api/assistant request currently returns 503.');

  return { settings, credentials, active: { provider, model: activeAssistantModel() }, warnings };
}

let tableReady: Promise<void> | undefined;

// Same trick as ensureAccountTables: schema.sql carries the CREATE TABLE for new
// databases, this keeps an existing deployment working without a migration step.
export function ensureSettingsTable(): Promise<void> {
  tableReady ??= pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )
  `).then(() => undefined);
  return tableReady;
}

export async function readAssistantSettings(): Promise<Map<string, string>> {
  await ensureSettingsTable();
  const { rows } = await pool.query('SELECT key, value FROM app_settings');
  return new Map(rows.map((row) => [row.key as string, row.value as string]));
}

// Called at boot: the database is the source of truth for anything it has a row
// for, so a restarted or second instance lands on the same model as the one the
// admin last picked in the UI.
export async function loadAssistantSettingsIntoEnv(): Promise<number> {
  const stored = await readAssistantSettings();
  let applied = 0;
  for (const [env, value] of stored) {
    if (!settingSpec(env)) continue;
    applyEnvSetting(env, value);
    applied += 1;
  }
  return applied;
}

export async function getAssistantSettingsView(): Promise<AssistantSettingsView> {
  return buildAssistantSettingsView(await readAssistantSettings());
}

export type SettingsWrite = { ok: true; view: AssistantSettingsView } | { ok: false; errors: Record<string, string> };

export async function updateAssistantSettings(values: unknown, actor: string): Promise<SettingsWrite> {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return { ok: false, errors: { '(request)': 'Expected { values: { KEY: "text" } }' } };

  const errors: Record<string, string> = {};
  const clean = new Map<string, string | null>();
  for (const [env, raw] of Object.entries(values as Record<string, unknown>)) {
    const error = validateSettingValue(env, raw);
    if (error) {
      errors[env] = error;
      continue;
    }
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    clean.set(env, trimmed ? normalizeSettingValue(env, trimmed) : null);
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  await ensureSettingsTable();
  for (const [env, value] of clean) {
    if (value === null) {
      await pool.query('DELETE FROM app_settings WHERE key = $1', [env]);
      applyEnvSetting(env, null);
    } else {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at, updated_by)
         VALUES ($1, $2, now(), $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [env, value, actor]
      );
      applyEnvSetting(env, value);
    }
  }
  // Reading back proves the next request sees exactly what was written.
  return { ok: true, view: buildAssistantSettingsView(await readAssistantSettings()) };
}
