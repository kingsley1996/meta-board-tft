// Kiems tra buoc (1) trong SKILL: mot id nhan vat phai xuat hien o dung nhung cho.
// Chay tu goc repo:  node .qoder/skills/temple-hero/scripts/check-ids.mjs [id-moi]
// In ra bang ok/THIEU tung cho va exit 1 neu HERO_LIST != HERO_IDS (server 404 hoac
// client roi ve hinh ngau nhien trong resolveHero).
import fs from 'fs';

const R = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8').normalize('NFC') : null);
const block = (s, marker) => {
  const i = s.indexOf(marker), s0 = s.indexOf('[', i), e0 = s.indexOf('\n]', s0);
  return s.slice(s0, e0);
};
// HERO_SPRITE la Record<string,string> = { ... }, cat den `\n}` dong dau tien.
const objBlock = (s, marker) => {
  const i = s.indexOf(marker), s0 = s.indexOf('{', i), e0 = s.indexOf('\n}', s0);
  return s.slice(s0, e0);
};
const av = R('apps/web/vendor/temple/js/avatar.js');
const he = R('apps/api/src/temple/heroes.ts');
const en = R('apps/web/components/temple/engine.ts');
if (!av || !he || !en) { console.log('phai chay tu goc repo (khong tim thay apps/...)'); process.exit(2); }

const heroes = [...block(av, 'HERO_LIST').matchAll(/id:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
const server = [...block(he, 'HERO_IDS').matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
const sprite = [...objBlock(en, 'HERO_SPRITE').matchAll(/^\s{2,4}([a-z_0-9]+):/gm)].map((m) => m[1]);
const same = JSON.stringify(heroes) === JSON.stringify(server);

console.log(`avatar.js HERO_LIST : ${heroes.length}`);
console.log(`heroes.ts HERO_IDS  : ${server.length}  ${same ? 'khop tung id, dung thu tu' : 'LECH: client [' + heroes.filter((x) => !server.includes(x)) + '] server [' + server.filter((x) => !heroes.includes(x)) + ']'}`);
console.log(`engine.ts HERO_SPRITE: ${sprite.length} o con anh sprite; 3D qua thumbs.js: [${heroes.filter((x) => !sprite.includes(x)).join(', ') || 'khong'}]`);
const bots = R('apps/api/src/temple/bots.ts');
if (bots) {
  const i = bots.indexOf('const ROSTER'), used = new Set([...bots.slice(i).matchAll(/hero:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]));
  const ghost = [...used].filter((x) => !heroes.includes(x));
  console.log(`bots.ts ROSTER       : ${used.size} hieu dung lai${ghost.length ? '  GON MAI: [' + ghost + ']' : ''}`);
}
for (const arg of process.argv.slice(2)) {
  console.log(`id moi "${arg}": HERO_LIST ${heroes.includes(arg) ? 'co' : 'THIEU'} | HERO_IDS ${server.includes(arg) ? 'co' : 'THIEU'} | HERO_SPRITE ${sprite.includes(arg) ? 'co o sprite (phai con cho trong tam 4x3!)' : 'khong co o -> render 3D qua thumbs.js'}`);
}
process.exit(same ? 0 : 1);
