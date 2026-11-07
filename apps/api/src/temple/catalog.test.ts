// Gate cho kho đồ: cửa nào bán gì, và liệu một người thật có lấy được *mọi* món
// trong asset hay không.
//
// Vì sao test này không cần database: hai điều nó đo là số học trên meta.json và quy
// luật xoay ngày của chiếu duyên — cả hai đúng hay sai đều thấy được mà không cần ghi
// hàng nào. Phần "trừ tiền có atomic không" nằm ở shop.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG, DUYEN_POOL, SELLABLE, duyenPrice, isSold, isStackable, itemById } from './catalog.ts';
import { duyenOffers } from './shop.ts';

type RawItem = {
  id: string;
  type: string;
  price_sen?: number;
  price_ngoc?: number;
  unlock_level?: number;
  data?: Record<string, unknown>;
  enabled?: boolean;
};

// Asset vendored là nguồn, nên test đọc thẳng tệp gốc thay vì đọc lại phần đã lọc.
const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../web/vendor/temple/data/meta.json'), 'utf8'),
) as { items: RawItem[] };
const enabled = raw.items.filter((i) => i.enabled !== false);

test('the server catalog carries every enabled asset item with its authored numbers', () => {
  assert.equal(CATALOG.length, enabled.length, 'no item may be dropped by the catalog mapping');
  for (const it of enabled) {
    const c = itemById.get(it.id);
    assert.ok(c, `${it.id} is missing from the server catalog`);
    // Sai một trong bốn số này là máy chủ trừ tiền khác với con số HUD đang in ra.
    assert.equal(c!.price_sen, it.price_sen ?? 0, `${it.id} price_sen`);
    assert.equal(c!.price_ngoc, it.price_ngoc ?? 0, `${it.id} price_ngoc`);
    assert.equal(c!.unlock_level, it.unlock_level ?? 1, `${it.id} unlock_level`);
    assert.equal(c!.type, it.type, `${it.id} type`);
  }
});

test('every item has exactly one acquisition door', () => {
  // Hai cửa phải rời nhau và phủ kín: một món vừa có giá vừa không có giá là món mà
  // không ai giải thích được vì sao nó không mua được ở đâu cả.
  assert.equal(SELLABLE.length + DUYEN_POOL.length, CATALOG.length);
  assert.equal(new Set([...SELLABLE, ...DUYEN_POOL].map((i) => i.id)).size, CATALOG.length);
  for (const it of CATALOG) assert.equal(isSold(it) && DUYEN_POOL.includes(it), false, `${it.id} stands on two doors`);

  // Cửa hàng chỉ nhận đúng một loại tiền cho một món; nếu asset đổi sang món hai loại
  // tiền thì /shop/buy phải được viết lại có chủ ý, không phải âm thầm chọn bừa.
  for (const it of SELLABLE) assert.ok(!!it.price_sen !== !!it.price_ngoc, `${it.id} must be priced in exactly one currency`);
  for (const it of DUYEN_POOL) assert.equal(it.price_sen + it.price_ngoc, 0, `${it.id} has a price but sits on the hermit's mat`);

  // Đồ dâng là những món duy nhất mua dồn được, và cả ba đều có giá.
  assert.deepEqual(CATALOG.filter(isStackable).map((i) => i.id).sort(), ['hoa_dang', 'huong_tram', 'nen_sap']);
});

test('the daily rotation puts every unpriced item on the mat within a week', () => {
  // Người chơi không cần một "danh sách kho": chỉ cần chiếu duyên xoay đủ ngày.
  const owned = new Set<string>();
  const day0 = Date.parse('2026-11-06T00:00:00Z');
  const seen = new Set<string>();
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(day0 + i * 86_400_000).toISOString().slice(0, 10);
    const offers = duyenOffers(day, owned, 3);
    assert.ok(offers.length <= 3, `${day} offered more than the three portions api.js:916 allows`);
    for (const id of offers) {
      assert.ok(!owned.has(id), `${day} offered ${id}, already in the bag`);
      owned.add(id);
      seen.add(id);
    }
  }
  assert.deepEqual(
    DUYEN_POOL.map((i) => i.id).filter((id) => !seen.has(id)),
    [],
    'some unpriced item never appears on the hermit mat',
  );
});

test('the hermit ladder comes from the asset, and outranks the shop', () => {
  // Bảng này là số học trên meta.json, không phải số gõ vào: median price_ngoc của hàng
  // Quý cùng loại × 2.5 (tỷ giá 500 Sen : 200 Ngọc của ví ngày đầu), làm tròn bậc 10.
  //   robe 270→680   beads 220→550   cushion 220→550   hat 270→680   staff 280→700
  //   cloud 360→900  bí kiếp không có hàng Quý cùng loại nên lấy trần dải Quý 380→950
  const LADDER: Record<string, number> = { robe: 680, beads: 550, cushion: 550, hat: 680, staff: 700, cloud: 900, bikiep: 950 };
  const senTop = Math.max(...SELLABLE.filter((i) => i.price_sen > 0).map((i) => i.price_sen));
  assert.equal(senTop, 500, 'ao_vang is the priciest thing the shop sells for Sen');

  let purse = 0;
  for (const it of DUYEN_POOL) {
    const p = duyenPrice(it);
    purse += p;
    if (it.default) {
      assert.equal(p, 100, `${it.id} is the kit you arrive wearing — the gate of the original`);
      continue;
    }
    assert.equal(p, LADDER[it.type], `${it.id} (${it.type}) drifted off the Quý ladder`);
    assert.ok(p > senTop, `${it.id} at ${p} Sen must cost more than anything the shop sells for Sen`);
  }
  // Cả chiếu là một cái đích dài, không phải hai cú quay: 10.630 Sen trong khi vòng
  // quay kỳ vọng trả 21,5 Sen/ngày và một ngày chăm trung bình của roster bot là ~109.
  assert.equal(purse, 10_630);
});

test('the mat is the same for everyone on a day and skips what a player owns', () => {
  const day = '2026-12-24';
  const all = duyenOffers(day, new Set(), 3);
  assert.equal(all.length, 3);
  assert.deepEqual(duyenOffers(day, new Set(), 3), all, 'one day must show one mat to everyone');
  // Đổi xong món đầu thì ngày đó không ai đổi lại nó: chỗ trống được món kế tiếp thay.
  const afterOne = duyenOffers(day, new Set([all[0]]), 3);
  assert.deepEqual(afterOne.slice(0, 2), all.slice(1), 'the owned item must drop out, not leave a gap');
  assert.equal(afterOne.length, 3);
  assert.ok(!all.includes(afterOne[2]), 'the replacement is a fresh item');
  assert.equal(duyenOffers(day, new Set(all), 3).length, 3);
  assert.deepEqual(duyenOffers(day, new Set(DUYEN_POOL.map((i) => i.id)), 3), [], 'a full collection gets an empty mat');
  assert.deepEqual(duyenOffers(day, new Set(), 0), [], 'no portions left, nothing to show');
});
