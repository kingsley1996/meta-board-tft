import express from 'express';
import { pool, getMeta } from './db.ts';
import { ensureCatalogCurrent } from './tft.ts';
import { bumpComp, compExists, deleteComp, listComps, validateCompPayload, writeComp } from './comps.ts';
import { deleteGuide, guideExists, listGuides, validateGuidePayload, writeGuide } from './guides.ts';
import { assistantRouter } from './assistant/index.ts';
import { translateText } from './assistant/translate.ts';
import { voiceRouter } from './voice.ts';
import { authRouter, currentSessionUser, type AuthedRequest } from './auth-routes.ts';
import { ensureAdminFromEnv, listAccountUsers, setUserRole } from './accounts.ts';
import { ENTITY_TYPES } from './assistant/contracts.ts';
import { loadCatalog } from './assistant/tools.ts';
import {
  approveUnresolvedEntityMention,
  createEntityAlias,
  deleteEntityAlias,
  deleteUnresolvedEntityMention,
  listEntityAliases,
  listUnresolvedEntityMentions,
} from './assistant/entity-alias-store.ts';
import { COMP_ALIASES } from './assistant/entity-aliases.ts';
import {
  countReasoningTraces,
  listReasoningTraces,
  parseReasoningListQuery,
  scheduleReasoningLogCleanup,
} from './assistant/assistant-reasoning-store.ts';
import { getAssistantSettingsView, loadAssistantSettingsIntoEnv, updateAssistantSettings } from './settings.ts';
import { readTurnstileConfig } from './turnstile.ts';

// A half-configured challenge must fail startup, not silently disable protection.
readTurnstileConfig();

const app = express();
app.use(express.json({ limit: '1mb' }));

// req.ip is what the vote/view dedupe and the login limiter key on, so behind any
// reverse proxy the hop has to be trusted or every visitor collapses into one IP.
// Production always sits behind a proxy (Render, and the web tier in front of
// it), which is why the default there is one hop rather than waiting for the env.
const trustProxy = process.env.TRUST_PROXY?.trim() || (process.env.NODE_ENV === 'production' ? '1' : '');
if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : true);

// Render's health check wants a route that answers as soon as the process can
// serve traffic. /api/health deliberately skips the database: a database blip
// must not make the platform restart a service that is otherwise fine.
// /api/health/ready is the one to watch when a deploy is rolling out.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(503).json({ ok: false, error: error instanceof Error ? error.message : 'database unavailable' });
  }
});

const readLang = (value: unknown): 'en' | 'vi' => (value === 'vi' ? 'vi' : 'en');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.get('/api/comps', async (req, res) => {
  const meta = await getMeta();
  const sort = req.query.sort === 'popular' ? 'popular' : undefined;
  const comps = await listComps(undefined, readLang(req.query.lang), sort);
  res.json({ patch: { version: meta.patch ?? 'latest', updated: 'via MetaBoard' }, set: Number(meta.set_number ?? 0), comps });
});

app.get('/api/comps/:slug', async (req, res) => {
  const [comp] = await listComps(req.params.slug, readLang(req.query.lang));
  if (!comp) return res.status(404).json({ error: `no comp with slug "${req.params.slug}"` });
  res.json(comp);
});

// One bump per visitor per comp, tracked in memory. ponytail: resets with the
// process and does not survive multiple instances — add a table if it matters.
// Bounded (oldest keys evicted) so spoofed IPs cannot grow it forever.
const bumped = new Map<string, true>();
const MAX_BUMPED_KEYS = 50_000;

function rememberBump(key: string): void {
  bumped.set(key, true);
  if (bumped.size <= MAX_BUMPED_KEYS) return;
  let excess = bumped.size - Math.floor(MAX_BUMPED_KEYS / 2);
  for (const oldest of bumped.keys()) {
    if (excess <= 0) break;
    bumped.delete(oldest);
    excess -= 1;
  }
}

function bumpOnce(kind: 'vote' | 'view', req: express.Request, res: express.Response) {
  const slug = String(req.params.slug);
  const key = `${kind}:${req.ip}:${slug}`;
  const field = kind === 'vote' ? 'votes' : 'views';
  if (bumped.has(key)) return res.json({ counted: false });
  return bumpComp(slug, field as 'votes' | 'views').then((value) => {
    if (value === null) return res.status(404).json({ error: `no comp with slug "${slug}"` });
    rememberBump(key);
    res.json({ counted: true, [field]: value });
  });
}

