// Server tinh cho tab xem truc tiep: mo harness.html + pho /js va /three thang toi
// repo, KHONG can symlink va KHONG can lenh dev :4173/:4000 (chay lenh do cung chang
// dem duoc avatar ra canvas - xem SKILL.md muc "Tab xem truc tiep").
//
//   node .qoder/skills/temple-hero/scripts/preview.mjs [hero] [--port 8899]
//
// Cache duoc tat hoan toan: moi lan F5 la doc lai avatar.js, nen sua code xong chi can
// bam F5. Mac dinh cua hero la hinh dang lam; no cung cai duoc trong ?hero= tren URL.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const REPO = resolve(new URL('../../../..', import.meta.url).pathname);
const SKILL = resolve(new URL('..', import.meta.url).pathname);
const ROOTS = [
  ['/', SKILL],
  ['/js/', join(REPO, 'apps/web/vendor/temple/js')],
  ['/three/', join(REPO, 'apps/web/node_modules/three')],
];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const args = process.argv.slice(2);
const hero = (args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a)) || 'ahri_chibi');
const port = Number(args[args.indexOf('--port') + 1] || args.find((a) => /^\d+$/.test(a)) || 8899);

async function fileFor(url) {
  const path = normalize(decodeURIComponent(url.split('?')[0]));
  if (path === '/' || path === '/index.html') {
    const f = join(SKILL, 'harness.html');
    return { f, html: true };
  }
  for (const [pre, dir] of ROOTS.slice(1)) {
    if (!path.startsWith(pre)) continue;
    const f = resolve(dir, '.' + path.slice(pre.length - 1));
    // chan duong thoat khoi dir khi URL co ../
    if (!f.startsWith(dir + '/')) return null;
    return { f };
  }
  return null;
}

createServer(async (req, res) => {
  const hit = await fileFor(req.url);
  const body = hit && (await readFile(hit.f).catch(() => null));
  if (!body) { res.writeHead(404).end('404'); return; }
  res.writeHead(200, {
    'Content-Type': hit.html ? MIME['.html'] : (MIME[extname(hit.f)] || 'application/octet-stream'),
    'Cache-Control': 'no-store',
  }).end(hit.html
    ? body.toString().replace('DEFAULT_HERO', hero)
    : body);
}).listen(port, '127.0.0.1', async () => {
  const ok = await stat(join(SKILL, 'harness.html')).catch(() => null);
  console.log(ok
    ? `http://127.0.0.1:${port}/?hero=${hero}  (Ctrl+C de dung)`
    : 'thieu harness.html ben canh script nay');
});
