// Người trong sảnh: thẻ một người chơi vừa chạm phải, ba vị NPC hướng dẫn, và hai tấm
// sheet "Đồng đội" (bạn bè · quà tặng) và "Cộng đồng" (tổ đội).
//
// Mọi người được định danh bằng player_id — con số đang hiện trên đầu avatar trong
// sảnh — vì đó là thứ duy nhất người chơi nhìn thấy để mà chọn.
'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Gain, GameKind, PublicPlayer } from './api';
import { del, get, post } from './api';
import { ITEMS, TEMPLE, sectOf } from './engine';
import { ItemIcon, RANK_LABEL } from './hall';
import { ABBOT, HERMIT_LESSONS, WISHES, guideOf, storyOf, tellersOf } from './stories';
import { rungLabel } from '@/vendor/temple/js/ladder.js';
import { GuestGate, Icon, Sheet, TitleBadge, ago, esc, fmt, type Notice, type Store } from './ui';

export type Group = {
  id: number;
  name: string;
  code: string;
  owner: boolean;
  max_members: number;
  goal: number;
  merit: number;
  members: PublicPlayer[];
  messages: { by: PublicPlayer | null; text: string; at: string }[];
};

type FriendList = { friends: PublicPlayer[]; incoming: PublicPlayer[]; outgoing: PublicPlayer[] };
type Greeting = { id: number; from: PublicPlayer | null; kind: string; text: string; gift_sen: number; at: string };

const EMPTY_FRIENDS: FriendList = { friends: [], incoming: [], outgoing: [] };

// Chữ cái đầu của tiếng cuối trong tên hiển thị, trên nền màu lối chơi — đúng cách bản
// gốc vẽ avatar khi không có ảnh (main.js:2361).
export function Ava({ name, sect, cls = '' }: { name: string; sect: string; cls?: string }) {
  const initial = (name.trim().split(/\s+/).pop() ?? '?')[0]?.toUpperCase() ?? '?';
  return (
    <span className={`ava ${cls}`.trim()} style={{ background: sectOf(sect).color }}>
      {initial}
    </span>
  );
}

function Head({ ava, name, sub }: { ava: string; name: string; sub: string }) {
  return (
    <div className="abbot-head">
      <span className="ava" style={{ background: ava }}>
        <Icon name={name === ABBOT ? 'pray' : 'story'} />
      </span>
      <div>
        <b>{name}</b>
        <small>{sub}</small>
      </div>
    </div>
  );
}

// ---- Thẻ một người chơi ---------------------------------------------------------