app.post('/api/comps/:slug/vote', (req, res) => bumpOnce('vote', req, res));
app.post('/api/comps/:slug/view', (req, res) => bumpOnce('view', req, res));

app.post('/api/subscribe', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const lang = req.body?.lang === 'vi' ? 'vi' : 'en';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'invalid email' });
  await pool.query('INSERT INTO subscribers (email, lang) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING', [email, lang]);
  res.json({ ok: true });
});



app.get('/api/guides', async (req, res) => {
  res.json({ guides: await listGuides(readLang(req.query.lang)) });
});

app.get('/api/guides/:slug', async (req, res) => {
  const [guide] = await listGuides(readLang(req.query.lang), req.params.slug);
  if (!guide) return res.status(404).json({ error: `no guide with slug "${req.params.slug}"` });
  res.json(guide);
});

app.get('/api/tft/set', async (req, res) => {
  const meta = await getMeta();
  const [champions, traits, items, augments] = await Promise.all([
    pool.query('SELECT * FROM champions ORDER BY cost, name'),
    pool.query('SELECT * FROM traits ORDER BY name'),
    pool.query('SELECT * FROM items ORDER BY name'),
    pool.query('SELECT * FROM augments ORDER BY name'),
  ]);
  const lang = readLang(req.query.lang);
  const setName = meta.set_name ?? '';
  res.json({
    patch: meta.patch ?? 'latest',
    set: Number(meta.set_number ?? 0),
    catalog_release: meta.catalog_release ?? 'unknown',
    set_name: translateText(lang, 'tft', 'set-name', setName),
    champions: champions.rows,
    traits: traits.rows,
    items: items.rows,
    augments: augments.rows,
  });
});

// Admin is an account role, not a second password: /api/admin/* rides on the
// same mb_session cookie the public site uses, so signing in at /login with an
// admin account is the only way in.
async function adminGuard(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = await currentSessionUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized', code: 'unauthenticated' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'admin account required', code: 'admin_only' });
  (req as AuthedRequest).authUser = user;
  return next();
}

app.use('/api/admin', adminGuard);

app.post('/api/admin/comps', async (req, res) => {
  const result = await validateCompPayload(req.body);
  if ('error' in result) return res.status(400).json({ error: result.error });
  if (await compExists(result.comp.slug)) {
    return res.status(409).json({ error: `slug "${result.comp.slug}" already exists` });
  }
  await writeComp(result.comp);
  res.status(201).json({ ok: true, comp: result.comp });
});

app.put('/api/admin/comps/:slug', async (req, res) => {
  const result = await validateCompPayload(req.body, req.params.slug);
  if ('error' in result) return res.status(400).json({ error: result.error });
  if (!(await compExists(req.params.slug))) {
    return res.status(404).json({ error: `no comp with slug "${req.params.slug}"` });
  }
  await writeComp(result.comp);
  res.json({ ok: true, comp: result.comp });
});

app.delete('/api/admin/comps/:slug', async (req, res) => {
  if (!(await deleteComp(req.params.slug))) {
    return res.status(404).json({ error: `no comp with slug "${req.params.slug}"` });
  }
  res.json({ ok: true });
});

app.post('/api/admin/guides', async (req, res) => {
  const result = await validateGuidePayload(req.body);
  if ('error' in result) return res.status(400).json({ error: result.error });
  if (await guideExists(result.guide.slug)) {
    return res.status(409).json({ error: `slug "${result.guide.slug}" already exists` });
  }
  await writeGuide(result.guide);
  res.status(201).json({ ok: true, guide: result.guide });
});

app.put('/api/admin/guides/:slug', async (req, res) => {
  const result = await validateGuidePayload(req.body, req.params.slug);
  if ('error' in result) return res.status(400).json({ error: result.error });
  if (!(await guideExists(req.params.slug))) {
    return res.status(404).json({ error: `no guide with slug "${req.params.slug}"` });
  }
  await writeGuide(result.guide);
  res.json({ ok: true, guide: result.guide });
});

app.delete('/api/admin/guides/:slug', async (req, res) => {
  if (!(await deleteGuide(req.params.slug))) {
    return res.status(404).json({ error: `no guide with slug "${req.params.slug}"` });
  }
  res.json({ ok: true });
});

