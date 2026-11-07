// Những tấm sheet của sảnh đền: bảng xếp hạng, bảng tri ân, túi đồ, cẩm nang lối
// chơi, cài đặt.
//
// Lớp CSS và cây DOM giữ theo bản gốc (rank-row/podium/wish-card/card/setting…), chỉ
// thay innerHTML bằng JSX. Số liệu đều lấy từ apps/api, không có bản sao ở máy khách.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Gain, TempleState } from './api';
import { get, post, put } from './api';
import { HERO_SPRITE, HEROES, ITEMS, Sound, TEMPLE, TRACKS, local, sectOf } from './engine';
import { luckyShower } from './effects';
import { guideOf, storyOf } from './stories';
import { LADDER_TOP, REALMS, REALM_ABOUT, ROMAN, realmLevels, rungOf } from '@/vendor/temple/js/ladder.js';
import { itemThumb } from '@/vendor/temple/js/thumbs.js';
import { GuestGate, Icon, Sheet, TitleBadge, ago, fmt, type Look, type Store } from './ui';

type RankRow = { rank: number; id: number; name: string; sect: string; title: string; honor: string; score: number; you: boolean };
type Board = { scope: string; rows: RankRow[]; sects: { sect: string; score: number }[]; me: { rank: number | null; score: number } };
type Donation = { name: string; note: string; amount: number; at: string };
type SteleRow = { name: string; title: string; score: number };

const SCOPES = [
  { id: 'day', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'all', label: 'Tất cả' },
];

// ---- Bảng xếp hạng ----------------------------------------------------------