export function PlayerCard({ s, id, onClose }: { s: Store; id: number; onClose: () => void }) {
  const p = s.player(id);
  const [wish, setWish] = useState('');
  if (!p) return null;
  const sect = sectOf(p.sect);
  const gear = Object.values(p.equipped ?? {})
    .map((itemId) => (typeof itemId === 'string' ? ITEMS[itemId] : undefined))
    .filter((it) => !!it);

  // Lời mời tỷ thí nằm ở thẻ người chơi chứ không ở bảng Tỷ Thí: người chơi chỉ cần
  // đúng một thứ để chọn — cái tên vừa chạm phải.
  const challenge = async (kind: GameKind) => {
    try {
      await post('/games', { kind, id });
      s.toast(`<svg class="i"><use href="#i-${kind === 'dice' ? 'dice' : kind === 'rps' ? 'scissors' : 'grid'}"/></svg> Đã mời <b>${esc(p.name)}</b> tỷ thí`);
      onClose();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const befriend = async () => {
    try {
      const r = await post<{ accepted?: boolean }>('/friends', { id, action: 'add' });
      s.toast(r.accepted ? `<svg class="i"><use href="#i-users"/></svg> Hai bạn đã thành đồng đội` : `<svg class="i"><use href="#i-users"/></svg> Đã gửi lời mời kết bạn tới <b>${esc(p.name)}</b>`);
      onClose();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const greet = async (kind: 'huong' | 'chuc', text: string) => {
    try {
      const res = await post<Gain>('/greetings', { id, kind, text });
      s.apply(res);
      // Emote là của chính mình: bản gốc không múa hộ người khác.
      s.engine?.emote(s.me, kind === 'huong' ? 'hex' : 'pray');
      s.toast(kind === 'huong' ? `<svg class="i"><use href="#i-incense"/></svg> Đã tặng Bùa May Mắn cho <b>${esc(p.name)}</b>` : `<svg class="i"><use href="#i-pray"/></svg> Đã gửi lời chúc tới <b>${esc(p.name)}</b>`);
      onClose();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  return (
    <div className="pcard">
      <button className="pcard-x" title="Đóng" aria-label="Đóng" onClick={onClose}>
        <Icon name="close" />
      </button>
      <div className="pcard-head" style={{ ['--sc' as string]: sect.color }}>
        <Ava name={p.name} sect={p.sect} />
        <div>
          <b>{p.name}</b>
          <p>
            <Icon name={`sect-${p.sect}`} /> {sect.name} · {rungLabel(p.level)}
          </p>
          {/* Danh tính trong game, chỉ có khi người đó tự treo cờ công khai (ws.ts). */}
          {p.riot ? <p className="riot-id">{p.riot}</p> : null}
          <small>
            <TitleBadge title={p.title} level={p.level} size={22} /> {p.title}
          </small>
        </div>
      </div>
      {gear.length ? (
        <>
          <div className="region">Đang trang bị</div>
          <div className="pcard-gear">
            <div className="pcard-items">
              {gear.map((it) => (
                <div className="pcard-item" key={it.id}>
                  <span className="ic tint" style={{ background: String((it.data?.color as string) ?? (it.data?.c1 as string) ?? '#6b4a2a') }}>
                    <Icon name="hex" />
                  </span>
                  <span>
                    <small>{it.type}</small>
                    {it.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {s.guest ? (
        <GuestGate s={s} what="Tặng quà và kết bạn" />
      ) : (
        <>
          <div className="region">Gửi lời chúc</div>
          <div className="pcard-greets">
            {WISHES.map((w) => (
              <button className="chip" key={w} onClick={() => void greet('chuc', w)}>
                {w}
              </button>
            ))}
          </div>
          <div className="pcard-own">
            <input maxLength={80} placeholder="Hoặc tự viết lời chúc…" value={wish} onChange={(e) => setWish(e.target.value)} />
            <button className="btn small gold" disabled={!wish.trim()} onClick={() => void greet('chuc', wish.trim())}>
              Gửi
            </button>
          </div>
          <div className="pcard-acts">
            <button className="btn" onClick={() => void greet('huong', '')}>
              <Icon name="incense" /> Tặng bùa
            </button>
            <button className="btn" onClick={() => void befriend()}>
              <Icon name="users" /> Kết bạn đồng đội
            </button>
          </div>
          <div className="region">Tỷ thí</div>
          <div className="pcard-acts">
            <button className="btn" onClick={() => void challenge('dice')}>
              <Icon name="dice" /> Xúc Xắc
            </button>
            <button className="btn" onClick={() => void challenge('rps')}>
              <Icon name="scissors" /> Oẳn Tù Tì
            </button>
            <button className="btn" onClick={() => void challenge('caro')}>
              <Icon name="grid" /> Cờ Caro
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Ba vị hướng dẫn ---------------------------------------------------------

export type NpcKind = 'abbot' | 'hermit' | 'teller';

// Trả lời của GET /hermit: chiếu duyên hôm nay bày món nào, còn mấy phần. Cả sảnh
// cùng thấy một chiếu (máy chủ quay theo ngày, không theo người), nên đây là số của
// riêng người bấm: món đã đổi rồi tự nhảy khỏi `offers`.
type Mat = { left: number; offers: { id: string; price: number }[]; total: number };

// Huấn luyện viên, Nhà Phân Tích và Tiên Tri Hex: cùng một khung thoại
// (.abbot-head/.abbot-say/.abbot-opts) như bản gốc, chỉ khác nội dung.
export function NpcModal({ s, kind, index = 0, onClose }: { s: Store; kind: NpcKind; index?: number; onClose: () => void }) {
  const story = storyOf(TEMPLE.id);
  const teller = tellersOf(TEMPLE.id)[index];
  const [page, setPage] = useState(-1);
  const [tale, setTale] = useState<number | null>(null);
  const [mat, setMat] = useState<Mat | null>(null);
  const [tip, setTip] = useState(0);

  // Chiếu duyên chỉ hỏi khi cụ già được chạm phải, và hỏi lại sau mỗi lần đổi để
  // người chơi thấy đúng số phần lão còn lại hôm nay.
  useEffect(() => {
    if (kind !== 'hermit') return;
    setMat(null);
    setTip(0);
    void get<Mat>('/hermit')
      .then(setMat)
      .catch((e: Error) => s.toast(e.message));
  }, [kind]);

  const say = (html: string, opts: React.ReactNode) => (
    <>
      <div className="abbot-say" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="abbot-opts">{opts}</div>
    </>
  );

  const wrap = (ava: string, name: string, sub: string, body: React.ReactNode) => (
    <div className="modal npc-modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <Head ava={ava} name={name} sub={sub} />
        {body}
      </div>
    </div>
  );

  const Btn = ({ label, icon, gold, onClick }: { label: string; icon: string; gold?: boolean; onClick: () => void }) => (
    <button className={gold ? 'btn gold' : 'btn ghost'} onClick={onClick}>
      <Icon name={icon} /> {label}
    </button>
  );

  if (kind === 'hermit') {
    // Ba trạng thái của chiếu — hết phần hôm nay, hết hàng vì con đã gom sạch, và còn
    // duyên. Lời văn theo talkHermit() của bản gốc (main.js:1050-1075).
    const GREET = '<p>Này, khoan đã! Lão nhìn cốt cách của con là biết ngay: kỳ tài ngàn năm có một.</p>';
    const bye = <Btn label="Con xin phép cụ" icon="pray" onClick={onClose} />;
    const trade = async (id: string) => {
      try {
        const r = await post<Gain & { item: string }>('/hermit/exchange', { item: id });
        s.apply(r);
        s.toast(`Lão Hành Khất đưa con ${ITEMS[id]?.name ?? id}`);
        setMat(await get<Mat>('/hermit'));
      } catch (e) {
        s.toast((e as Error).message);
      }
    };
    // Lão chỉ dặn một câu mỗi lần ghé: 8 lời chia theo ngày (giờ Hà Nội, cùng nhịp với
    // chiếu duyên) nên ai cũng đọc đủ sau một tuần, còn "Lão dặn thêm" là đường tắt cho
    // người muốn nghe hết trong một lượt.
    const lesson = `<p class="hermit-tip">Lão dặn: “${HERMIT_LESSONS[(Math.floor((Date.now() + 7 * 3_600_000) / 86_400_000) + tip) % HERMIT_LESSONS.length]}”</p>`;
    const more = <Btn label="Lão dặn thêm" icon="scroll" onClick={() => setTip((n) => n + 1)} />;
    const body = !mat
      ? say('<p>Lão đang trải chiếu… để lão xem hôm nay duyên con tới đâu.</p>', bye)
      : mat.left <= 0
        ? say(
            `${GREET}<p>Khổ nỗi hôm nay lão bán hết hàng rồi. Ngày mai con ghé lại xem duyên còn không nhé.</p>${lesson}`,
            <>
              {more}
              {bye}
            </>,
          )
        : !mat.offers.length
          ? say(
              `<p>Lại là con à? Chiếu lão bày hết trơn rồi, mà món nào con cũng đã cầm — hôm nay lão không còn gì để cho con nữa.</p>${lesson}`,
              <>
                {more}
                {bye}
              </>,
            )
          : say(
              `${GREET}<p>Hôm nay lão bày ${mat.offers.length} món, còn ${mat.left} phần. Hàng Quý nặng tay, không mặc cả.</p>${lesson}`,
              <>
                <div className="mat-grid">
                  {mat.offers.map(({ id, price }) => {
                    const it = ITEMS[id];
                    const rank = String(it?.data?.rank ?? '');
                    return (
                      <div className={`card${rank ? ` rank-${rank}` : ''}`} key={id}>
                        <ItemIcon id={id} />
                        <div className="body">
                          <b>{it?.name ?? id}</b>
                          {rank ? <span className="tag rank">{RANK_LABEL[rank] ?? 'Hiếm'}</span> : null}
                          <p>{it?.description ?? ''}</p>
                        </div>
                        <div className="side">
                          <button className="btn small gold" onClick={() => void trade(id)}>
                            <Icon name="sen" /> {fmt(price)}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {more}
                {bye}
              </>,
            );
    return wrap('#7a6a52', 'Lão Hành Khất', 'Bán bí kiếp, chỉ bán cho người hữu duyên', body);
  }

  if (kind === 'teller' && teller) {
    const menu = (
      <>
        {teller.tales.map((t, i) => (
          <Btn
            key={t.title}
            label={t.title}
            icon="scroll"
            onClick={() => {
              setTale(i);
            }}
          />
        ))}
        <Btn label="Cảm ơn" icon="pray" gold onClick={onClose} />
      </>
    );
    return wrap(
      '#4d7aa6',
      teller.name,
      `${teller.role} · ${TEMPLE.name}`,
      tale === null
        ? say(`<p>Chào ${esc(s.state?.name ?? 'nhà lữ hành')}! Tôi là ${teller.name}, ${teller.role.toLowerCase()} ở đây. Bạn ghé ${TEMPLE.name} lần này, có muốn nghe tôi kể vài chuyện không?</p>`, menu)
        : say(
            `<h4 class="tale-title">${teller.tales[tale].title}</h4><p>${teller.tales[tale].text}</p>`,
            <Btn
              label="Kể thêm chuyện khác"
              icon="scroll"
              gold
              onClick={() => {
                setTale(null);
              }}
            />,
          ),
    );
  }

  // Huấn luyện viên: kể chuyện đền từng trang một, đúng thứ tự main.js:1093-1108.
  const pages = story.story?.length ? story.story : [TEMPLE.name];
  const head = <Head ava="#c98a2e" name={ABBOT} sub={`Huấn luyện viên ${TEMPLE.name}`} />;
  const menu = (
    <>
      <Btn
        label="Kể chuyện đền"
        icon="story"
        onClick={() => {
          setPage(0);
        }}
      />
      <Btn
        label="Đền có gì hay?"
        icon="temple"
        onClick={() => {
          setPage(-2);
        }}
      />
      <Btn
        label="Về lối chơi của tôi"
        icon="book"
        onClick={() => {
          setPage(-3);
        }}
      />
      <Btn label="Thôi, cảm ơn" icon="pray" gold onClick={onClose} />
    </>
  );

  let body: React.ReactNode;
  if (page >= 0) {
    const last = page >= pages.length - 1;
    body = say(
      `<p>${pages[page]}</p><small class="muted">(${page + 1}/${pages.length})</small>`,
      last ? (
        <Btn
          label="Hiểu rồi"
          icon="pray"
          gold
          onClick={() => {
            setPage(-1);
          }}
        />
      ) : (
        <>
          <Btn
            label="Kể tiếp"
            icon="scroll"
            gold
            onClick={() => {
              setPage(page + 1);
            }}
          />
          <Btn
            label="Hỏi chuyện khác"
            icon="pray"
            onClick={() => {
              setPage(-1);
            }}
          />
        </>
      ),
    );
  } else if (page === -2) {
    body = say(
      story.highlights?.length ? `<p>Đền này có mấy điều bạn nên biết:</p><ul>${story.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>` : `<p>${story.intro ?? ''}</p>`,
      <Btn
        label="Được"
        icon="pray"
        gold
        onClick={() => {
          setPage(-1);
        }}
      />,
    );
  } else if (page === -3) {
    const g = s.state ? guideOf(s.state.sect) : null;
    body = say(
      g
        ? `<p><b>${g.subtitle}</b></p><p>${g.origin}</p><p>${g.inApp}</p>`
        : `<p>Chọn một lối chơi trước đã: mỗi lối có một cách lên đồ riêng, hợp với tay của từng người.</p>`,
      <Btn
        label="Cảm ơn"
        icon="pray"
        gold
        onClick={() => {
          setPage(-1);
        }}
      />,
    );
  } else {
    body = say(
      `<p>Chào ${esc(s.state?.name ?? 'bạn')}! Hôm nay bạn cần tôi xem gì?</p>`,
      menu,
    );
  }

  return (
    <div className="modal npc-modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {head}
        {body}
      </div>
    </div>
  );
}

// ---- Đồng đội: bạn bè · quà tặng ---------------------------------------------

export function FriendsSheet({ s, notice, tab0, onClose }: { s: Store; notice: Notice | null; tab0: string | null; onClose: () => void }) {
  const [tab, setTab] = useState(tab0 ?? 'friends');
  const [list, setList] = useState<FriendList>(EMPTY_FRIENDS);
  const [gifts, setGifts] = useState<Greeting[]>([]);

  const load = useCallback(async () => {
    try {
      const [f, g] = await Promise.all([
        get<FriendList>('/friends'),
        get<{ rows: Greeting[] }>('/greetings'),
      ]);
      setList(f);
      setGifts(g.rows);
    } catch {
      // sheet vẫn mở được với danh sách rỗng; lỗi mạng thì tab nào cũng trống
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Có tin mới bay tới trong lúc sheet đang mở thì đọc lại ba tab, thay vì bắt người
  // chơi đóng–mở để thấy lời mời hoặc số tin chưa đọc vừa đổi.
  useEffect(() => {
    if (notice) void load();
  }, [notice, load]);

  // Bấm vào thẻ thông báo phải mở đúng tab: quà thì tới Quà tặng, lời mời thì ở Bạn.
  useEffect(() => {
    if (tab0) setTab(tab0);
  }, [tab0]);

  const act = async (id: number, action: string) => {
    try {
      await post('/friends', { id, action });
      await load();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const row = (p: PublicPlayer, side?: React.ReactNode) => (
    <div className="friend-row" key={p.id} onClick={() => s.setCard(p.id)}>
      <Ava name={p.name} sect={p.sect} />
      <div className="fr-body">
        <b>{p.name}</b>
        <small>
          <TitleBadge title={p.title} level={p.level} size={18} /> {rungLabel(p.level)} · {p.title}
        </small>
        {p.riot ? <small className="riot-id">{p.riot}</small> : null}
      </div>
      <div className="fr-side" onClick={(e) => e.stopPropagation()}>
        {side}
      </div>
    </div>
  );

  return (
    <Sheet
      title="Đồng đội"
      onClose={onClose}
      tabs={[
        { id: 'friends', label: `Bạn (${list.friends.length})` },
        { id: 'gifts', label: `Quà tặng (${gifts.length})` },
      ]}
      tab={tab}
      onTab={setTab}
    >
      {tab === 'friends' ? (
        <div className="comm">
          <div className="comm-hero friend-hero">
            <div className="hero-glow" />
            <div className="hero-ic">
              <Icon name="users" />
            </div>
            <div className="hero-body">
              <b>Đồng đội</b>
              <p>{list.friends.length ? `${list.friends.length} người chung đội` : 'Cùng nhau chơi tốt hơn'}</p>
              <small>Chạm vào một người chơi trong sảnh để gửi lời chúc, tặng bùa hoặc kết bạn.</small>
            </div>
          </div>
          {s.guest ? (
            <GuestGate s={s} what="Kết bạn" />
          ) : (
            <>
              {list.incoming.length ? (
                <>
                  <div className="region">Lời mời kết bạn</div>
                  {list.incoming.map((p) =>
                    row(
                      p,
                      <>
                        <button className="btn small gold" onClick={() => void act(p.id, 'accept')}>
                          Đồng ý
                        </button>
                        <button className="btn small ghost" onClick={() => void act(p.id, 'decline')}>
                          Từ chối
                        </button>
                      </>,
                    ),
                  )}
                </>
              ) : null}
              <div className="region">Đồng đội ({list.friends.length})</div>
              {list.friends.map((p) => row(p))}
              {!list.friends.length ? (
                <div className="wish-empty">
                  <Icon name="users" />
                  <p>Chưa có đồng đội. Chạm vào một người chơi trong sảnh để kết bạn.</p>
                </div>
              ) : null}
              {list.outgoing.length ? (
                <>
                  <div className="region">Đang chờ đồng ý</div>
                  {list.outgoing.map((p) =>
                    row(
                      p,
                      <button className="btn small ghost" onClick={() => void act(p.id, 'remove')}>
                        Thu hồi
                      </button>,
                    ),
                  )}
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {tab === 'gifts' ? (
        <div className="comm">
          <div className="region">Quà tặng nhận được</div>
          <p className="muted wish-note">Đã vào ví khi quà tới — mỗi lời chúc +5 Điểm May Mắn, +7 Tinh Hoa.</p>
          {gifts.map((g) => (
            <div className="wish-card" key={g.id}>
              <div className="wish-lamp">
                <Icon name={g.kind === 'huong' ? 'incense' : 'pray'} />
              </div>
              <div className="wish-main">
                <div className="wish-top">
                  <b>{g.from?.name ?? 'Một người chơi'}</b>
                </div>
                <p className="wish-text">{g.text ? `“${g.text}”` : g.kind === 'huong' ? 'Gửi bạn một Bùa May Mắn' : 'Gửi bạn một lời chúc'}</p>
                <div className="wish-meta">
                  {ago(g.at)}
                  {g.gift_sen ? ` · ${fmt(g.gift_sen)} Tinh Hoa` : ''}
                </div>
              </div>
            </div>
          ))}
          {!gifts.length ? (
            <div className="wish-empty">
              <Icon name="gift" />
              <p>Chưa có món quà nào. Tặng bùa hoặc gửi lời chúc cho một người chơi.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

// ---- Sảnh chờ "Tìm Bạn Chơi" -------------------------------------------------
//
// Danh sách những người đang treo Riot ID của mình lên bảng. Không có nút Mời: đền
// không nói chuyện được với máy chủ Liên Minh, nên thứ duy nhất một hàng trao cho người
// khác là một dòng chữ để chép lấy. Vì vậy hàng nào cũng chỉ có hai hành động — copy,
// và một phiếu "đã chơi cùng".
type LobbyEntry = {
  id: number;
  name: string;
  level: number;
  riot: string;
  at: string;
  up: number;
  down: number;
  vote: number;
};
type Lobby = { riot: string | null; in: boolean; rows: LobbyEntry[] };
type LobbyWrite = { in: boolean; rows: LobbyEntry[] };

// Bảng này đọc trong lúc người ta còn đứng giữa chánh điện, nên nó tươi theo nhịp của
// một cái nhìn chứ không của một lần mở: 15 giây là một request mỗi phần tư phút cho
// mỗi người đang xem, đổi lấy việc không phải đóng–mở lại sheet chỉ để biết ai vừa ngồi
// xuống.
const LOBBY_POLL_MS = 15_000;

export function LobbySheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [data, setData] = useState<Lobby | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await get<Lobby>('/lobby'));
    } catch {
      // sheet vẫn mở được với danh sách rỗng
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), LOBBY_POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = data?.rows ?? [];
  const mine = rows.find((r) => r.id === s.me) ?? null;
  const others = rows.filter((r) => r.id !== s.me);
  // `riot` ở đây là Riot ID của *chính người đang xem*, do server đọc từ hàng users của
  // họ. Không có thì nút vào sảnh tắt và lời dẫn bước sang Hồ sơ — đừng để người chơi
  // bấm một cái nút chắc chắn trả 400.
  const canJoin = Boolean(data?.riot);

  const patch = (inNow: boolean, next: LobbyEntry[]) => setData((d) => ({ riot: d?.riot ?? null, in: inNow, rows: next }));

  const toggle = async () => {
    setBusy(true);
    try {
      const r = data?.in ? await del<LobbyWrite>('/lobby') : await post<LobbyWrite>('/lobby');
      patch(r.in, r.rows);
      s.toast(
        r.in
          ? `<svg class="i"><use href="#i-gamepad"/></svg> Mọi người đã thấy Riot ID của bạn ở sảnh chờ`
          : `<svg class="i"><use href="#i-close"/></svg> Đã rời sảnh chờ`,
      );
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const vote = async (id: number, value: 1 | -1) => {
    try {
      const r = await post<{ rows: LobbyEntry[] }>('/lobby/vote', { id, value });
      patch(data?.in ?? false, r.rows);
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  // Clipboard bị trình duyệt từ chối ngoài HTTPS/localhost. Không có nhánh nào im
  // lặng: báo "đã chép" rồi không có gì trong bảng nhớ là thứ người chơi phát hiện ra
  // muộn nhất.
  const copy = async (riot: string) => {
    try {
      await navigator.clipboard.writeText(riot);
      s.toast(`<svg class="i"><use href="#i-check"/></svg> Đã chép <b>${esc(riot)}</b> — dán vào ô kết bạn của Liên Minh`);
    } catch {
      s.toast(`Chép tay giúp nhé: <b>${esc(riot)}</b>`);
    }
  };

  const row = (r: LobbyEntry, self: boolean) => (
    <div className={`lobby-row${self ? ' me' : ''}`} key={r.id}>
      <span className="lv">{r.level}</span>
      <div className="fr-body">
        <b>{r.name}</b>
        <span className="riot-id">{r.riot}</span>
        <small>{ago(r.at)}</small>
      </div>
      <div className="side">
        {self ? (
          <span className="tag gold">Bạn</span>
        ) : (
          <>
            <button className="lb-copy" title="Chép Riot ID" onClick={() => void copy(r.riot)}>
              <Icon name="tag" />
            </button>
            <button className={`lb-vote${r.vote === 1 ? ' on' : ''}`} title="Đã chơi cùng" onClick={() => void vote(r.id, 1)}>
              <Icon name="up" /> {r.up}
            </button>
            <button className={`lb-vote down${r.vote === -1 ? ' on' : ''}`} title="Chưa chơi cùng" onClick={() => void vote(r.id, -1)}>
              <Icon name="down" /> {r.down}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <Sheet title="Tìm Bạn Chơi" aside={`${rows.length} người đang chờ`} onClose={onClose}>
      <div className="comm lobby">
        {s.guest ? (
          <GuestGate s={s} what="Sảnh chờ" />
        ) : !canJoin ? (
          <div className="lobby-note">
            Sảnh chờ trao <b>Riot ID</b> cho nhau, nên cần nhập một cái trước khi vào.
            <div className="lobby-cta">
              <button className="btn small gold" onClick={() => s.setSheet('profile')}>
                <Icon name="tag" /> Nhập Riot ID
              </button>
            </div>
          </div>
        ) : null}

        <button
          className={`btn wide ${data?.in ? 'ghost' : 'gold'}`}
          disabled={busy || s.guest || (!data?.in && !canJoin)}
          onClick={() => void toggle()}
        >
          {data?.in ? 'Rời Sảnh Chờ' : 'Vào Sảnh Chờ'}
        </button>

        {mine ? (
          <>
            <div className="region">Bạn · đang chờ</div>
            {row(mine, true)}
          </>
        ) : null}
        <div className="region">{others.length} người đang chờ chơi cùng</div>
        {others.map((r) => row(r, false))}
        {!others.length ? <div className="empty">Chưa có ai khác ở đây. Vào sảnh chờ để là người đầu tiên.</div> : null}
        <p className="muted">Một phiếu mỗi người — bấm lại để huỷ hoặc đổi chiều. Rời đền là rời sảnh.</p>
      </div>
    </Sheet>
  );
}

// ---- Tổ đội ------------------------------------------------------------------

export function GroupSheet({ s, onClose }: { s: Store; onClose: () => void }) {
  const [group, setGroup] = useState<Group | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [text, setText] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await get<{ group: Group | null }>('/group');
      setGroup(r.group);
    } catch {
      setGroup(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (path: string, body: Record<string, unknown>) => {
    try {
      const r = await post<{ group?: Group | null }>(path, body);
      if (r.group !== undefined) setGroup(r.group ?? null);
      await load();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const pct = group ? Math.min(100, (group.merit / Math.max(1, group.goal)) * 100) : 0;

  return (
    <Sheet title="Cộng đồng" onClose={onClose}>
      {!loaded ? (
        <div className="comm">
          <div className="empty">Đang mở bảng cộng đồng…</div>
        </div>
      ) : group ? (
        <div className="comm">
          <div className="comm-hero sangha-hero">
            <div className="hero-glow" />
            <div className="hero-ic">
              <Icon name="temple" />
            </div>
            <div className="hero-body">
              <b>{group.name}</b>
              <p>
                {group.members.length}/{group.max_members} thành viên · mã <span className="sg-code">{group.code}</span>
              </p>
              <div className="perk-bar light">
                <i style={{ width: `${pct}%` }} />
              </div>
              <small>
                Điểm chung {fmt(group.merit)} / {fmt(group.goal)}
                {group.merit >= group.goal ? ' – đã đạt!' : ''}
              </small>
            </div>
          </div>
          <div className="region">Thành viên</div>
          {group.members.map((m) => (
            <div className="friend-row" key={m.id} onClick={() => s.setCard(m.id)}>
              <Ava name={m.name} sect={m.sect} />
              <div className="fr-body">
                <b>{m.name}</b>
                <small>
                  <TitleBadge title={m.title} level={m.level} size={18} /> {rungLabel(m.level)} · {m.title}
                </small>
              </div>
            </div>
          ))}
          <div className="region">Bảng tin nhóm</div>
          <div className="chat-list">
            {group.messages.map((m, i) => (
              <div className="chat-msg" key={i}>
                <span>
                  <b>{m.by?.name ?? '…'}:</b> {m.text}
                </span>
                <small>{ago(m.at)}</small>
              </div>
            ))}
            {!group.messages.length ? <p className="muted">Chưa có lời nào. Gửi lời chào đầu tiên cho tổ đội nhé.</p> : null}
          </div>
          <div className="chat-input">
            <textarea rows={1} maxLength={400} placeholder="Nhắn cho cả tổ đội…" value={text} onChange={(e) => setText(e.target.value)} />
            <button
              className="btn gold icon-btn"
              aria-label="Gửi"
              onClick={() => {
                const body = text.trim();
                if (!body) return;
                setText('');
                void call('/group/message', { text: body });
              }}
            >
              <Icon name="send" />
            </button>
          </div>
          <button className="btn ghost wide" style={{ marginTop: 12, color: '#a0522d' }} onClick={() => void call('/group/leave', {})}>
            Rời tổ đội
          </button>
        </div>
      ) : (
        <div className="comm">
          <div className="comm-hero sangha-hero">
            <div className="hero-glow" />
            <div className="hero-ic">
              <Icon name="temple" />
            </div>
            <div className="hero-body">
              <b>Tổ đội</b>
              <p>Cùng nhau chơi, cùng thấy điểm chung</p>
              <small>Lập tổ đội rồi gửi mã mời cho bạn bè; tối đa 8 người.</small>
            </div>
          </div>
          {s.guest ? (
            <GuestGate s={s} what="Tổ đội" />
          ) : (
            <>
              <div className="sg-form">
                <input maxLength={30} placeholder="Tên tổ đội (VD: Gia Đình Sao Đỏ)" value={name} onChange={(e) => setName(e.target.value)} />
                <button className="btn gold" disabled={name.trim().length < 2} onClick={() => void call('/group', { name: name.trim() })}>
                  Lập mới
                </button>
              </div>
              <div className="sg-form">
                <input maxLength={6} placeholder="Mã mời (6 ký tự)" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
                <button className="btn" disabled={code.trim().length < 4} onClick={() => void call('/group/join', { code: code.trim() })}>
                  Gia nhập
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
