// Những tấm sheet của chánh điện: bảng xếp hạng, vườn cây, bia tri ân, túi đồ, bài
// viết pháp môn, cài đặt — và khung Đèn nguyện neo bên phải màn hình.
//
// Lớp CSS và cây DOM giữ theo bản gốc (rank-row/podium/wish-card/card/setting…), chỉ
// thay innerHTML bằng JSX. Số liệu đều lấy từ apps/api, không có bản sao ở máy khách.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Gain, TempleState } from './api';
import { get, post, put } from './api';
import { ITEMS, Sound, TEMPLE, local, sectOf } from './engine';
import type { GardenPlant } from './engine';
import { launchLantern, petalShower } from './effects';
import { guideOf, storyOf } from './stories';
import { Icon, Sheet, ago, fmt, type Store } from './ui';

type RankRow = { rank: number; id: number; name: string; sect: string; title: string; honor: string; score: number; you: boolean };
type Board = { scope: string; rows: RankRow[]; sects: { sect: string; score: number }[]; me: { rank: number | null; score: number } };
type Lantern = { id: number; name: string; text: string; likes: number; mine: boolean; yours: string; rejoiced: boolean; at: string };
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
      .catch((e: Error) => s.toast(e.message));  }, [scope]);

  const max = Math.max(1, ...(board?.sects.map((x) => x.score) ?? [1]));
  const medal = (i: number) => (i <= 3 ? <i className={`medal m${i}`}>{i}</i> : <>{i}</>);
  const podium = board?.rows.slice(0, 3) ?? [];

  return (
    <Sheet title="Bảng xếp hạng tinh tấn" onClose={onClose} tabs={SCOPES} tab={scope} onTab={setScope}>
      {board?.sects.length ? (
        <>
          <div className="region">Thiền phái tinh tấn</div>
          <div className="sect-bars">
            {board.sects.map((x) => {
              const sect = sectOf(x.sect);
              return (
                <div className="sect-bar" key={x.sect}>
                  <span>
                    <Icon name={`sect-${x.sect}`} /> {sect.name}
                  </span>
                  <div className="bar">
                    <i style={{ width: `${(x.score / max) * 100}%`, background: sect.color }} />
                  </div>
                  <span>{fmt(x.score)}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      <div className="region">Phật tử tinh tấn</div>
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
                  <small>Điểm tinh tấn = công đức từ hành trì</small>
                </span>
                <span className="sc">{fmt(board.me.score)}</span>
              </div>
            ) : (
              <p className="muted">Bạn chưa có điểm trong giai đoạn này. Lạy Phật, lần hạt, thiền định để ghi danh nhé.</p>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

// ---- Vườn cây ----------------------------------------------------------------

const SEEDS = ['cay_bode', 'cay_sen', 'cay_sala'];

export function GardenSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [plants, setPlants] = useState<GardenPlant[]>([]);
  const [trees, setTrees] = useState(0);
  const [cap, setCap] = useState(50);

  const load = useCallback(async () => {
    try {
      const [p, g] = await Promise.all([get<{ plants: GardenPlant[]; cap: number }>('/plants'), get<{ trees: number }>('/garden')]);
      setPlants(p.plants);
      setCap(p.cap);
      setTrees(g.trees);
      s.engine?.plants(p.plants);
      s.engine?.gardenTrees(g.trees);
    } catch (e) {
      s.toast((e as Error).message);
    }  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plant = async (item: string) => {
    // Trồng ngay chỗ mình đang đứng: toạ độ do engine đo, không phải người chơi gõ số.
    const here = s.engine?.myPosition();
    try {
      const r = await post<Gain>('/plants', { item, x: here?.x ?? 0, z: here ? here.z + 2 : 6 });
      s.apply({ state: r.state, gained: r.gained });
      Sound.success();
      await load();
      s.toast(`<svg class="i"><use href="#i-lotus"/></svg> Đã trồng ${ITEMS[item]?.name ?? 'cây'} trước sân`);
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const seeds = SEEDS.map((id) => ({ id, n: s.state?.inventory[id] ?? 0 })).filter((x) => x.n > 0);

  return (
    <Sheet title="Vườn Phật" onClose={onClose}>
      <div className="comm">
        <div className="comm-hero">
          <div className="hero-glow" />
          <div className="hero-ic">
            <Icon name="lotus" />
          </div>
          <div className="hero-body">
            <b>Vườn cây của cả chùa</b>
            <p>
              {trees} cây đang lớn · vườn chung tối đa {cap} cây
            </p>
            <small>Cây chín thì ai cũng hái được; hái xong cây ngủ một ngày. Quả đổi được Ngọc.</small>
          </div>
        </div>
        <div className="row-btns">
          {seeds.map((x) => (
            <button className="btn gold" key={x.id} onClick={() => void plant(x.id)}>
              <Icon name="lotus" /> Trồng {ITEMS[x.id]?.name ?? x.id} ({x.n})
            </button>
          ))}
          {!seeds.length ? <p className="muted">Túi chưa có hạt giống. Vòng quay lộc mỗi ngày có thể tặng hạt.</p> : null}
          <button
            className="btn ghost"
            onClick={async () => {
              try {
                const r = await post<{ state: TempleState; ngoc: number }>('/plants/exchange');
                s.apply({ state: r.state });
                Sound.success();
                petalShower(18);
                s.toast(`<svg class="i"><use href="#i-ngoc"/></svg> Đã đổi ${fmt(r.ngoc)} quả lấy ${fmt(r.ngoc)} Ngọc`);
              } catch (e) {
                s.toast((e as Error).message);
              }
            }}
          >
            <Icon name="ngoc" /> Đổi {fmt(s.state?.fruit ?? 0)} quả lấy Ngọc
          </button>
        </div>
        <div className="region">Cây trong vườn</div>
        {plants.map((p) => (
          <div className="friend-row" key={p.id}>
            <span className="ava" style={{ background: String(ITEMS[p.item]?.data?.color ?? '#4f8a4a') }}>
              <Icon name="lotus" />
            </span>
            <div className="fr-body">
              <b>
                {ITEMS[p.item]?.name ?? p.item} {p.mine ? <span className="tag gold">Của bạn</span> : null}
              </b>
              <small>
                {p.owner} · đã hái {p.fruits} lần
                {p.ripe ? ' · đang chín' : p.next_at ? ` · ${ago(p.next_at)} nữa mới hái được` : ''}
              </small>
            </div>
            <div className="fr-side">
              <button
                className="btn small gold"
                disabled={!p.ripe}
                onClick={async () => {
                  try {
                    const r = await post<{ state: TempleState; got: number; fruit: number }>('/plants/harvest', { id: p.id });
                    s.apply({ state: r.state });
                    Sound.chime();
                    await load();
                    s.toast(`<svg class="i"><use href="#i-spark"/></svg> Hái được ${r.got} quả quý`);
                  } catch (e) {
                    s.toast((e as Error).message);
                  }
                }}
              >
                Hái
              </button>
            </div>
          </div>
        ))}
        {!plants.length ? (
          <div className="wish-empty">
            <Icon name="lotus" />
            <p>Vườn còn trống. Trồng một cây bồ đề để lấy bóng mát cho cả chùa.</p>
          </div>
        ) : null}
      </div>
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
    }  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const give = async () => {
    try {
      const r = await post<Gain>('/donations', { amount, note: note.trim() });
      s.apply({ state: r.state, gained: r.gained });
      setNote('');
      Sound.success();
      petalShower(24);
      await load();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <Sheet title="Bảng tri ân" onClose={onClose}>
      <div className="comm">
        <div className="comm-hero">
          <div className="hero-glow" />
          <div className="hero-ic">
            <Icon name="heart" />
          </div>
          <div className="hero-body">
            <b>Tùy hỷ công đức</b>
            <p>Sen là tiền nội bộ kiếm từ tu tập, không nạp bằng tiền thật</p>
            <small>Tên bạn được khắc lên bia đá trước sân chùa theo số Sen đã tùy hỷ.</small>
          </div>
        </div>
        <div className="chips">
          {DONATE_CHIPS.map((n) => (
            <button key={n} className={n === amount ? 'on' : ''} onClick={() => setAmount(n)}>
              <Icon name="sen" /> {n}
            </button>
          ))}
        </div>
        <div className="sg-form">
          <input maxLength={120} placeholder="Lời nhắn (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn gold" disabled={amount > (s.state?.sen ?? 0)} onClick={() => void give()}>
            Tùy hỷ {fmt(amount)} Sen
          </button>
        </div>
        <p className="muted">
          Ví đang có {fmt(s.state?.sen ?? 0)} Sen.
        </p>
        <div className="region">Bia công đức</div>
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
        {!rows.length ? <div className="empty">Chưa ai tùy hỷ. Hãy là người đầu tiên khắc tên lên bia.</div> : null}
        <div className="region">Lời nhắn gần đây</div>
        {list.map((d, i) => (
          <div className="dn-row" key={i}>
            <span>
              <b>{d.name}</b> {d.note ? `· “${d.note}”` : ''}
              <small>{ago(d.at)}</small>
            </span>
            <span className="sc">
              <Icon name="sen" /> {fmt(d.amount)}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ---- Túi đồ ------------------------------------------------------------------

const BAG_TABS = [
  { id: 'consumable', label: 'Lễ vật' },
  { id: 'plant', label: 'Cây Phật' },
  { id: 'robe', label: 'Áo tràng' },
  { id: 'beads', label: 'Tràng hạt' },
  { id: 'cushion', label: 'Bồ đoàn' },
  { id: 'hat', label: 'Mũ' },
  { id: 'staff', label: 'Pháp khí' },
  { id: 'cloud', label: 'Mây' },
  { id: 'pet', label: 'Linh thú' },
];

const UNEQUIPPABLE = ['hat', 'staff', 'cloud', 'pet'];

function ItemIcon({ id }: { id: string }) {
  const it = ITEMS[id];
  const color = String(it?.data?.color ?? it?.data?.c1 ?? '#6b4a2a');
  return (
    <span className="ic tint" style={{ background: color }}>
      <Icon name={it?.type === 'plant' || it?.type === 'fruit' ? 'lotus' : 'gift'} />
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
    return tab === 'consumable' || tab === 'plant' ? (inv[id] ?? 0) > 0 : it.id in inv;
  });

  // Mặc/ tháo: một cú PUT /profile rồi engine vẽ lại chính avatar đó, để người khác
  // trong phòng cũng thấy đổi (pushLook của room dùng hồ sơ máy chủ).
  const wear = async (slot: string, id: string | null) => {
    try {
      const r = await put<{ profile: { appearance: Record<string, string>; equipped: Record<string, string | null> } }>('/profile', {
        equipped: { ...equipped, [slot]: id },
      });
      s.refreshLook(r.profile);
      Sound.chime();
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
      else if (id === 'den_hoa_dang') s.openLanternForm();
      Sound.chime();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <Sheet title="Túi đồ" onClose={onClose} tabs={BAG_TABS} tab={tab} onTab={setTab}>
      {list.map((id) => {
        const it = ITEMS[id];
        const stack = tab === 'consumable' || tab === 'plant';
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
      {!list.length ? <div className="empty">Ngăn này trống. Vòng quay lộc mỗi ngày và việc hành trì sẽ tặng thêm đồ.</div> : null}
      {tab === 'plant' ? <p className="muted">Ra sân chùa, mở Vườn Phật để trồng cây, hái quả và đổi Ngọc.</p> : null}
    </Sheet>
  );
}

// ---- Pháp môn & cách chơi ----------------------------------------------------

export function GuideSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const sect = s.state?.sect ?? 'tinhdo';
  const [tab, setTab] = useState(sect);
  const g = guideOf(tab);
  const story = storyOf(TEMPLE.id);

  return (
    <Sheet title="Hướng dẫn tu tập" onClose={onClose}>
      <div className="tabs howto-tabs">
        {['truclam', 'tinhdo', 'lamte', 'taodong'].map((id) => (
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
              <Icon name="book" /> Hành trì
            </h4>
            {g.practice.map((p) => (
              <p key={p.title}>
                <b>{p.title}.</b> {p.text}
              </p>
            ))}
            <h4>
              <Icon name="pray" /> Trong chùa này
            </h4>
            <p>{g.inApp}</p>
            <h4>
              <Icon name="drum" /> Câu niệm
            </h4>
            {g.chants.map((c) => (
              <p key={c.name}>
                <b>{c.name}:</b> {c.text}
              </p>
            ))}
          </>
        ) : (
          <p className="muted">Chưa có bài viết cho phái này.</p>
        )}
        <h4>
          <Icon name="temple" /> {TEMPLE.name}
        </h4>
        <p>{story.intro}</p>
        {story.visitTip ? <p className="muted">{story.visitTip}</p> : null}
        <h4>
          <Icon name="spark" /> Cách chơi
        </h4>
        <p>Kéo nửa trái màn hình để đi, vuốt nửa phải để xoay góc nhìn. Chạm bồ đoàn để ngồi.</p>
        <p>Hành trì: Lạy Phật · Tràng hạt (tròn 108 hạt được thưởng thêm) · Tụng kinh · Thiền · Dâng lễ · Quét sân. Mọi con số công đức đều do máy chủ tính, kể cả khi bạn đổi thiết bị.</p>
        <p>Máy tính: W A S D đi lại · B lạy · T tràng hạt · E ngồi/đứng.</p>
      </div>
    </Sheet>
  );
}

// ---- Cài đặt -----------------------------------------------------------------

const VOLUMES: [string, string, string][] = [
  ['master', 'sound', 'Âm lượng tổng'],
  ['music', 'sound', 'Nhạc nền chùa'],
  ['rhythm', 'drum', 'Mõ & chuông'],
  ['voice', 'pray', 'Tiếng niệm đại chúng'],
  ['sfx', 'bell', 'Hiệu ứng (chuông dâng lễ, lần hạt)'],
];

export function SettingsSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [, bump] = useState(0);
  const again = () => bump((n) => n + 1);

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
        <Icon name="drum" /> Tiếng mõ niệm Phật nền{' '}
        <input
          type="checkbox"
          checked={!!Sound.chanting}
          onChange={(e) => {
            Sound.setChanting(e.target.checked);
            again();
          }}
        />
      </label>
      <label className="setting">
        <Icon name="sound" /> Tiếng niệm của đại chúng{' '}
        <input
          type="checkbox"
          checked={!!Sound.voice}
          onChange={(e) => {
            Sound.voice = e.target.checked;
            local.set('voice2', e.target.checked);
            Sound.refreshLoop();
            again();
          }}
        />
      </label>
      <label className="setting">
        <Icon name="sound" /> Nhạc nền chùa{' '}
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
                if (key === 'rhythm') Sound.mok(Sound.now, 0.45);
                else if (key !== 'voice') Sound.chime();
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
        Phiên bản này chỉ có một chánh điện và một máy chủ: mọi người đang online đều gặp nhau ở đây.
      </p>
    </Sheet>
  );
}

// ---- Đèn nguyện --------------------------------------------------------------

export function WishDock({ s }: { s: Store }) {
  const [open, setOpen] = useState(() => local.get('wishDock') !== 'off');
  const [list, setList] = useState<Lantern[]>([]);
  const layer = s.lanternLayer();

  const load = useCallback(async () => {
    try {
      const r = await get<{ lanterns: Lantern[] }>('/lanterns');
      setList(r.lanterns);
      // Đèn của người khác bay ngang màn hình theo nhịp, như bản gốc launchLantern.
      r.lanterns.slice(0, 3).forEach((l, i) => {
        if (!l.mine) launchLantern(layer, l.name, l.text, i * 2600);
      });
    } catch {
      // khung đèn nguyện là phần phụ: lỗi mạng thì để trống chứ không chặn HUD
    }  }, [layer]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, [load]);

  const rejoice = async (l: Lantern) => {
    try {
      const r = await post<{ state: TempleState; likes: number; gained: number }>(`/lanterns/${l.id}/rejoice`);
      s.apply({ state: r.state, gained: r.gained });
      setList((prev) => prev.map((x) => (x.id === l.id ? { ...x, likes: r.likes, rejoiced: true } : x)));
      Sound.chime();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  if (!open) {
    return (
      <button className="wd-open" title="Mở khung Đèn nguyện" onClick={() => { setOpen(true); local.set('wishDock', 'on'); }}>
        <Icon name="lantern" /> Đèn nguyện
      </button>
    );
  }

  return (
    <aside className="wish-dock" aria-label="Đèn nguyện">
      <header>
        <span className="wd-lamp">
          <Icon name="lantern" />
        </span>
        <div>
          <b>Đèn nguyện</b>
          <small>{list.length ? `${list.length} ngọn đèn đang sáng` : ''}</small>
        </div>
        <button
          className="wd-x"
          title="Tắt khung Đèn nguyện"
          aria-label="Tắt khung Đèn nguyện"
          onClick={() => {
            setOpen(false);
            local.set('wishDock', 'off');
          }}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="wd-list">
        {list.map((l) => (
          <div className={`wd-item${l.mine ? ' mine' : ''}`} key={l.id}>
            <p className="wd-text">“{l.text}”</p>
            <div className="wd-foot">
              <span>
                <b>{l.name}</b>
                <small>{ago(l.at)}</small>
              </span>
              {l.mine || l.rejoiced ? (
                <em>
                  <Icon name="pray" /> {l.likes}
                </em>
              ) : (
                <button className="wd-like" onClick={() => void rejoice(l)}>
                  <Icon name="pray" /> {l.likes}
                </button>
              )}
            </div>
          </div>
        ))}
        {!list.length ? (
          <div className="wd-empty">
            <Icon name="lantern" />
            <p>Chưa có đèn nào. Hãy thả ngọn đèn đầu tiên!</p>
          </div>
        ) : null}
      </div>
      <button className="btn gold wd-release" onClick={() => s.openLanternForm()}>
        <Icon name="lantern" /> Thả đèn nguyện
      </button>
    </aside>
  );
}