export function RankSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [scope, setScope] = useState('week');
  const [board, setBoard] = useState<Board | null>(null);

  useEffect(() => {
    setBoard(null);
    void get<Board>(`/leaderboard?scope=${scope}`)
      .then(setBoard)
      .catch((e: Error) => s.toast(e.message));
  }, [scope]);

  const medal = (i: number) => (i <= 3 ? <i className={`medal m${i}`}>{i}</i> : <>{i}</>);
  const podium = board?.rows.slice(0, 3) ?? [];

  return (
    <Sheet title="Bảng Xếp Hạng" onClose={onClose} tabs={SCOPES} tab={scope} onTab={setScope}>
      <p className="muted">Đếm Điểm May Mắn hành trì trong khoảng đang xem, không phải hạng xếp hạng đơn.</p>
      <div className="region">Nhà lữ hành</div>
      {!board ? (
        <div className="empty">Đang mở bảng…</div>
      ) : (
        <>
          {podium.length ? (
            <div className="podium">
              {[1, 0, 2].map((k) => {
                const r = podium[k];
                if (!r) return <div key={k} />;
                const sect = sectOf(r.sect);
                return (
                  <div className={`pl p${k + 1}`} key={r.id}>
                    {k === 0 ? (
                      <svg className="crown">
                        <use href="#i-trophy" />
                      </svg>
                    ) : null}
                    <span className="ava" style={{ background: sect.color }}>
                      {(r.name.trim().split(/\s+/).pop() ?? '?')[0]?.toUpperCase()}
                    </span>
                    <TitleBadge title={r.title} size={38} />
                    <b>{r.name}</b>
                    <small>{fmt(r.score)} điểm</small>
                    <div className="pstep">{k + 1}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
          {board.rows.slice(3).map((r) => (
            <div className={`rank-row${r.you ? ' me' : ''}`} key={r.id}>
              <span className="no">{medal(r.rank)}</span>
              <span className="ava" style={{ background: sectOf(r.sect).color }}>
                {(r.name.trim().split(/\s+/).pop() ?? '?')[0]?.toUpperCase()}
              </span>
              <span>
                <b>{r.name}</b>
                <small>
                  <TitleBadge title={r.title} size={20} /> <Icon name={`sect-${r.sect}`} /> {r.title}
                </small>
              </span>
              <span className="sc">{fmt(r.score)}</span>
            </div>
          ))}
          {!board.rows.length ? <div className="empty">Chưa có ai. Hãy là người đầu tiên!</div> : null}
          <div className="me-rank">
            {board.me.rank ? (
              <div className="rank-row me">
                <span className="no">{board.me.rank}</span>
                <span className="ava" style={{ background: sectOf(s.state?.sect ?? '').color }}>
                  {(s.state?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span>
                  <b>Bạn</b>
                  <small>Điểm May Mắn cộng từ nhịp cầu may trong khoảng này</small>
                </span>
                <span className="sc">{fmt(board.me.score)}</span>
              </div>
            ) : (
              <p className="muted">Bạn chưa có điểm trong khoảng này. Cầu may, Vòng quay Hex hay thiền đều ghi danh được.</p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---- Bảng tri ân --------------------------------------------------------------

const DONATE_CHIPS = [50, 100, 200, 500];

export function SteleSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [rows, setRows] = useState<SteleRow[]>([]);
  const [list, setList] = useState<Donation[]>([]);
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const [st, dn] = await Promise.all([get<{ rows: SteleRow[] }>('/stele'), get<{ rows: Donation[] }>('/donations')]);
      setRows(st.rows);
      setList(dn.rows);
      s.engine?.meritPlaque(st.rows);
    } catch (e) {
      s.toast((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const give = async () => {
    try {
      const r = await post<Gain>('/donations', { amount, note: note.trim() });
      s.apply(r);
      setNote('');
      Sound.spark();
      luckyShower(24);
      await load();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <Sheet title="Bảng Tri Ân" onClose={onClose}>
      <div className="comm">
        <div className="comm-hero">
          <div className="hero-glow" />
          <div className="hero-ic">
            <Icon name="heart" />
          </div>
          <div className="hero-body">
            <b>Chia sẻ Tinh Hoa</b>
            <p>Tinh Hoa là điểm nội bộ kiếm từ cầu may, không nạp bằng tiền thật</p>
            <small>Tên bạn được khắc trên bảng theo số Tinh Hoa đã đóng góp.</small>
          </div>
        </div>
        {s.guest ? (
          <GuestGate s={s} what="Bảng Tri Ân" />
        ) : (
          <>
            <div className="chips">
              {DONATE_CHIPS.map((n) => (
                <button key={n} className={n === amount ? 'on' : ''} onClick={() => setAmount(n)}>
                  <Icon name="hex" /> {n}
                </button>
              ))}
            </div>
            <div className="sg-form">
              <input maxLength={120} placeholder="Lời nhắn (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn gold" disabled={amount > (s.state?.sen ?? 0)} onClick={() => void give()}>
                Gửi {fmt(amount)} Tinh Hoa
              </button>
            </div>
            <p className="muted">
              Ví đang có {fmt(s.state?.sen ?? 0)} Tinh Hoa.
            </p>
          </>
        )}
        <div className="region">Ghi danh đóng góp</div>
        {rows.map((r, i) => (
          <div className="rank-row" key={`${i}-${r.name}`}>
            <span className="no">
              <i className={`medal m${Math.min(3, i + 1)}`}>{i + 1}</i>
            </span>
            <span>
              <b>{r.name}</b>
              <small>
                <TitleBadge title={r.title} size={20} /> {r.title}
              </small>
            </span>
            <span className="sc">{fmt(r.score)}</span>
          </div>
        ))}
        {!rows.length ? <div className="empty">Chưa ai đóng góp. Hãy là người đầu tiên hiện tên trên bảng.</div> : null}
        <div className="region">Lời nhắn gần đây</div>
        {list.map((d, i) => (
          <div className="dn-row" key={i}>
            <span>
              <b>{d.name}</b> {d.note ? `· “${d.note}”` : ''}
              <small>{ago(d.at)}</small>
            </span>
            <span className="sc">
              <Icon name="hex" /> {fmt(d.amount)}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---- Hồ sơ: bậc, tên hiển thị & nhân vật --------------------------------------

// Ba thứ trên một tấm Hồ sơ: mình đang đứng đâu trên thang (dẫn xuất từ exp, server
// tính), mình tên gì (PUT /profile), và mình mặc hình nào (POST /hero — có ví ở đó).
export function ProfileSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const st = s.state;
  const [name, setName] = useState(st?.name ?? '');
  const [busy, setBusy] = useState(false);
  // Giá một hình mới đọc từ server cho *đúng tài khoản này* (heroes.ts:priceFor): người
  // thường là 100, admin là 0 — HUD không tự suy ra quy tắc từ cờ admin, và cũng không
  // giữ bản sao nào của con số 100. null = chưa đọc được giá, khác với 0 = được miễn.
  const [price, setPrice] = useState<number | null>(null);
  const hero = st?.appearance?.hero ?? '';
  const owned = st?.heroes ?? [];
  // Bộ sưu tập còn trống = người này chưa chọn lần nào, nên cả 12 ô đang cùng một giá:
  // miễn phí. Đây là nhánh "lần đầu" của đề bài, không phải nhánh đã sở hữu.
  const untouched = owned.length === 0;
  // Giá 0 từ server nghĩa là cả 12 ô đều bấm được ngay, không ô nào mang nhãn khoá.
  const openAll = price === 0;
  const trimmed = name.trim();
  const dirty = trimmed !== '' && trimmed !== (st?.name ?? '');

  useEffect(() => {
    void get<{ cost: number }>('/hero')
      .then((r) => setPrice(r.cost))
      // Đọc giá thất bại thì ô khoá chỉ còn dấu khoá: thà không hiện số hơn là hiện một
      // số của riêng máy khách.
      .catch(() => setPrice(null));
  }, []);

  const patch = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await put<{ profile: Look }>('/profile', body);
      s.refreshLook(r.profile);
      await s.refresh();
      s.toast(ok);
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Cú đổi hình không đi qua PUT /profile nữa: giá phải trừ ở nơi có ví, và state trong
  // response là số dư *sau* cú trừ nên ví + bộ sưu tập + avatar vẽ lại cùng một nhịp.
  const pick = async (id: string, label: string) => {
    setBusy(true);
    try {
      const r = await post<{ state: TempleState; spent: number }>('/hero', { hero: id });
      s.apply({ state: r.state, gained: 0 });
      s.refreshLook({ name: r.state.name, sect: r.state.sect, appearance: r.state.appearance, equipped: r.state.equipped });
      s.toast(r.spent ? `Đã mời ${label} · −${fmt(r.spent)} Kim Cương` : `Đã mời ${label}`);
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // exp_prev/exp_next là hai mốc của riêng bậc này (state.ts), nên thanh dưới đây đo
  // đoạn đường *trong* bậc chứ không phải tỉ lệ trên cả thang như chip ở HUD.
  const span = st ? st.exp_next - st.exp_prev : 0;
  const pct = st && span > 0 ? Math.max(0, Math.min(100, ((st.exp - st.exp_prev) / span) * 100)) : 0;
  const toNext = st ? Math.max(0, st.exp_next - st.exp) : 0;
  const atTop = st ? st.level >= LADDER_TOP : false;

  return (
    <Sheet title="Hồ sơ" onClose={onClose}>
      {st ? (
        <div className="pf-rank">
          <TitleBadge level={st.level} size={40} />
          <div className="pf-rank-body">
            <div className="pf-rank-line">
              <b>
                {st.title} · Bậc {st.level}
              </b>
              <span className="muted">{fmt(st.exp)} Điểm May Mắn</span>
            </div>
            <span className="xp pf-xp">
              <i style={{ width: `${pct}%` }} />
            </span>
            <small className="muted">
              {atTop
                ? 'Đỉnh thang rồi — không còn bậc nào phía trên.'
                : `Còn ${fmt(toNext)} Điểm May Mắn tới Bậc ${st.level + 1}${st.level + 1 === LADDER_TOP ? ' · Đỉnh Như Ý' : ''}.`}
            </small>
          </div>
        </div>
      ) : null}
      {s.guest ? (
        <GuestGate s={s} what="Việc đổi tên" />
      ) : (
        <>
          <form
            className="sg-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (dirty) void patch({ name: trimmed }, 'Đã đổi tên');
            }}
          >
            <input value={name} maxLength={28} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" aria-label="Tên hiển thị" />
            <button className="btn small gold" disabled={!dirty || busy}>
              Đổi tên
            </button>
          </form>
          <p className="muted">Tối đa 28 chữ, mọi người trong sảnh thấy tên này.</p>
        </>
      )}
      <p className="muted hero-note">
        {openAll
          ? `${owned.length}/12 nhân vật đã mở · tài khoản quản trị đổi được mọi hình, không trừ Kim Cương.`
          : untouched
            ? `Chọn một nhân vật, lần đầu miễn phí.${price ? ` Mỗi hình mới sau đó trả ${fmt(price)} Kim Cương.` : ''}`
            : `${owned.length}/12 nhân vật đã mở · đã mở thì dùng lại miễn phí${price ? `, hình mới ${fmt(price)} Kim Cương` : ''}.`}
      </p>
      <div className="hero-grid modal-hero-grid">
        {HEROES.map((h) => {
          const current = h.id === hero;
          const has = owned.includes(h.id);
          // Khoá = chưa mở mà cũng không còn suất miễn phí đầu, và server không trả giá 0
          // cho tài khoản này. Bấm vào vẫn được: server trả 409 kèm đúng số dư, HUD không
          // được đoán hộ người chơi mua nổi hay không.
          const locked = !current && !has && !untouched && !openAll;
          return (
            <button key={h.id} type="button" className={`hero-card${current ? ' on' : ''}${locked ? ' locked' : ''}`} disabled={busy} onClick={() => void pick(h.id, h.name)}>
              <span className="hc-thumb" style={{ backgroundPosition: HERO_SPRITE[h.id] ?? '0% 0%' }} />
              <span className="hc-meta">
                <b>{h.name}</b>
                <small>{h.title}</small>
              </span>
              {current ? <span className="hc-flag">Đang dùng</span> : null}
              {locked ? (
                <span className="hc-cost">
                  <Icon name="ngoc" /> {price ? fmt(price) : 'khoá'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {s.isAdmin ? <AdminBlock s={s} /> : null}
    </Sheet>
  );
}

// Khối Quản trị: chỉ hiện với tài khoản admin (users.role = 'admin'), và hai tuyến
// /api/temple/admin/* vẫn tự chặn 403 ở server (admin.ts:withAdmin) — đây là lối tắt
// cho người vận hành thử bậc/thử đồ, không phải cửa sau để máy khách tự sửa số.

// rungLabel đã chứa chữ "bậc" (bậc trong một vận), nên ghép thêm "Bậc 4 ·" vào nó thì
// thành đôi. Trong dropdown của khối Quản trị dùng thẳng tên vận + vị trí trên thang.
const rungName = (level: number) => `${REALMS[rungOf(level).realm - 1]} · Bậc ${level}`;

function AdminBlock({ s }: { s: Store }) {
  const st = s.state;
  const [level, setLevel] = useState(st?.level ?? 1);
  const [busy, setBusy] = useState(false);

  const run = async (path: string, body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await post<{ state: TempleState }>(`/admin/${path}`, body);
      s.apply({ state: r.state, gained: 0 });
      // Nhãn trên đầu avatar do phòng phát từ hồ sơ trên dây, nên đổi bậc phải báo
      // một nhịp — nếu không thì chính admin vẫn thấy bậc cũ cho tới khi tải lại.
      s.room?.send({ t: 'look' });
      s.toast(ok);
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-block">
      <h4>Quản trị</h4>
      <form
        className="sg-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (level !== st?.level) void run('level', { level }, `Đã đặt ${rungName(level)}`);
        }}
      >
        <select value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Bậc của nhân vật">
          {Array.from({ length: LADDER_TOP }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {rungName(n)}
            </option>
          ))}
        </select>
        <button className="btn small gold" disabled={busy || level === st?.level}>
          Đặt bậc
        </button>
      </form>
      <button className="btn small ghost" disabled={busy} onClick={() => void run('gear', {}, 'Đã cấp toàn bộ trang bị vào túi')}>
        Cấp toàn bộ trang bị
      </button>
      <p className="muted">Chỉ áp lên nhân vật của chính tài khoản này. Trang bị lại từng món ở Túi đồ.</p>
    </div>
  );
}

// ---- Túi đồ ------------------------------------------------------------------

const BAG_TABS = [
  { id: 'consumable', label: 'Đồ Dâng' },
  { id: 'robe', label: 'Áo Choàng' },
  { id: 'beads', label: 'Dây Chuyền' },
  { id: 'cushion', label: 'Bệ Ngồi' },
  { id: 'hat', label: 'Mũ' },
  { id: 'staff', label: 'Gậy' },
  { id: 'cloud', label: 'Mây' },
  { id: 'pet', label: 'Linh Thú' },
];

const UNEQUIPPABLE = ['hat', 'staff', 'cloud', 'pet'];

// Hình minh hoạ cho món đồ: đúng lối của bản gốc — thumbs.js dựng từng món bằng một
// WebGLRenderer tạm 144px, lưu dataURL theo id rồi giải phóng context. Món không có
// cảnh vẽ (đồ dâng, bí kiếp) hoặc máy không có WebGL thì ở lại ô phẳng nhuộm màu.
export function ItemIcon({ id }: { id: string }) {
  const it = ITEMS[id];
  const color = String(it?.data?.color ?? it?.data?.c1 ?? '#6b4a2a');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!it) return;
    void itemThumb(it).then((t: string | null) => {
      if (live) setSrc(t);
    });
    return () => {
      live = false;
    };
  }, [it]);
  if (!src) {
    return (
      <span className="ic tint" style={{ background: color }}>
        <Icon name="gift" />
      </span>
    );
  }
  return (
    <span className="ic thumb">
      <img src={src} alt="" width={72} height={72} />
    </span>
  );
}

export function BagSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [tab, setTab] = useState('consumable');
  const inv = s.state?.inventory ?? {};
  const equipped = s.state?.equipped ?? {};

  const list = (Object.keys(ITEMS) as string[]).filter((id) => {
    const it = ITEMS[id];
    if (it.type !== tab) return false;
    return tab === 'consumable' ? (inv[id] ?? 0) > 0 : it.id in inv;
  });

  // Mặc/ tháo: một cú PUT /profile rồi engine vẽ lại chính avatar đó, để người khác
  // trong phòng cũng thấy đổi (pushLook của room dùng hồ sơ máy chủ).
  const wear = async (slot: string, id: string | null) => {
    try {
      const r = await put<{ profile: { appearance: Record<string, string>; equipped: Record<string, string | null> } }>('/profile', {
        equipped: { ...equipped, [slot]: id },
      });
      s.refreshLook(r.profile);
      Sound.tap();
      await s.refresh();
      s.toast(id ? 'Đã thay đổi' : 'Đã tháo');
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const use = async (id: string) => {
    try {
      const r = await post<Gain & { left: number }>('/use', { item: id });
      s.apply(r);
      if (id === 'huong_tram' || id === 'nen_sap' || id === 'hoa_dang') s.engine?.offer(id);
      Sound.tap();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <Sheet title="Túi đồ" onClose={onClose} tabs={BAG_TABS} tab={tab} onTab={setTab}>
      {list.map((id) => {
        const it = ITEMS[id];
        const stack = tab === 'consumable';
        const worn = equipped[it.type ?? ''] === id;
        return (
          <div className="card" key={id}>
            <ItemIcon id={id} />
            <div className="body">
              <b>{it.name}</b> {stack ? <small>×{inv[id] ?? 0}</small> : null}
              <p>{it.description ?? ''}</p>
            </div>
            <div className="side">
              {tab === 'consumable' ? (
                <button className="btn small gold" onClick={() => void use(id)}>
                  Dùng
                </button>
              ) : worn ? (
                UNEQUIPPABLE.includes(tab) ? (
                  <button className="btn small ghost" onClick={() => void wear(tab, null)}>
                    Tháo
                  </button>
                ) : (
                  <span className="tag gold">Đang dùng</span>
                )
              ) : (
                <button className="btn small gold" onClick={() => void wear(tab, id)}>
                  Dùng
                </button>
              )}
            </div>
          </div>
        );
      })}
      {!list.length ? <div className="empty">Ngăn này trống. Vòng quay Hex mỗi ngày và nhịp cầu may sẽ tặng thêm đồ.</div> : null}
    </Sheet>
  );
}

// ---- Cửa hàng ----------------------------------------------------------------

// Bốn chữ này là PET_RANK của bản gốc (main.js:3426) — cùng thứ tự vận đang in trên
// khung danh hiệu, chỉ khác chỗ nó gắn lên món đồ chứ không lên người.
export const RANK_LABEL: Record<string, string> = { thuong: 'Thường', quy: 'Quý', hiem: 'Hiếm', toi_thuong: 'Tối thượng' };

// Cửa hàng chỉ bày món có giá trong meta.json. Máy khách đọc cùng tệp asset nên biết
// giá để vẽ, nhưng cái giá bấm mua là máy chủ tra lại ở catalog.ts — sửa body không
// đổi được giá.
export function ShopSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [tab, setTab] = useState('consumable');
  const inv = s.state?.inventory ?? {};
  const level = s.state?.level ?? 1;

  const buy = async (id: string, currency: 'sen' | 'ngoc') => {
    try {
      const r = await post<Gain & { item: string }>('/shop/buy', { item: id, currency });
      s.apply(r);
      Sound.spark();
      s.toast(`Đã mua ${ITEMS[id]?.name ?? id}`);
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  // `default` là đồ ngày đầu đã mặc sẵn trên người, không bày bán — đó đúng là quy tắc
  // của bản gốc (main.js:2503), và cũng là 4 món Lão Hành Khất giữ.
  const list = Object.values(ITEMS).filter((it) => it.type === tab && it.data?.default !== true);

  return (
    <Sheet title="Cửa hàng" onClose={onClose} tabs={BAG_TABS} tab={tab} onTab={setTab}>
      {list.map((it) => {
        const stack = tab === 'consumable';
        const have = !stack && it.id in inv;
        const locked = level < (it.unlock_level ?? 1);
        const rank = String(it.data?.rank ?? '');
        const priced = (it.price_sen ?? 0) > 0 || (it.price_ngoc ?? 0) > 0;
        return (
          <div className={`card${rank ? ` rank-${rank}` : ''}`} key={it.id}>
            <ItemIcon id={it.id} />
            <div className="body">
              <b>{it.name}</b>
              {rank ? <span className="tag rank">{RANK_LABEL[rank] ?? 'Hiếm'}</span> : null} {stack ? <small>(có {inv[it.id] ?? 0})</small> : null}
              <p>{it.description ?? ''}</p>
              {!priced ? (
                <div className="lock">
                  <Icon name="spark" /> Không bày bán — Lão Hành Khất giữ món này, đổi duyên lấy.
                </div>
              ) : null}
              {locked ? (
                <div className="lock">
                  <Icon name="lock" /> Cần cấp {it.unlock_level}
                </div>
              ) : null}
            </div>
            <div className="side">
              {have ? (
                <span className="tag green">Đã có</span>
              ) : (
                <>
                  {(it.price_sen ?? 0) > 0 ? (
                    <button className="btn small gold" disabled={locked} onClick={() => void buy(it.id, 'sen')}>
                      <Icon name="sen" /> {fmt(it.price_sen ?? 0)}
                    </button>
                  ) : null}
                  {(it.price_ngoc ?? 0) > 0 ? (
                    <button className="btn small ghost" disabled={locked} onClick={() => void buy(it.id, 'ngoc')}>
                      <Icon name="ngoc" /> {fmt(it.price_ngoc ?? 0)}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      })}
      {!list.length ? <div className="empty">Ngăn này trống.</div> : null}
    </Sheet>
  );
}

// ---- Lối chơi & cách chơi ----------------------------------------------------

export function GuideSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const sect = s.state?.sect ?? 'flex';
  const [tab, setTab] = useState(sect);
  const g = guideOf(tab);
  const story = storyOf(TEMPLE.id);

  return (
    <Sheet title="Cẩm nang" onClose={onClose}>
      <div className="tabs howto-tabs">
        {['reroll', 'fast8', 'fast9', 'tempo', 'flex'].map((id) => (
          <button key={id} className={id === tab ? 'on' : ''} onClick={() => setTab(id)}>
            {sectOf(id).name}
          </button>
        ))}
      </div>
      <div className="prose howto">
        {g ? (
          <>
            <h3>{g.subtitle}</h3>
            <p>{g.origin}</p>
            <h4>
              <Icon name="book" /> Nhịp chơi
            </h4>
            {g.practice.map((p) => (
              <p key={p.title}>
                <b>{p.title}.</b> {p.text}
              </p>
            ))}
            <h4>
              <Icon name="pray" /> Trong sảnh này
            </h4>
            <p>{g.inApp}</p>
            <h4>
              <Icon name="spark" /> Lời chúc
            </h4>
            {g.chants.map((c) => (
              <p key={c.name}>
                <b>{c.name}:</b> {c.text}
              </p>
            ))}
          </>
        ) : (
          <p className="muted">Chưa có bài viết cho lối chơi này.</p>
        )}
        <h4>
          <Icon name="temple" /> {TEMPLE.name}
        </h4>
        <p>{story.intro}</p>
        {story.visitTip ? <p className="muted">{story.visitTip}</p> : null}
        <h4>
          <Icon name="spark" /> Cách chơi
        </h4>
        <p>Kéo nửa trái màn hình để đi, vuốt nửa phải để xoay góc nhìn. Chạm bệ ngồi để ngồi.</p>
        <p>Cầu may · Thiền · Dâng bùa · Quét sân. Mọi con số Điểm May Mắn đều do máy chủ tính, kể cả khi bạn đổi thiết bị.</p>
        <p>Máy tính: W A S D đi lại · B cầu may · E ngồi/đứng.</p>
        <h4>
          <Icon name="medal" /> Bảy vận cầu may
        </h4>
        <p className="muted">
          Thang có 19 mốc, gom lại thành bảy vận — ba bậc một vận, riêng đỉnh Như Ý một bậc. Vận nào khung
          ấy, ấn ấy; bạn đang ở {s.state ? `vận ${ROMAN[rungOf(s.state.level).realm - 1]}` : 'vận đầu'}.
        </p>
        <div className="realm-list">
          {REALMS.map((name, i) => {
            const [from, to] = realmLevels(i + 1);
            return (
              <div className={`realm-row${s.state && rungOf(s.state.level).realm === i + 1 ? ' on' : ''}`} key={name}>
                <TitleBadge title={name} size={30} />
                <div className="rl-body">
                  <b>
                    {name} <small>· bậc {from === to ? from : `${from}–${to}`}</small>
                  </b>
                  <p>{REALM_ABOUT[i]}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

// ---- Cài đặt -----------------------------------------------------------------

const VOLUMES: [string, string, string][] = [
  ['master', 'sound', 'Âm lượng tổng'],
  ['music', 'sound', 'Nhạc nền'],
  ['sfx', 'spark', 'Hiệu ứng'],
];

export function SettingsSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [, bump] = useState(0);
  const again = () => bump((n) => n + 1);

  const playing = TRACKS.find((t) => t.id === Sound.trackId) ?? null;

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // trình duyệt từ chối (chưa có tương tác, hoặc iOS) thì thôi
    }
    again();
  };

  return (
    <Sheet title="Cài đặt" onClose={onClose}>
      <label className="setting">
        <Icon name="bell" /> Âm thanh{' '}
        <input
          type="checkbox"
          checked={!!Sound.enabled}
          onChange={(e) => {
            Sound.setEnabled(e.target.checked);
            again();
          }}
        />
      </label>
      <label className="setting">
        <Icon name="sound" /> Nhạc nền{' '}
        <input
          type="checkbox"
          checked={!!Sound.musicOn}
          onChange={(e) => {
            Sound.init();
            Sound.setMusicOn(e.target.checked);
            again();
          }}
        />
      </label>
      <div className="region">Bảng nhạc</div>
      <div className="chips music-chips">
        {TRACKS.map((t) => (
          <button
            key={t.id}
            className={t.id === Sound.trackId ? 'on' : ''}
            onClick={() => {
              Sound.init();
              if (!Sound.musicOn) Sound.setMusicOn(true); // chọn bài là phải nghe thấy bài đó
              Sound.setTrack(t.id);
              again();
            }}
          >
            {t.title}
          </button>
        ))}
      </div>
      <p className="muted music-note">
        {playing ? (
          <>
            Đang phát <b>{playing.title}</b> · {playing.artist} ·{' '}
            <a href={playing.url} target="_blank" rel="noopener noreferrer">
              {playing.license}
            </a>
          </>
        ) : Sound.musicOn ? (
          'Chưa chọn bài nào.'
        ) : (
          'Nhạc nền đang tắt.'
        )}
      </p>
      <div className="vol-box">
        {VOLUMES.map(([key, icon, label]) => (
          <label className="setting vol" key={key}>
            <Icon name={icon} /> <span>{label}</span>
            <input
              type="range"
              min={0}
              max={100}
              defaultValue={Math.round((Sound.vol[key as keyof typeof Sound.vol] ?? 0.8) * 100)}
              onChange={(e) => {
                Sound.init();
                Sound.setVolume(key, Number(e.target.value) / 100);
                Sound.tap();
              }}
            />
          </label>
        ))}
      </div>
      <label className="setting">
        <Icon name="sun" /> Không khí{' '}
        <button
          className="btn small ghost"
          onClick={() => {
            const next = s.engine?.nextAmbience();
            if (next) s.setAmbience(next);
          }}
        >
          {s.ambience}
        </button>
      </label>
      <label className="setting">
        <Icon name="tag" /> Hiện tên người khác{' '}
        <input
          type="checkbox"
          defaultChecked={local.get('names') !== false}
          onChange={(e) => {
            s.engine?.setShowNames(e.target.checked);
            again();
          }}
        />
      </label>
      <label className="setting">
        <Icon name="child" /> Hiện chú tiểu NPC{' '}
        <input
          type="checkbox"
          defaultChecked={local.get('npc') !== false}
          onChange={(e) => {
            s.engine?.setShowNpc(e.target.checked);
            again();
          }}
        />
      </label>
      <label className="setting">
        <Icon name="expand" /> Toàn màn hình{' '}
        <input type="checkbox" checked={!!document.fullscreenElement} onChange={() => void toggleFullscreen()} />
      </label>
      <p className="muted">
        Phiên bản này chỉ có một sảnh đền và một máy chủ: mọi người đang online đều gặp nhau ở đây.
      </p>
    </Sheet>
  );
}