app.get('/api/admin/subscribers', async (_req, res) => {
  const { rows } = await pool.query('SELECT email, lang, created_at FROM subscribers ORDER BY created_at DESC');
  res.json({ subscribers: rows });
});

app.delete('/api/admin/subscribers/:email', async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM subscribers WHERE email = $1', [req.params.email]);
  if (!rowCount) return res.status(404).json({ error: 'no such subscriber' });
  res.status(204).end();
});

app.get('/api/admin/users', async (_req, res) => {
  res.json({ users: await listAccountUsers() });
});

// Only the role changes here; passwords stay with the normal sign-up flow.
app.patch('/api/admin/users/:id/role', async (req, res) => {
  const role = req.body?.role;
  if (role !== 'user' && role !== 'admin') return res.status(400).json({ error: 'role must be user or admin' });
  const actor = (req as AuthedRequest).authUser;
  if (!actor) return res.status(401).json({ error: 'unauthorized', code: 'unauthenticated' });
  const result = await setUserRole(req.params.id, role, actor.id);
  if (!result.ok) return res.status(result.error === 'no such user' ? 404 : 409).json({ error: result.error });
  res.json({ ok: true, user: result.user });
});

app.get('/api/admin/assistant-reasoning', async (req, res) => {
  const parsed = parseReasoningListQuery(req.query);
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Invalid reasoning log filters or pagination.' });
  }

  const { conversationId, requestId, limit, offset } = parsed.value;
  const filters = { conversationId, requestId };
  const [traces, total] = await Promise.all([
    listReasoningTraces({ ...filters, limit, offset }),
    countReasoningTraces(filters),
  ]);
  res.json({ traces, total, limit, offset });
});

app.get('/api/admin/aliases', async (_req, res) => {
  const [catalog, comps, aliases, unresolved] = await Promise.all([
    loadCatalog(),
    listComps(undefined, 'en'),
    listEntityAliases(),
    listUnresolvedEntityMentions(),
  ]);
  const entities = [
    ...catalog.entities.map((entity) => ({ id: entity.id, type: entity.type, name: entity.name })),
    ...comps.map((comp) => ({ id: `comp:${comp.slug}`, type: 'comp', name: comp.title })),
  ];
  const namesById = new Map(entities.map((entity) => [entity.id, entity.name]));
  res.json({
    aliases: aliases.map((alias) => ({ ...alias, targetName: namesById.get(alias.entityId) ?? alias.entityId })),
    unresolved,
    entities,
  });
});

app.post('/api/admin/aliases', async (req, res) => {
  const { alias, entityType, entityId } = req.body ?? {};
  if (typeof alias !== 'string' || typeof entityId !== 'string' || !ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: 'alias, entityType, and entityId are required.' });
  }
  const [catalog, comps] = await Promise.all([loadCatalog(), listComps(undefined, 'en')]);
  const compIds = new Set(comps.map((comp) => comp.slug));
  const reservedAliases = [
    ...comps.flatMap((comp) => [comp.title, comp.slug, ...(COMP_ALIASES[comp.slug] ?? [])]),
    ...Object.values(COMP_ALIASES).flat(),
  ];
  const result = await createEntityAlias({ alias, entityType, entityId }, catalog, compIds, reservedAliases);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ alias: result.alias });
});

app.delete('/api/admin/aliases/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid alias id.' });
  if (!(await deleteEntityAlias(id))) return res.status(404).json({ error: 'Alias not found.' });
  res.status(204).end();
});

app.post('/api/admin/aliases/unresolved/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const { entityType, entityId } = req.body ?? {};
  if (!Number.isSafeInteger(id) || id < 1 || typeof entityId !== 'string' || !ENTITY_TYPES.includes(entityType)) {
    return res.status(400).json({ error: 'A valid pending alias id, entityType, and entityId are required.' });
  }
  const [catalog, comps] = await Promise.all([loadCatalog(), listComps(undefined, 'en')]);
  const compIds = new Set(comps.map((comp) => comp.slug));
  const reservedAliases = [
    ...comps.flatMap((comp) => [comp.title, comp.slug, ...(COMP_ALIASES[comp.slug] ?? [])]),
    ...Object.values(COMP_ALIASES).flat(),
  ];
  const result = await approveUnresolvedEntityMention(id, { entityType, entityId }, catalog, compIds, reservedAliases);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  const targetName =
    entityType === 'comp'
      ? comps.find((comp) => `comp:${comp.slug}` === entityId)?.title ?? entityId
      : catalog.byId.get(entityId)?.name ?? entityId;
  res.status(201).json({ alias: { ...result.alias, targetName } });
});

