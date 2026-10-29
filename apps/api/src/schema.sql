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
-- llm_generation rows carry the messages sent, raw response (truncated per
-- field), a fingerprint of the near-constant system prompt, and every provider
-- attempt/retry, so answers can be audited end to end.
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

-- Admin-editable runtime configuration (src/settings.ts). Keys are an allow-list
-- enforced in code, and a row beats the host environment until it is deleted.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

-- ===========================================================================
-- Membership, payment and quota ledger (docs/MEMBERSHIP-PLAN.md section 5).
--
-- Additive and idempotent like the rest of this file: a fresh database gets the
-- tables from CREATE TABLE, an existing one re-runs the ALTER/CREATE OR REPLACE
-- lines. There is no migration framework here on purpose.
--
-- Offer numbers (price, allowances, execution limits) are rows in
-- plan_versions, not CHECK constraints or app constants, so re-pricing at gate
-- #92 is an INSERT of a new version instead of a schema change.
--
-- Money and quota are integers (VND; turns, seconds, characters) and every
-- timestamp is UTC. Asia/Ho_Chi_Minh calendar boundaries are computed in code
-- before the row is written, so a period never depends on the server TimeZone.
--
-- Ledger tables reference users with the default NO ACTION: a user cannot be
-- removed as a side effect of purging chat history, and any future account
-- deletion has to move the ledger deliberately.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 40),  -- 'free' | 'plus'
  version int NOT NULL CHECK (version >= 1),
  -- draft rows exist before an offer is approved; only one version per code can
  -- be sold at a time (see the partial unique index below).
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  label text NOT NULL,
  price_vnd int NOT NULL CHECK (price_vnd >= 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  -- NULL term = calendar month (Free); 30 = exactly 30 days (Plus).
  term_days int CHECK (term_days IS NULL OR term_days BETWEEN 1 AND 366),
  -- 0 allowance means the metric is locked for that plan.
  chat_per_period int NOT NULL DEFAULT 0 CHECK (chat_per_period >= 0),
  chat_per_day int NOT NULL DEFAULT 0 CHECK (chat_per_day >= 0),
  stt_seconds_per_period int NOT NULL DEFAULT 0 CHECK (stt_seconds_per_period >= 0),
  tts_characters_per_period int NOT NULL DEFAULT 0 CHECK (tts_characters_per_period >= 0),
  -- Execution policy: limits that protect latency and concurrency, not balance.
  -- NULL means the metric is uncapped.
  chat_requests_per_minute int CHECK (chat_requests_per_minute IS NULL OR chat_requests_per_minute > 0),
  max_concurrent_requests int CHECK (max_concurrent_requests IS NULL OR max_concurrent_requests > 0),
  max_stt_seconds_per_request int CHECK (max_stt_seconds_per_request IS NULL OR max_stt_seconds_per_request > 0),
  max_concurrent_tts_chunks int CHECK (max_concurrent_tts_chunks IS NULL OR max_concurrent_tts_chunks >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_versions_one_active_per_code_idx ON plan_versions (code) WHERE status = 'active';

-- An offer that has been bought or already reserved quota cannot be re-priced
-- in place: history and money already spent would silently change meaning.
-- Retiring and inserting version+1 is the supported edit, so only the commercial
-- columns and DELETE are guarded; status/label remain editable on referenced rows.
CREATE OR REPLACE FUNCTION plan_versions_keep_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_orders WHERE plan_version_id = OLD.id)
     OR EXISTS (SELECT 1 FROM memberships WHERE plan_version_id = OLD.id)
     OR EXISTS (SELECT 1 FROM usage_buckets WHERE plan_version_id = OLD.id) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'plan_version % is referenced by orders, memberships or usage buckets', OLD.id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF NEW.price_vnd IS DISTINCT FROM OLD.price_vnd
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.term_days IS DISTINCT FROM OLD.term_days
       OR NEW.chat_per_period IS DISTINCT FROM OLD.chat_per_period
       OR NEW.chat_per_day IS DISTINCT FROM OLD.chat_per_day
       OR NEW.stt_seconds_per_period IS DISTINCT FROM OLD.stt_seconds_per_period
       OR NEW.tts_characters_per_period IS DISTINCT FROM OLD.tts_characters_per_period THEN
      RAISE EXCEPTION 'plan_version % is referenced; retire it and insert a new version', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER plan_versions_keep_history
  BEFORE UPDATE OR DELETE ON plan_versions
  FOR EACH ROW EXECUTE FUNCTION plan_versions_keep_history();

CREATE TABLE IF NOT EXISTS payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  plan_version_id uuid NOT NULL REFERENCES plan_versions (id),
  -- The bank memo carries reference; the provider contract keeps it to
  -- ^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,25}$ and the CHECK below makes that a
  -- database invariant, not just a validation in the request path.
  reference text NOT NULL UNIQUE CHECK (reference ~ '^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,25}$'),
  -- Providers receive a numeric orderCode. The bound is 2^53-1 because it also
  -- has to survive a round trip through JavaScript.
  order_code bigint NOT NULL UNIQUE CHECK (order_code > 0 AND order_code <= 9007199254740991),
  amount_vnd int NOT NULL CHECK (amount_vnd > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  -- Frozen plan_terms at checkout time: fulfilment must never re-read the live
  -- plan row, or a re-priced plan would change what the user already paid for.
  offer_snapshot jsonb NOT NULL,
  -- Pinned at creation (task #97): webhooks, lookups and reconciliation resolve
  -- this binding and never fall back to the current default provider.
  provider text NOT NULL CHECK (provider IN ('payos', 'sepay')),
  account_id text NOT NULL,
  external_id text,
  checkout_kind text CHECK (checkout_kind IS NULL OR checkout_kind IN ('hosted', 'bank_qr')),
  checkout_url text,
  qr_image_url text,
  -- Mirrors PaymentStatus from src/payments/provider.ts so lookup results land
  -- without a mapping layer; 'fulfilled' is tracked by fulfilled_at, not status.
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'processing', 'paid', 'underpaid', 'expired', 'canceled', 'failed', 'review')
  ),
  paid_vnd int CHECK (paid_vnd IS NULL OR paid_vnd >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  fulfilled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_orders_deadline_in_future CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_provider_external_id_idx ON payment_orders (provider, account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx ON payment_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_status_expires_idx ON payment_orders (status, expires_at) WHERE status IN ('pending', 'processing');

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  account_id text NOT NULL,
  -- The gateway's own id for the transaction, exactly as it reported it. SePay's
  -- webhook id is numeric while its REST id is a UUID, so this is text and is
  -- never coerced into a number.
  provider_transaction_id text NOT NULL,
  -- The bank's transfer reference: the only identity stable across a webhook and
  -- a reconciliation lookup. Without it a row can be recorded but cannot grant.
  transaction_reference text,
  -- NULL when no order matched the reference; such rows stay for manual audit.
  order_id uuid REFERENCES payment_orders (id),
  event_type text NOT NULL CHECK (event_type IN ('webhook', 'lookup', 'manual')),
  amount_vnd int NOT NULL CHECK (amount_vnd > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  occurred_at timestamptz NOT NULL,
  -- sha256 of the raw provider body. The body itself and the signature headers
  -- are not stored, so a leaked database cannot be replayed as a webhook.
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  -- Normalised PaymentReceipt (src/payments/provider.ts), never an SDK payload.
  receipt jsonb NOT NULL,
  result text NOT NULL DEFAULT 'review' CHECK (result IN ('granted', 'duplicate', 'ignored', 'review')),
  result_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_granted_is_reconcilable CHECK (result <> 'granted' OR transaction_reference IS NOT NULL),
  CONSTRAINT payment_events_granted_has_order CHECK (result <> 'granted' OR order_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_transaction_idx ON payment_events (provider, account_id, provider_transaction_id);
-- The real double-grant guard: the same bank transaction arriving by webhook and
-- again through reconciliation cannot fulfil twice.
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_bank_reference_idx ON payment_events (provider, account_id, transaction_reference) WHERE transaction_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_events_order_idx ON payment_events (order_id);

CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  plan_version_id uuid NOT NULL REFERENCES plan_versions (id),
  -- Coverage is the half-open interval [starts_at, ends_at); entitlement is a
  -- function of these instants, so no cron has to fire on time for a period to
  -- start or end. Overlapping paid periods are prevented by locking the account's
  -- coverage in code (task #86), not by a GiST exclusion constraint, which would
  -- require an extension on every host.
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  -- 'active' plus the interval is the whole state machine; 'revoked' is for
  -- refunds and manual corrections and is always accompanied by an audit row.
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source text NOT NULL CHECK (source IN ('purchase', 'grant')),
  order_id uuid REFERENCES payment_orders (id),
  granted_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_period_is_forward CHECK (ends_at > starts_at),
  -- Every row names what it is: a sale needs an order, a hand-made period needs
  -- an admin identity, and a grant never pretends to be revenue.
  CONSTRAINT memberships_purchase_has_order CHECK ((source = 'purchase') = (order_id IS NOT NULL)),
  CONSTRAINT memberships_grant_has_author CHECK ((source = 'grant') = (granted_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS memberships_order_idx ON memberships (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS memberships_user_ends_idx ON memberships (user_id, ends_at DESC);

CREATE TABLE IF NOT EXISTS usage_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  metric text NOT NULL CHECK (metric IN ('chat', 'stt_seconds', 'tts_characters')),
  -- membership_period covers [starts_at, ends_at) of one paid period;
  -- calendar_month and calendar_day are Asia/Ho_Chi_Minh boundaries converted to
  -- UTC instants by the writer. A period that has closed still accepts settlement
  -- for reservations taken while it was open.
  period_kind text NOT NULL CHECK (period_kind IN ('membership_period', 'calendar_month', 'calendar_day')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  plan_version_id uuid NOT NULL REFERENCES plan_versions (id),
  allowance_units int NOT NULL CHECK (allowance_units >= 0),
  consumed_units int NOT NULL DEFAULT 0 CHECK (consumed_units >= 0),
  reserved_units int NOT NULL DEFAULT 0 CHECK (reserved_units >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start),
  -- The balance can never go negative, not even for a buggy settle path: an
  -- over-consumption attempt fails here rather than in a report afterwards.
  CONSTRAINT usage_buckets_balance_never_negative CHECK (consumed_units + reserved_units <= allowance_units),
  UNIQUE (user_id, metric, period_kind, period_start)
);
CREATE INDEX IF NOT EXISTS usage_buckets_user_metric_ends_idx ON usage_buckets (user_id, metric, period_end DESC);

CREATE TABLE IF NOT EXISTS usage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id),
  -- Idempotency is per account: two users may reuse the same key string.
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  -- Hash of the normalised body. The same key with a different hash is a client
  -- bug or a replay and has to return conflict instead of a second debit.
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('coach_turn', 'stt_transcribe', 'tts_synthesize')),
  -- A transcript that becomes a Coach query belongs to the same user turn, so
  -- the chat debit happens once. NULL for standalone requests.
  turn_request_id uuid REFERENCES usage_requests (id),
  -- reserved: holds allowance, nothing dispatched. dispatched: provider call has
  -- begun, so a user stop still counts. needs_recovery: outcome unknown.
  status text NOT NULL CHECK (status IN ('reserved', 'dispatched', 'completed', 'released', 'needs_recovery')),
  -- Unsettled reservations past this deadline are recovered by the reconcile
  -- path; nothing hangs forever.
  reserve_expires_at timestamptz NOT NULL,
  dispatched_at timestamptz,
  settled_at timestamptz,
  -- Identifies the deliverable (assistant message id, audio cache key) without
  -- storing prompt, answer or audio.
  result_reference text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CONSTRAINT usage_requests_dispatched_has_time CHECK (status <> 'dispatched' OR dispatched_at IS NOT NULL),
  CONSTRAINT usage_requests_completed_is_settled CHECK (status <> 'completed' OR settled_at IS NOT NULL),
  CONSTRAINT usage_requests_settled_is_terminal CHECK (settled_at IS NULL OR status IN ('completed', 'released', 'needs_recovery'))
);
CREATE INDEX IF NOT EXISTS usage_requests_user_created_idx ON usage_requests (user_id, created_at DESC);
-- Recovery queue for the reconcile worker (task #81); partial so it stays small
-- as history grows.
CREATE INDEX IF NOT EXISTS usage_requests_recovery_idx ON usage_requests (reserve_expires_at) WHERE status IN ('reserved', 'dispatched', 'needs_recovery');

CREATE TABLE IF NOT EXISTS usage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES usage_requests (id) ON DELETE CASCADE,
  -- No cascade to buckets: buckets are ledger history and outlive the request
  -- that filled them.
  bucket_id uuid NOT NULL REFERENCES usage_buckets (id),
  units int NOT NULL CHECK (units > 0),
  -- reserved still holds allowance; settled moved it to consumed; released gave
  -- it back. A settle is one transaction that flips this row and the bucket.
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, bucket_id)
);
CREATE INDEX IF NOT EXISTS usage_reservations_bucket_idx ON usage_reservations (bucket_id) WHERE state = 'reserved';

CREATE TABLE IF NOT EXISTS usage_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES usage_requests (id) ON DELETE CASCADE,
  attempt int NOT NULL CHECK (attempt >= 1),
  -- Written before the call, so a spend exists even when the response never did.
  provider text NOT NULL,
  model text,
  -- 'unknown' is the state that forbids re-dispatch: the provider may have
  -- charged us and we cannot prove otherwise.
  dispatch_state text NOT NULL CHECK (dispatch_state IN ('not_dispatched', 'dispatching', 'unknown', 'completed', 'failed')),
  -- NULL cost/quantity means the provider did not tell us, which is not zero:
  -- the unit-economics report (task #92) has to show them as unknown.
  billed_quantity int CHECK (billed_quantity IS NULL OR billed_quantity >= 0),
  billed_unit text CHECK (billed_unit IS NULL OR billed_unit IN ('request', 'second', 'character', 'input_token', 'output_token', 'audio_second', 'byte')),
  cost_micro_vnd bigint CHECK (cost_micro_vnd IS NULL OR cost_micro_vnd >= 0),
  cost_currency text NOT NULL DEFAULT 'VND' CHECK (cost_currency = 'VND'),
  -- Which price sheet the number above came from, so history can be re-costed
  -- without rewriting rows.
  tariff_version text,
  outcome text CHECK (outcome IS NULL OR outcome IN ('success', 'empty', 'error', 'cancelled', 'unknown')),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT usage_attempts_cost_has_tariff CHECK (cost_micro_vnd IS NULL OR tariff_version IS NOT NULL),
  CONSTRAINT usage_attempts_quantity_has_unit CHECK (billed_unit IS NULL OR billed_quantity IS NOT NULL),
  CONSTRAINT usage_attempts_time_order CHECK (finished_at IS NULL OR finished_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS usage_attempts_request_attempt_idx ON usage_attempts (request_id, attempt);
CREATE INDEX IF NOT EXISTS usage_attempts_provider_started_idx ON usage_attempts (provider, started_at DESC);
