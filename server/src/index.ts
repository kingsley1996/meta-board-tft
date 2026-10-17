import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { pool, getMeta } from './db.ts';
import { ADMIN_COOKIE, adminToken, cookieValue, tokensMatch } from './auth.ts';
import { syncTft } from './tft.ts';
import { compExists, deleteComp, listComps, validateCompPayload, writeComp } from './comps.ts';
import { deleteGuide, guideExists, listGuides, validateGuidePayload, writeGuide } from './guides.ts';

const app = express();
app.use(express.json({ limit: '1mb' }));

const bearerOk = (header: string | undefined, expected: string | undefined): boolean => {
  if (!expected) return false;
  const provided = (header ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

const readLang = (value: unknown): 'en' | 'vi' => (value === 'vi' ? 'vi' : 'en');

app.get('/api/comps', async (req, res) => {
  const meta = await getMeta();
  const comps = await listComps(undefined, readLang(req.query.lang));
  res.json({ patch: { version: meta.patch ?? 'latest', updated: 'via CommunityDragon' }, set: Number(meta.set_number ?? 0), comps });
});

app.get('/api/comps/:slug', async (req, res) => {
  const [comp] = await listComps(req.params.slug, readLang(req.query.lang));
  if (!comp) return res.status(404).json({ error: `no comp with slug "${req.params.slug}"` });
  res.json(comp);
});

app.get('/api/guides', async (req, res) => {
  res.json({ guides: await listGuides(readLang(req.query.lang)) });
});

app.get('/api/guides/:slug', async (req, res) => {
  const [guide] = await listGuides(readLang(req.query.lang), req.params.slug);
  if (!guide) return res.status(404).json({ error: `no guide with slug "${req.params.slug}"` });
  res.json(guide);
});

app.get('/api/tft/set', async (_req, res) => {
  const meta = await getMeta();
  const [champions, traits, items, augments] = await Promise.all([
    pool.query('SELECT * FROM champions ORDER BY cost, name'),
    pool.query('SELECT * FROM traits ORDER BY name'),
    pool.query('SELECT * FROM items ORDER BY name'),
    pool.query('SELECT * FROM augments ORDER BY name'),
  ]);
  res.json({ patch: meta.patch ?? 'latest', set: Number(meta.set_number ?? 0), set_name: meta.set_name ?? '', champions: champions.rows, traits: traits.rows, items: items.rows, augments: augments.rows });
});

app.post('/api/tft/refresh', async (req, res) => {
  const expected = process.env.REFRESH_TOKEN;
  if (!expected) return res.status(503).json({ error: 'REFRESH_TOKEN is not configured' });
  if (!bearerOk(req.headers.authorization, expected)) return res.status(401).json({ error: 'unauthorized' });

  const data = await syncTft(pool);
  res.json({
    ok: true,
    summary: [
      `set ${data.set.number} (${data.set.mutator})`,
      `${data.champions.length} champions, ${data.traits.length} traits, ${data.items.length} items, ${data.augments.length} augments`,
      `patch ${data.patch}`,
    ],
  });
});

app.post('/api/admin/login', (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured' });
  const provided = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!tokensMatch(adminToken(provided), adminToken(expected))) {
    return res.status(401).json({ error: 'wrong password' });
  }
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${adminToken(expected)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
  res.json({ ok: true });
});

app.delete('/api/admin/login', (_req, res) => {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

app.use('/api/admin', (req, res, next) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured' });
  const provided = cookieValue(req.headers.cookie, ADMIN_COOKIE);
  if (tokensMatch(provided, adminToken(expected))) return next();
  res.status(401).json({ error: 'unauthorized' });
});

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

app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`metaboard server on http://localhost:${port}`));
