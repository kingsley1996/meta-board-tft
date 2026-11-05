// Người trong chùa: thẻ một đạo hữu vừa chạm phải, ba vị NPC kể chuyện, và hai tấm
// sheet "Đồng tu" (bạn bè · tin nhắn · quà kết duyên) và "Cộng đồng" (nhóm đồng tu).
//
// Mọi người được định danh bằng player_id — con số đang hiện trên đầu avatar trong
// chánh điện — vì đó là thứ duy nhất người chơi nhìn thấy để mà chọn.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gain, PublicPlayer } from './api';
import { get, post } from './api';
import { ITEMS, Sound, TEMPLE, sectOf } from './engine';
import { ABBOT, HERMIT_LESSONS, WISHES, guideOf, storyOf, tellersOf } from './stories';
import { Icon, Sheet, ago, fmt, type Store } from './ui';

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
type Thread = { player: PublicPlayer; last: string; unseen: number };
type Dm = { player: PublicPlayer; messages: { mine: boolean; text: string; at: string }[] };
type Greeting = { id: number; from: PublicPlayer | null; kind: string; text: string; gift_sen: number; seen: boolean; at: string };

const EMPTY_FRIENDS: FriendList = { friends: [], incoming: [], outgoing: [] };

// Chữ cái đầu của tiếng cuối trong pháp danh, trên nền màu thiền phái — đúng cách bản
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

// ---- Thẻ một đạo hữu ---------------------------------------------------------

