import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

// settings.ts imports db.ts, which builds the pg Pool at module load; importing
// dynamically keeps that after the DATABASE_URL guard below (same convention as
// accounts.test.ts). These tests never query — they cover the allow-list, the
// validators and the environment overlay.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(import.meta.dirname, '../.env'));
  } catch {
    // No .env: fine, nothing here touches the database.
  }
}

const ENV_KEYS = [
  'ASSISTANT_PROVIDER',
  'ASSISTANT_MODEL',
  'ASSISTANT_ENABLED',
  'ASSISTANT_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_MODEL',
  'ASSISTANT_MAX_CONCURRENCY',
];

async function settings() {
  return import('./settings.ts');
}

async function withCleanEnv<R>(run: () => Promise<R> | R): Promise<R> {
  const { forgetHostValues } = await settings();
  const saved: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  forgetHostValues();
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    forgetHostValues();
  }
}

test('only the allow-list is configurable, credentials are not', async () => {
  const { validateSettingValue } = await settings();
  assert.equal(validateSettingValue('ASSISTANT_PROVIDER', 'openai'), null);
  for (const blocked of ['OPENAI_API_KEY', 'GOOGLE_API_KEY', 'DATABASE_URL', 'ADMIN_SEED_PASSWORD', 'REFRESH_TOKEN', 'S3_CRON_TOKEN']) {
    const error = validateSettingValue(blocked, 'whatever');
    assert.match(error ?? '', /not a configurable setting/, `${blocked} must be rejected`);
  }
});

test('provider, bool and int values are validated', async () => {
  const { validateSettingValue } = await settings();
  assert.match(validateSettingValue('ASSISTANT_PROVIDER', 'anthropic') ?? '', /must be one of/);
  assert.equal(validateSettingValue('ASSISTANT_ENABLED', 'TRUE'), null);
  assert.match(validateSettingValue('ASSISTANT_ENABLED', 'yes') ?? '', /must be true or false/);
  assert.equal(validateSettingValue('ASSISTANT_MAX_CONCURRENCY', '4'), null);
  assert.match(validateSettingValue('ASSISTANT_MAX_CONCURRENCY', '0') ?? '', /at least 1/);
  assert.match(validateSettingValue('ASSISTANT_MAX_CONCURRENCY', '99') ?? '', /at most 16/);
  assert.match(validateSettingValue('ASSISTANT_MAX_CONCURRENCY', '2.5') ?? '', /whole number/);
});

test('model ids and base URLs are validated', async () => {
  const { validateSettingValue } = await settings();
  assert.equal(validateSettingValue('OPENAI_MODEL', 'gpt-6-luna'), null);
  assert.equal(validateSettingValue('ASSISTANT_MODEL', 'qwen3.5:9b'), null);
  assert.equal(validateSettingValue('OPENROUTER_MODEL', 'google/gemma-4-31b-it:free'), null);
  assert.match(validateSettingValue('OPENAI_MODEL', 'gpt 6 luna') ?? '', /not a valid model id/);
  assert.match(validateSettingValue('OPENAI_BASE_URL', 'not-a-url') ?? '', /absolute URL/);
  assert.match(validateSettingValue('OPENAI_BASE_URL', 'ftp://host/v1') ?? '', /must be http\(s\)/);
  assert.match(validateSettingValue('OPENAI_BASE_URL', 'https://user:pass@gate.com/v1') ?? '', /must not embed credentials/);
  // The ollama adapter refuses non-loopback targets; the UI says so before saving.
  assert.match(validateSettingValue('ASSISTANT_BASE_URL', 'https://ollama.example.com') ?? '', /loopback/);
  assert.equal(validateSettingValue('ASSISTANT_BASE_URL', 'http://127.0.0.1:11434'), null);
});

test('an empty value means no override, not an empty env var', async () => {
  const { validateSettingValue } = await settings();
  assert.equal(validateSettingValue('OPENAI_MODEL', ''), null);
  assert.equal(validateSettingValue('OPENAI_MODEL', '   '), null);
  assert.equal(validateSettingValue('OPENAI_MODEL', null), null);
});

test('the overlay sets, normalizes and clears process.env', async () => {
  const { applyEnvSetting } = await settings();
  await withCleanEnv(() => {
    applyEnvSetting('ASSISTANT_PROVIDER', ' OpenAI ');
    assert.equal(process.env.ASSISTANT_PROVIDER, 'openai');
    applyEnvSetting('OPENAI_BASE_URL', 'https://api.shopaikey.com/v1///');
    assert.equal(process.env.OPENAI_BASE_URL, 'https://api.shopaikey.com/v1');
    applyEnvSetting('ASSISTANT_PROVIDER', '');
    assert.equal(process.env.ASSISTANT_PROVIDER, undefined);
    applyEnvSetting('ASSISTANT_PROVIDER', null);
    assert.equal(process.env.ASSISTANT_PROVIDER, undefined);
  });
});

test('the view labels where each effective value comes from', async () => {
  const { buildAssistantSettingsView } = await settings();
  await withCleanEnv(() => {
    // A placeholder key, never a real one: openaiRemoteConfig() needs a key to
    // exist before it will report a model at all.
    process.env.OPENAI_API_KEY = 'not-a-real-key';
    // What the boot overlay leaves behind: the row already copied onto env.
    process.env.ASSISTANT_PROVIDER = 'openai';
    process.env.OPENAI_MODEL = 'gpt-6-luna';
    const view = buildAssistantSettingsView(new Map([['ASSISTANT_PROVIDER', 'openai']]));
    const byEnv = new Map(view.settings.map((entry) => [entry.env, entry]));
    assert.equal(byEnv.get('ASSISTANT_PROVIDER')?.source, 'database');
    assert.equal(byEnv.get('ASSISTANT_PROVIDER')?.databaseValue, 'openai');
    assert.equal(byEnv.get('OPENAI_MODEL')?.source, 'environment');
    assert.equal(byEnv.get('GOOGLE_MODEL')?.source, 'unset');

    assert.ok(view.credentials.every((entry) => !('value' in entry)), 'credentials must never carry a value');
    assert.equal(view.active.provider, 'openai');
    assert.equal(view.active.model, 'gpt-6-luna');
    assert.deepEqual(view.warnings, []);

    // A provider whose key is missing on the host is the one mistake that makes
    // every answer fail, so it has to be visible before the admin closes the tab.
    delete process.env.OPENAI_API_KEY;
    assert.match(buildAssistantSettingsView(new Map()).warnings.join(' '), /neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set/);

    // The kill switch is worth a warning of its own: the assistant looks
    // configured but answers 503 to everyone.
    process.env.OPENAI_API_KEY = 'not-a-real-key';
    process.env.ASSISTANT_ENABLED = 'false';
    assert.match(buildAssistantSettingsView(new Map()).warnings.join(' '), /switched off/);
  });
});

test('removing an override restores the value the process booted with', async () => {
  const { applyEnvSetting } = await settings();
  await withCleanEnv(() => {
    // The platform's environment said google; the admin moved to openai.
    process.env.ASSISTANT_PROVIDER = 'google';
    applyEnvSetting('ASSISTANT_PROVIDER', 'openai');
    assert.equal(process.env.ASSISTANT_PROVIDER, 'openai');
    applyEnvSetting('ASSISTANT_PROVIDER', '');
    assert.equal(process.env.ASSISTANT_PROVIDER, 'google', 'reset must go back to the host value, not to the code default');
  });
});
