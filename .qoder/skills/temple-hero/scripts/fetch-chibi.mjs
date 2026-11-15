// Tai splash "Chibi <Ten> Base Tier 1" cua Riot tu Fandom, va ghi vao THU MUC BEN
// (khong phai /tmp: macOS don /tmp sau vai ngay, danh sach tham chieu mat theo —
// xay ra 2026-11-14 khi ca /tmp/llref cua 25 anh bi xoa sach).
//
//   node .qoder/skills/temple-hero/scripts/fetch-chibi.mjs Ahri Ashe Lux
//   REF=/duong/dac/bat node .../fetch-chibi.mjs        # doi cho ghi
//
// Hai buoc, ca hai deu phai di qua trinh duyet that:
//   1) curl bi Cloudflare chan o MOI duong dan fandom (kể cả api.php), nen mo
//      mot trang wiki lay CF clearance truoc.
//   2) api.php `prop=imageinfo` tra ve `url` chi thang sang static.wikia.nocookie.net
//      (chieu dai/hash duong dan khong doan duoc). goto chinh URL do, doc body.
//      CDN KHONG BAO GIO tra PNG goc: dung Accept nao (kể cả curl khong Accept)
//      cung ra WEBP; ep `Accept: image/png` thi bi 403. Nen tep la PNG goc cua
//      chinh no, do sharp decode WEBP roi ghi PNG lossless — do mau tren mat
//      WEBP nen bang PNG vi moi script do deu resize 512 va lay median 5x5.
// In mot dong moi ten: "<Ten> | <W>x<H> | <kb> | <duong dan>" hoac "KHONG CO"/"ERR".
// Ten truyen vao dung ten tuong; Fandom doi hoa daut va ghi dau cach bang `_`:
// "Miss Fortune" → File:Chibi_Miss_Fortune_Base_Tier_1.png
import { chromium } from 'playwright';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// sharp nam o node_modules goc repo → di chuan cua repo bang duong dan tu chinh
// tep nay (khong hardcode may nguoi dung) roi createRequire tu do.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const sharp = createRequire(path.join(REPO, 'package.json'))('sharp');

const REF = process.env.REF || path.join(process.env.HOME, 'ai-projects/temple-preview/ref');
const names = process.argv.slice(2);
if (!names.length) {
  console.log('dung: fetch-chibi.mjs <Ten> [<Ten> ...]   (vi du: Ahri Morgana Sett)');
  process.exit(2);
}
fs.mkdirSync(REF, { recursive: true });

const b = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 900, height: 700 } });
const p = await ctx.newPage();
// Chi ep Accept o CDN anh; de long lang no thi api.php mat JSON theo negotiated type.
await ctx.route('**/leagueoflegends/images/**', (r) =>
  r.continue({ headers: { ...r.request().headers(), Accept: 'image/png' } })
);
await p.goto('https://leagueoflegends.fandom.com/wiki/League_of_Legends_Wiki', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
});

for (const n of names) {
  const title = `File:Chibi_${n.replace(/ /g, '_')}_Base_Tier_1.png`;
  const api =
    'https://leagueoflegends.fandom.com/api.php?action=query&format=json&prop=imageinfo' +
    '&iiprop=url%7Csize&titles=' + encodeURIComponent(title);
  const out = path.join(REF, `Chibi_${n.replace(/ /g, '_')}.png`);
  try {
    const j = await (await p.goto(api, { waitUntil: 'load', timeout: 45000 })).json();
    const pages = j.query?.pages || {};
    const ii = Object.values(pages)[0]?.imageinfo?.[0];
    if (!ii) {
      console.log(`${n} | KHONG CO tep ${title}`);
      continue;
    }
    const r = await p.goto(ii.url, { waitUntil: 'load', timeout: 45000 });
    const buf = await r.body();
    const fourcc = buf.slice(12, 16).toString('ascii');
    const isPng = buf.slice(1, 4).toString('ascii') === 'PNG';
    if (!isPng && !/^VP[8X]/.test(fourcc)) {
      console.log(`${n} | NOT-IMAGE ${(buf.length / 1024) | 0}kb fourcc=${fourcc}`);
      continue;
    }
    // WEBP (luon la truong hop o day) -> PNG lossless de cac script do mau doc nhu nhau
    const png = isPng ? buf : await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(out, png);
    const m = await sharp(png).metadata();
    console.log(`${n} | ${m.width}x${m.height} | ${isPng ? 'PNG' : 'WEBP->PNG'} ${(png.length / 1024) | 0}kb | ${out}`);
  } catch (e) {
    console.log(`${n} | ERR ${e.message.slice(0, 70)}`);
  }
}
await b.close();
