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
ALTER TABLE comps ADD COLUMN IF NOT EXISTS playstyle_vi text;
ALTER TABLE comps ADD COLUMN IF NOT EXISTS tips_vi text;
ALTER TABLE comp_stages ADD COLUMN IF NOT EXISTS text_vi text;
