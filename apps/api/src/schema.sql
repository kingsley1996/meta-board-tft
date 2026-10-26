CREATE TABLE IF NOT EXISTS meta (
  key text PRIMARY KEY,
  value text NOT NULL
);

CREATE TABLE IF NOT EXISTS traits (
  api_name text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  thresholds int[] NOT NULL DEFAULT '{}',
  styles int[] NOT NULL DEFAULT '{}',
  icon text
);
ALTER TABLE traits ADD COLUMN IF NOT EXISTS thresholds int[] NOT NULL DEFAULT '{}';
ALTER TABLE traits ADD COLUMN IF NOT EXISTS styles int[] NOT NULL DEFAULT '{}';
ALTER TABLE traits ADD COLUMN IF NOT EXISTS icon text;

CREATE TABLE IF NOT EXISTS champions (
  api_name text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  cost int NOT NULL,
  traits text[] NOT NULL,
  icon text
);

CREATE TABLE IF NOT EXISTS items (
  api_name text PRIMARY KEY,
  name text UNIQUE NOT NULL,
  description text NOT NULL,
  composition text[] NOT NULL,
  icon text
);

-- Augment names can repeat across api names, so name is indexed but not unique.
CREATE TABLE IF NOT EXISTS augments (
  api_name text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL,
  rarity int,
  icon text
);
CREATE INDEX IF NOT EXISTS augments_name_idx ON augments (name);

CREATE TABLE IF NOT EXISTS comps (
  slug text PRIMARY KEY,
  title text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'X')),
  style text NOT NULL CHECK (style IN ('Reroll', 'Fast 8', 'Flex', 'Tempo')),
  difficulty int NOT NULL CHECK (difficulty BETWEEN 1 AND 3),
  playstyle text NOT NULL,
  carry text NOT NULL,
  tips text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE comps ADD COLUMN IF NOT EXISTS trend text;
