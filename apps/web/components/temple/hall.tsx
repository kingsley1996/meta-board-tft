// Những tấm sheet của sảnh đền: bảng xếp hạng, bảng đồng hành, túi đồ, cẩm nang lối
// chơi, cài đặt.
//
// Lớp CSS và cây DOM giữ theo bản gốc (rank-row/podium/wish-card/card/setting…), chỉ
// thay innerHTML bằng JSX. Số liệu đều lấy từ apps/api, không có bản sao ở máy khách.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Gain } from './api';
import { get, post, put } from './api';
import { HERO_SPRITE, HEROES, ITEMS, Sound, TEMPLE, TRACKS, local, sectOf } from './engine';
import { luckyShower } from './effects';
import { guideOf, storyOf } from './stories';
import { Icon, Sheet, ago, fmt, type Look, type Store } from './ui';

type RankRow = { rank: number; id: number; name: string; sect: string; title: string; honor: string; score: number; you: boolean };
type Board = { scope: string; rows: RankRow[]; sects: { sect: string; score: number }[]; me: { rank: number | null; score: number } };
type Donation = { name: string; note: string; amount: number; at: string };
type SteleRow = { name: string; title: string; score: number };

const SCOPES = [
  { id: 'day', label: 'Hôm nay' },
  { id: 'week', label: 'Tuần này' },
  { id: 'all', label: 'Tất cả' },
];

// ---- Bảng xếp hạng ------------------------------------------------------------

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
    <Sheet title="BXH Cầu May" onClose={onClose} tabs={SCOPES} tab={scope} onTab={setScope}>
      <p className="muted">Bảng chuyên cần theo Điểm May Mắn, không phải thứ hạng xếp hạng đơn.</p>
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
                  <Icon name={`sect-${r.sect}`} /> {r.title}
                </small>
                {r.honor ? (
                  <span className="honor">
                    <Icon name="spark" /> {r.honor}
                  </span>
                ) : null}
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

// ---- Bia tri ân --------------------------------------------------------------

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
      s.engine?.stele(st.rows);
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
      s.apply({ state: r.state, gained: r.gained });
      setNote('');
      Sound.spark();
      luckyShower(24);
      await load();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <Sheet title="Bảng đồng hành" onClose={onClose}>
      <div className="comm">
        <div className="comm-hero">
          <div className="hero-glow" />
          <div className="hero-ic">
            <Icon name="heart" />
          </div>
          <div className="hero-body">
            <b>Chia sẻ Tinh Hoa</b>
            <p>Tinh Hoa là điểm nội bộ kiếm từ cầu may, không nạp bằng tiền thật</p>
            <small>Tên bạn hiện trên bảng đồng hành theo số Tinh Hoa đã gửi.</small>
          </div>
        </div>
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
        <div className="region">Bảng đồng hành</div>
        {rows.map((r, i) => (
          <div className="rank-row" key={r.name}>
            <span className="no">
              <i className={`medal m${Math.min(3, i + 1)}`}>{i + 1}</i>
            </span>
            <span>
              <b>{r.name}</b>
              <small>{r.title}</small>
            </span>
            <span className="sc">{fmt(r.score)}</span>
          </div>
        ))}
        {!rows.length ? <div className="empty">Chưa ai gửi. Hãy là người đầu tiên hiện tên trên bảng.</div> : null}
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

// ---- Hồ sơ: tên hiển thị & nhân vật ------------------------------------------

// Cả hai cú đổi đều đi qua PUT /profile rồi refreshLook: máy chủ là nơi giữ tên và
// nhân vật, còn `look` trên sóng là cái báo cho phòng vẽ lại avatar của chính mình.
export function ProfileSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const st = s.state;
  const [name, setName] = useState(st?.name ?? '');
  const [busy, setBusy] = useState(false);
  const hero = st?.appearance?.hero ?? '';
  const trimmed = name.trim();
  const dirty = trimmed !== '' && trimmed !== (st?.name ?? '');

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

  return (
    <Sheet title="Hồ sơ" onClose={onClose}>
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
      <div className="hero-grid modal-hero-grid">
        {HEROES.map((h) => (
          <button
            key={h.id}
            type="button"
            className={`hero-card${h.id === hero ? ' on' : ''}`}
            disabled={busy}
            onClick={() => void patch({ appearance: { ...st?.appearance, hero: h.id } }, `Đã mời ${h.name}`)}
          >
            <span className="hc-thumb" style={{ backgroundPosition: HERO_SPRITE[h.id] ?? '0% 0%' }} />
            <span className="hc-meta">
              <b>{h.name}</b>
              <small>{h.title}</small>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
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
function ItemIcon({ id }: { id: string }) {
  const it = ITEMS[id];
  const color = String(it?.data?.color ?? it?.data?.c1 ?? '#6b4a2a');
  return (
    <span className="ic tint" style={{ background: color }}>
      <Icon name="gift" />
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
      s.apply({ state: r.state, gained: r.gained });
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