app.delete('/api/admin/aliases/unresolved/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid unresolved alias id.' });
  if (!(await deleteUnresolvedEntityMention(id))) return res.status(404).json({ error: 'Unresolved alias not found.' });
  res.status(204).end();
});

// Runtime model/provider config. Writing a value updates this process right away
// because every config reader in the assistant re-reads process.env per request.
app.get('/api/admin/settings/assistant', async (_req, res) => {
  res.json(await getAssistantSettingsView());
});

app.put('/api/admin/settings/assistant', async (req, res) => {
  const actor = (req as AuthedRequest).authUser;
  const result = await updateAssistantSettings(req.body?.values, actor?.email ?? 'admin');
  if (!result.ok) return res.status(400).json({ error: 'Invalid setting value.', fields: result.errors });
  res.json(result.view);
});

app.use('/api/auth', authRouter);
// Resolve the signed-in user (if any) for assistant routes so conversations
// attach to the account and history follows the user across devices.
app.use('/api/assistant', async (req, _res, next) => {
  try {
    (req as AuthedRequest).authUser = await currentSessionUser(req);
  } catch {
    (req as AuthedRequest).authUser = null;
  }
  next();
});
app.use('/api/assistant', assistantRouter);
app.use('/api/voice', voiceRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'internal error' });
});

// The same two variables drive the seed script and the boot-time bootstrap, so
// the owner account exists whether the operator seeded the database or just let
// a fresh one boot. Once an admin row exists this returns without touching it,
// which is why the vars can be deleted from the host right after first sign-in.
async function bootstrapAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!email || !password) return;
  try {
    const outcome = await ensureAdminFromEnv(email, password);
    if (outcome) console.log(`admin account ${outcome.created ? 'created' : 'adopted'}: ${email.toLowerCase()}`);
  } catch (error) {
    console.error('admin bootstrap failed', error instanceof Error ? error.message : error);
  }
}

// Admin picks made in /admin/settings survive a redeploy this way: the database
// holds the override and gets copied onto process.env before the first assistant
// request can be served. A database that is still waking up is not fatal — the
// host environment keeps driving until the next save.
async function applyStoredSettings(): Promise<void> {
  try {
    const applied = await loadAssistantSettingsIntoEnv();
    if (applied) console.log(`assistant settings: ${applied} override(s) loaded from database`);
  } catch (error) {
    console.error('assistant settings load failed; host environment stays in charge', error instanceof Error ? error.message : error);
  }
}

// The game catalog is a projection of the data snapshot committed with the code,
// so a deploy is the sync step: compare the snapshot's release id with the one
// the database holds and rewrite the catalog only when they differ. A database
// that is still waking up gets one retry — after that the catalog stays on the
// previous release, which /api/tft/set reports through catalog_release.
async function applyCatalog(retry = true): Promise<void> {
  try {
    const { applied, data } = await ensureCatalogCurrent(pool);
    console.log(
      `game catalog: ${applied ? 'applied' : 'already current'} release ${data.release} ` +
        `(set ${data.set.number}, patch ${data.patch}, ${data.champions.length} champions, ` +
        `${data.items.length} items, ${data.augments.length} augments)`
    );
  } catch (error) {
    console.error('game catalog sync failed', error instanceof Error ? error.message : error);
    if (retry) setTimeout(() => void applyCatalog(false), 30_000);
  }
}

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => {
  console.log(`metaboard server on http://localhost:${port}`);
  void applyCatalog();
  void bootstrapAdmin();
  void applyStoredSettings();
});

// Render sends SIGTERM on every deploy and scale event. Draining first means an
// assistant answer or a voice upload finishes instead of dying mid-response, and
// closing the pool releases the database connections the pooler is counting.
// The deadline is what keeps one stuck query from blocking the exit forever.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal}: closing server`);
  server.close(() => {
    pool.end().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error('pool did not close cleanly', error);
        process.exit(1);
      }
    );
  });
  setTimeout(() => {
    console.error(`${signal} drain timed out; exiting`);
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

const configuredRetentionDays = Number(process.env.ASSISTANT_REASONING_RETENTION_DAYS ?? '30');
scheduleReasoningLogCleanup(Number.isSafeInteger(configuredRetentionDays) && configuredRetentionDays >= 1 ? configuredRetentionDays : 30);