export function PlayerCard({ s, id, onClose, onChat }: { s: Store; id: number; onClose: () => void; onChat: (id: number) => void }) {
  const p = s.player(id);
  const [wish, setWish] = useState('');
  if (!p) return null;
  const sect = sectOf(p.sect);
  const gear = Object.values(p.equipped ?? {})
    .map((itemId) => (typeof itemId === 'string' ? ITEMS[itemId] : undefined))
    .filter((it) => !!it);

  const befriend = async () => {
    try {
      const r = await post<{ accepted?: boolean }>('/friends', { id, action: 'add' });
      Sound.chime();
      s.toast(r.accepted ? `<svg class="i"><use href="#i-users"/></svg> Hai bạn đã thành đồng tu` : `<svg class="i"><use href="#i-users"/></svg> Đã gửi lời mời kết bạn tới <b>${p.name}</b>`);
      onClose();
    } catch (e) {
      s.toast((e as Error).message);
    }
  };

  const greet = async (kind: 'huong' | 'chuc', text: string) => {
    try {
      const res = await post<Gain>('/greetings', { id, kind, text });
      s.apply(res);
      Sound.chime();
      // Emote là của chính mình: bản gốc không múa hộ người khác.
      s.engine?.emote(s.me, kind === 'huong' ? 'sen' : 'pray');
      s.toast(kind === 'huong' ? `<svg class="i"><use href="#i-incense"/></svg> Đã tặng nén hương cho <b>${p.name}</b>` : `<svg class="i"><use href="#i-pray"/></svg> Đã gửi lời chúc tới <b>${p.name}</b>`);
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
            <Icon name={`sect-${p.sect}`} /> {sect.name} · Cấp {p.level}
          </p>
          <small>{p.title}</small>
          {p.honor ? (
            <span className="honor">
              <Icon name="spark" /> {p.honor}
            </span>
          ) : null}
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
                    <Icon name="lotus" />
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
          <Icon name="incense" /> Tặng hương
        </button>
        <button className="btn" onClick={() => void befriend()}>
          <Icon name="users" /> Kết bạn đồng tu
        </button>
      </div>
      <div className="pcard-acts">
        <button className="btn gold" onClick={() => onChat(id)}>
          <Icon name="chat" /> Nhắn tin
        </button>
      </div>
    </div>
  );
}

// ---- Ba vị trong chùa --------------------------------------------------------

export type NpcKind = 'abbot' | 'hermit' | 'teller';

// Thầy trụ trì, Lão Hành Khất và người kể chuyện: cùng một khung thoại
// (.abbot-head/.abbot-say/.abbot-opts) như bản gốc, chỉ khác nội dung.
export function NpcModal({ s, kind, index = 0, onClose }: { s: Store; kind: NpcKind; index?: number; onClose: () => void }) {
  const story = storyOf(TEMPLE.id);
  const teller = tellersOf(TEMPLE.id)[index];
  const [page, setPage] = useState(-1);
  const [tale, setTale] = useState<number | null>(null);

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

  const chime = () => Sound.chime();

  if (kind === 'hermit') {
    return wrap(
      '#7a6a52',
      'Lão Hành Khất',
      'Bán bí kiếp, chỉ bán cho người hữu duyên',
      say(
        `<p>Lại là con à? Bí kiếp bán rồi miễn trả lại nhé. Nhưng lão nói thật: chiêu hay nhất không nằm trong sách đâu, đọc đi rồi biết.</p>${HERMIT_LESSONS.map((l) => `<p>${l}</p>`).join('')}`,
        <Btn label="Con xin phép cụ" icon="pray" onClick={onClose} />,
      ),
    );
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
              chime();
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
        ? say(`<p>Chào ${s.state?.name ?? 'đạo hữu'}! Tôi là ${teller.name}, ${teller.role.toLowerCase()} ở đây. Bạn ghé ${TEMPLE.name} lần này, có muốn nghe tôi kể vài chuyện xưa không?</p>`, menu)
        : say(
            `<h4 class="tale-title">${teller.tales[tale].title}</h4><p>${teller.tales[tale].text}</p>`,
            <Btn
              label="Kể thêm chuyện khác"
              icon="scroll"
              gold
              onClick={() => {
                chime();
                setTale(null);
              }}
            />,
          ),
    );
  }

  // Trụ trì: kể sự tích chùa từng trang một, đúng thứ tự main.js:1093-1108.
  const pages = story.story?.length ? story.story : [TEMPLE.name];
  const head = <Head ava="#c98a2e" name={ABBOT} sub={`Trụ trì ${TEMPLE.name}`} />;
  const menu = (
    <>
      <Btn
        label="Thầy kể sự tích chùa"
        icon="story"
        onClick={() => {
          chime();
          setPage(0);
        }}
      />
      <Btn
        label="Chùa có gì đặc sắc ạ?"
        icon="temple"
        onClick={() => {
          chime();
          setPage(-2);
        }}
      />
      <Btn
        label="Về pháp môn của con"
        icon="book"
        onClick={() => {
          chime();
          setPage(-3);
        }}
      />
      <Btn label="Con xin phép thầy" icon="pray" gold onClick={onClose} />
    </>
  );

  let body: React.ReactNode;
  if (page >= 0) {
    const last = page >= pages.length - 1;
    body = say(
      `<p>${pages[page]}</p><small class="muted">(${page + 1}/${pages.length})</small>`,
      last ? (
        <Btn
          label="Dạ, con hiểu rồi"
          icon="pray"
          gold
          onClick={() => {
            chime();
            setPage(-1);
          }}
        />
      ) : (
        <>
          <Btn
            label="Thầy kể tiếp ạ"
            icon="scroll"
            gold
            onClick={() => {
              chime();
              setPage(page + 1);
            }}
          />
          <Btn
            label="Con hỏi chuyện khác"
            icon="pray"
            onClick={() => {
              chime();
              setPage(-1);
            }}
          />
        </>
      ),
    );
  } else if (page === -2) {
    body = say(
      story.highlights?.length ? `<p>Chùa mình có mấy điều con nên biết:</p><ul>${story.highlights.map((h) => `<li>${h}</li>`).join('')}</ul>` : `<p>${story.intro ?? ''}</p>`,
      <Btn
        label="Dạ"
        icon="pray"
        gold
        onClick={() => {
          chime();
          setPage(-1);
        }}
      />,
    );
  } else if (page === -3) {
    const g = s.state ? guideOf(s.state.sect) : null;
    body = say(
      g
        ? `<p><b>${g.subtitle}</b></p><p>${g.essence[0] ?? ''}</p><p>${g.inApp}</p>`
        : `<p>Con hãy chọn một thiền phái rồi thầy chỉ cho: mỗi phái có một pháp môn riêng, hợp với căn cơ của mỗi người.</p>`,
      <Btn
        label="Dạ, con cảm ơn thầy"
        icon="pray"
        gold
        onClick={() => {
          chime();
          setPage(-1);
        }}
      />,
    );
  } else {
    body = say(
      `<p>A Di Đà Phật! ${s.state?.name ?? 'Con'} cần hỏi thầy điều gì?</p>`,
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

// ---- Đồng tu: bạn bè · tin nhắn · quà kết duyên ------------------------------

export function FriendsSheet({ s, onClose, onChat }: { s: Store; onClose: () => void; onChat: (id: number) => void }) {
  const [tab, setTab] = useState('friends');
  const [list, setList] = useState<FriendList>(EMPTY_FRIENDS);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [gifts, setGifts] = useState<Greeting[]>([]);

  const load = useCallback(async () => {
    try {
      const [f, d, g] = await Promise.all([
        get<FriendList>('/friends'),
        get<{ threads: Thread[] }>('/dms'),
        get<{ rows: Greeting[] }>('/greetings'),
      ]);
      setList(f);
      setThreads(d.threads);
      setGifts(g.rows);
    } catch {
      // sheet vẫn mở được với danh sách rỗng; lỗi mạng thì tab nào cũng trống
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (id: number, action: string) => {
    try {
      await post('/friends', { id, action });
      Sound.chime();
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
          Cấp {p.level} · {p.title}
        </small>
      </div>
      <div className="fr-side" onClick={(e) => e.stopPropagation()}>
        {side}
      </div>
    </div>
  );

  const unseen = threads.reduce((n, t) => n + t.unseen, 0);
  const unopened = gifts.filter((g) => !g.seen).length;

  return (
    <Sheet
      title="Đồng tu"
      onClose={onClose}
      tabs={[
        { id: 'friends', label: `Bạn (${list.friends.length})` },
        { id: 'chat', label: unseen ? `Tin nhắn · ${unseen}` : 'Tin nhắn' },
        { id: 'gifts', label: unopened ? `Quà kết duyên · ${unopened}` : 'Quà kết duyên' },
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
              <b>Bạn đồng tu</b>
              <p>{list.friends.length ? `${list.friends.length} bạn đã kết duyên` : 'Cùng nhau tinh tấn'}</p>
              <small>Chạm vào một Phật tử trong chánh điện để gửi lời chúc, tặng hương hoặc kết bạn.</small>
            </div>
          </div>
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
          <div className="region">Bạn đồng tu ({list.friends.length})</div>
          {list.friends.map((p) =>
            row(
              p,
              <button className="btn small ghost icon-btn" title="Nhắn tin" aria-label="Nhắn tin" onClick={() => onChat(p.id)}>
                <Icon name="chat" />
              </button>,
            ),
          )}
          {!list.friends.length ? (
            <div className="wish-empty">
              <Icon name="users" />
              <p>Chưa có bạn đồng tu. Chạm vào một Phật tử trong chánh điện để kết bạn.</p>
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
        </div>
      ) : null}

      {tab === 'chat' ? (
        <div className="comm">
          <div className="comm-hero friend-hero">
            <div className="hero-glow" />
            <div className="hero-ic">
              <Icon name="chat" />
            </div>
            <div className="hero-body">
              <b>Tin nhắn riêng</b>
              <p>Trò chuyện với bạn đồng tu</p>
              <small>Lời lẽ hoà nhã, ái ngữ nhé.</small>
            </div>
          </div>
          {threads.map((t) => (
            <div className={`friend-row${t.unseen ? ' unread' : ''}`} key={t.player.id} onClick={() => onChat(t.player.id)}>
              <Ava name={t.player.name} sect={t.player.sect} />
              <div className="fr-body">
                <b>{t.player.name}</b>
                <small>{t.last.slice(0, 48)}</small>
              </div>
              <div className="fr-side">
                <small>{ago(t.last)}</small>
                {t.unseen ? <i className="tab-dot">{t.unseen}</i> : null}
              </div>
            </div>
          ))}
          {!threads.length ? (
            <div className="wish-empty">
              <Icon name="chat" />
              <p>Chưa có cuộc trò chuyện nào. Vào tab Bạn, chạm vào một đạo hữu để nhắn tin.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'gifts' ? (
        <div className="comm">
          <div className="region">Quà kết duyên nhận được</div>
          {gifts.map((g) => (
            <div className="wish-card" key={g.id}>
              <div className="wish-lamp">
                <Icon name={g.kind === 'huong' ? 'incense' : 'pray'} />
              </div>
              <div className="wish-main">
                <div className="wish-top">
                  <b>{g.from?.name ?? 'Một đạo hữu'}</b>
                  {g.seen ? <span className="tag">Đã mở</span> : <span className="tag gold">Mới</span>}
                </div>
                <p className="wish-text">{g.text ? `“${g.text}”` : g.kind === 'huong' ? 'Gửi bạn một nén hương trầm' : 'Gửi bạn một lời chúc'}</p>
                <div className="wish-meta">
                  {ago(g.at)}
                  {g.gift_sen ? ` · ${fmt(g.gift_sen)} Sen` : ''}
                </div>
              </div>
              {g.seen ? null : (
                <button
                  className="btn small gold"
                  onClick={async () => {
                    try {
                      const r = await post<Gain & { from: PublicPlayer; gift_sen: number }>(`/greetings/${g.id}/open`);
                      s.apply(r);
                      Sound.success();
                      await load();
                    } catch (e) {
                      s.toast((e as Error).message);
                    }
                  }}
                >
                  Mở quà
                </button>
              )}
            </div>
          ))}
          {!gifts.length ? (
            <div className="wish-empty">
              <Icon name="gift" />
              <p>Chưa có món quà nào. Tặng hương hoặc gửi lời chúc cho một đạo hữu để kết duyên.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}

// ---- Hộp thư riêng -----------------------------------------------------------

export function ChatModal({ s, id, onClose }: { s: Store; id: number; onClose: () => void }) {
  const [dm, setDm] = useState<Dm | null>(null);
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const sending = useRef(false);

  useEffect(() => {
    void get<Dm>(`/dms/${id}`)
      .then((r) => {
        setDm(r);
        requestAnimationFrame(() => list.current?.scrollTo({ top: list.current.scrollHeight }));
      })
      .catch((e: Error) => s.toast(e.message));  }, [id]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [dm?.messages.length]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending.current) return;
    sending.current = true;
    setText('');
    try {
      await post('/dms', { id, text: body });
      setDm((prev) => (prev ? { ...prev, messages: [...prev.messages, { mine: true, text: body, at: new Date().toISOString() }] } : prev));
    } catch (e) {
      setText(body);
      s.toast((e as Error).message);
    } finally {
      sending.current = false;
    }
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="chat">
          <div className="chat-head">
            {dm ? <Ava name={dm.player.name} sect={dm.player.sect} /> : <span className="ava" />}
            <div>
              <b>{dm?.player.name ?? '…'}</b>
              <small>{dm ? `Cấp ${dm.player.level} · ${dm.player.title}` : 'Đang mở hộp thư'}</small>
            </div>
            <button className="help-btn" aria-label="Đóng" onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          <div className="chat-list" ref={list}>
            {dm?.messages.map((m, i) => (
              <div className={`chat-msg${m.mine ? ' me' : ''}`} key={i}>
                <span>{m.text}</span>
                <small>{ago(m.at)}</small>
              </div>
            ))}
            {dm && !dm.messages.length ? (
              <div className="chat-empty">
                <Icon name="pray" />
                <p>
                  Gửi lời chào đầu tiên tới <b>{dm.player.name}</b>.
                  <br />
                  Nam mô A Di Đà Phật!
                </p>
              </div>
            ) : null}
          </div>
          <div className="chat-input">
            <textarea
              rows={1}
              maxLength={400}
              placeholder={dm ? `Nhắn cho ${dm.player.name}…` : '…'}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button className="btn gold icon-btn" aria-label="Gửi" onClick={() => void send()}>
              <Icon name="send" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Nhóm đồng tu ------------------------------------------------------------

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
      Sound.success();
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
                Công đức chung {fmt(group.merit)} / {fmt(group.goal)}
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
                  Cấp {m.level} · {m.title}
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
            {!group.messages.length ? <p className="muted">Chưa có lời nào. Gửi lời chào đầu tiên cho nhóm nhé.</p> : null}
          </div>
          <div className="chat-input">
            <textarea rows={1} maxLength={400} placeholder="Nhắn cho cả nhóm…" value={text} onChange={(e) => setText(e.target.value)} />
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
            Rời nhóm
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
              <b>Nhóm đồng tu</b>
              <p>Cùng nhau tu tập, cùng thấy công đức chung</p>
              <small>Lập nhóm rồi gửi mã mời cho bạn bè; mỗi nhóm tối đa {10} người.</small>
            </div>
          </div>
          <div className="sg-form">
            <input maxLength={30} placeholder="Tên nhóm (VD: Gia đình Sen Hồng)" value={name} onChange={(e) => setName(e.target.value)} />
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
        </div>
      )}
    </Sheet>
  );
}