DO $$ BEGIN
  ALTER TABLE comps ADD CONSTRAINT comps_trend_values CHECK (trend IN ('up', 'down'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Community signals: helpful votes (one per visitor) and anonymous view counts.
ALTER TABLE comps ADD COLUMN IF NOT EXISTS votes int NOT NULL DEFAULT 0;
ALTER TABLE comps ADD COLUMN IF NOT EXISTS views int NOT NULL DEFAULT 0;

-- Counters: [{ slug, kind: 'good' | 'bad' }] — comps this one beats / loses to.
ALTER TABLE comps ADD COLUMN IF NOT EXISTS matchups jsonb NOT NULL DEFAULT '[]';

-- Newsletter signups from the public footer. Sending is manual for now
-- (export the list from /admin/subscribers).
CREATE TABLE IF NOT EXISTS subscribers (
  email text PRIMARY KEY,
  lang text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id serial PRIMARY KEY,
  alias text NOT NULL CHECK (char_length(alias) BETWEEN 2 AND 80),
  alias_key text NOT NULL UNIQUE,
  entity_type text NOT NULL CHECK (entity_type IN ('champion', 'item', 'trait', 'augment', 'comp')),
  entity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS unresolved_entity_mentions (
  id serial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  name_key text NOT NULL,
  entity_type text NOT NULL DEFAULT 'unknown' CHECK (entity_type IN ('champion', 'item', 'trait', 'augment', 'comp', 'unknown')),
  occurrences integer NOT NULL DEFAULT 1 CHECK (occurrences > 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name_key, entity_type)
);

CREATE TABLE IF NOT EXISTS comp_units (
  comp_slug text NOT NULL REFERENCES comps (slug) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('board', 'early', 'alt')),
  position int NOT NULL,
  name text NOT NULL,
  row int,
  col int,
  stars int,
  items text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (comp_slug, role, position)
);
ALTER TABLE comp_units ADD COLUMN IF NOT EXISTS row int;
ALTER TABLE comp_units ADD COLUMN IF NOT EXISTS col int;
ALTER TABLE comp_units ADD COLUMN IF NOT EXISTS stars int;
ALTER TABLE comp_units ADD COLUMN IF NOT EXISTS items text[] NOT NULL DEFAULT '{}';
DO $$ BEGIN
  ALTER TABLE comp_units ADD CONSTRAINT comp_units_row_range CHECK (row BETWEEN 0 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE comp_units ADD CONSTRAINT comp_units_col_range CHECK (col BETWEEN 0 AND 6);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE comp_units ADD CONSTRAINT comp_units_stars_range CHECK (stars BETWEEN 1 AND 3);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS comp_items (
  comp_slug text NOT NULL REFERENCES comps (slug) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (comp_slug, position)
);

CREATE TABLE IF NOT EXISTS comp_augments (
  comp_slug text NOT NULL REFERENCES comps (slug) ON DELETE CASCADE,
  position int NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (comp_slug, position)
);

CREATE TABLE IF NOT EXISTS comp_stages (
  comp_slug text NOT NULL REFERENCES comps (slug) ON DELETE CASCADE,
  stage int NOT NULL CHECK (stage BETWEEN 2 AND 4),
  text text NOT NULL,
  PRIMARY KEY (comp_slug, stage)
);

-- Public-site translations. Editors write English; vi text is seed-managed and
-- survives admin saves (see writeComp). Empty/absent vi falls back to English.
ALTER TABLE comps ADD COLUMN IF NOT EXISTS title_vi text;
ALTER TABLE comps ADD COLUMN IF NOT EXISTS playstyle_vi text;
ALTER TABLE comps ADD COLUMN IF NOT EXISTS tips_vi text;
ALTER TABLE comp_stages ADD COLUMN IF NOT EXISTS text_vi text;

-- Augment priority order shown in the comp panel, e.g. {ITEMS,ECON,COMBAT}.
ALTER TABLE comps ADD COLUMN IF NOT EXISTS augment_types text[] NOT NULL DEFAULT '{}';

-- Assistant conversation persistence (Conversation Persistence).
-- Stores chat sessions and messages so users can resume conversations
-- across devices and page reloads instead of relying on sessionStorage only.
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,           -- cookie mb_assistant value, for ownership scoping
  lang text NOT NULL DEFAULT 'en',   -- conversation language
  title text,                        -- auto-derived from first user message
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_conversations_client_id_idx ON assistant_conversations (client_id);
CREATE INDEX IF NOT EXISTS assistant_conversations_updated_at_idx ON assistant_conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES assistant_conversations (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  intent text,                       -- AssistantIntent, null for user messages
  mode text,                         -- 'llm' | 'deterministic'
  status text,                       -- AssistantStatus
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_conversation_id_idx ON assistant_messages (conversation_id, created_at);

-- Full AssistantResponse so reload/other devices can re-render sections,
-- recommendations and sources; NULL for messages persisted before this column.
ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS response jsonb;

-- Assistant decision trace for admin observability; no model chain-of-thought.
-- llm_generation rows carry the prompt and raw response (truncated per field)
-- plus every provider attempt/retry, so answers can be audited end to end.
-- conversation_id is not a FK so traces still write when conversation persistence fails
-- for that request; user-initiated conversation deletes purge their traces explicitly.
-- Rows older than ASSISTANT_REASONING_RETENTION_DAYS (default 30) are pruned daily.
CREATE TABLE IF NOT EXISTS assistant_reasoning_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  request_id text NOT NULL,
  step text NOT NULL CHECK (step IN ('intent_detection', 'entity_resolution', 'tool_call', 'llm_generation', 'validation', 'fallback', 'deterministic_answer')),
  step_index int NOT NULL DEFAULT 0,    -- ordering within a single request
  intent text,                          -- detected AssistantIntent
  mode text,                            -- 'llm' | 'deterministic'
  status text,                          -- AssistantStatus
  input_summary text,                   -- truncated user message
  output_summary text,                  -- truncated assistant answer or tool result
  details jsonb NOT NULL DEFAULT '{}',  -- structured step-specific data
  duration_ms int CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_conversation_id_idx ON assistant_reasoning_logs (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_request_order_idx ON assistant_reasoning_logs (request_id, step_index);
CREATE INDEX IF NOT EXISTS assistant_reasoning_logs_step_idx ON assistant_reasoning_logs (step);

-- Guides: authored articles edited through /admin/guides. published_on is an
-- ISO date string (YYYY-MM-DD); sections is [{ heading, body: [], list?: [] }].
CREATE TABLE IF NOT EXISTS guides (
  slug text PRIMARY KEY,
  author text NOT NULL,
  author_slug text NOT NULL,
  published_on text NOT NULL CHECK (published_on ~ '^\d{4}-\d{2}-\d{2}$'),
  title text NOT NULL,
  excerpt text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  featured boolean NOT NULL DEFAULT false,
  sections jsonb NOT NULL DEFAULT '[]',
  title_vi text,
  excerpt_vi text,
  sections_vi jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE guides ADD COLUMN IF NOT EXISTS title_vi text;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS excerpt_vi text;
ALTER TABLE guides ADD COLUMN IF NOT EXISTS sections_vi jsonb;

-- Accounts: email+password and Google OAuth identities. Rows are created by
-- /api/auth/* (see src/accounts.ts, which also ensures these tables at runtime).
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text,                   -- null for Google-only accounts
  name text,
  avatar_url text,
  google_id text UNIQUE,                -- Google "sub" claim
  email_verified_at timestamptz,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Databases created before the admin flow moved onto accounts. The clause is a
-- no-op once the column exists, so the CHECK from CREATE TABLE is not doubled.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash text PRIMARY KEY,          -- sha256 of the opaque cookie token
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash text PRIMARY KEY,          -- sha256 of the emailed token
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify_email', 'password_reset')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
-- Personal Coach AI history: conversations attach to the signed-in user.
ALTER TABLE assistant_conversations ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS assistant_conversations_user_id_idx ON assistant_conversations (user_id, updated_at DESC);
