// Sảnh đền: màn hình chờ, HUD và chỗ nối phòng.
//
// Cây DOM dựng theo đúng id/lớp mà vendor/temple/css/app.css của bản gốc định nghĩa,
// nên stylesheet áp dụng nguyên vẹn; nguồn markup (main.js + temple-markup.ts) đã cắt
// cùng nhóm C, cần đối chiếu thì mở ở commit cca9c6d. DJ/stress/quest/topup/loc/mail/
// checkin/chore/map/share/coach không được dựng lại. Mọi con số đọc từ apps/api.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Gain, GameMatch, GuestReply, TempleState } from './api';
import { TempleApiError, get, post } from './api';
import { AMBIENCES, ITEMS, Sound, TEMPLE, TempleEngine, WEATHERS, hasWebGL, local, sectOf, type EngineCtx, type EnginePerson } from './engine';
import { luckyShower, floater } from './effects';
import { QUOTES, tellersOf } from './stories';
import { TempleRoom, type RemotePlayer } from './room';
import { BagSheet, GuideSheet, ProfileSheet, RankSheet, SettingsSheet, ShopSheet, SteleSheet } from './hall';
import { GameSheet, KIND_NAME } from './games';
import { FriendsSheet, GroupSheet, LobbySheet, NpcModal, PlayerCard, type NpcKind } from './people';
import { MeditateView, QueModal, WheelView } from './practice';
import { LADDER_TOP, REALM_ABOUT, rungLabel, rungOf } from '@/vendor/temple/js/ladder.js';
import { Icon, Modal, Notices, Sheet, TitleBadge, Toast, fmt, loginUrls, type Look, type Notice, type SheetKind, type Store, type ViewKind } from './ui';

type LevelUp = NonNullable<Gain['level_ups']>[number];
type Ann = { id: number; text: string; effect: string };
type CtxAct = 'talk' | 'tell' | 'door' | 'stand' | 'sit' | '';

const DEFAULT_GUEST = 'Nhà lữ hành';

type PlaqueRow = { name: string; title: string; score: number };

// Hai tấm bia khắc ngay trong chánh điện phải mang số thật lúc cảnh dựng xong, không chờ
// ai mở sheet. Trái = Điểm May Mắn tuần này, phải = Tinh Hoa đóng góp.
async function paintPlaques(engine: TempleEngine): Promise<void> {
  const [board, stele] = await Promise.all([get<{ rows: PlaqueRow[] }>('/leaderboard?scope=week'), get<{ rows: PlaqueRow[] }>('/stele')]);
  engine.rankPlaque(board.rows);
  engine.meritPlaque(stele.rows);
}

// Câu chữ trên thẻ thông báo tỷ thí. Thẻ luôn vẽ "<b>tên người vừa hành động</b> + câu
// này", nên mỗi dòng phải đọc được tiếp sau một cái tên. Phần trăm thắng/thua và tỉ số
// nói theo mắt người nhận, vì tấm thẻ là của họ.
function gameLine(kind: string, m: GameMatch, me: number): string {
  if (kind === 'invite') return 'mời bạn tỷ thí';
  if (kind === 'accept') return 'đã nhận lời mời · ván bắt đầu';
  if (kind === 'decline') return 'đã từ chối lời mời';
  if (kind === 'cancel') return 'đã bỏ ván';
  const mine = m.a.player.id === me ? m.a : m.b;
  const theirs = mine === m.a ? m.b : m.a;
  const score = `${mine.score}–${theirs.score}`;
  const verdict = !m.winner ? `hòa ${score}` : m.winner === me ? `bạn thắng ${score}` : `bạn thua ${score}`;
  return `vừa xong ván ${KIND_NAME[m.kind]} · ${verdict}`;
}

function ctxAct(ctx: EngineCtx): CtxAct {
  if (ctx.seated) return '';
  if (ctx.canTalk) return 'talk';
  if (ctx.teller !== null && ctx.teller >= 0) return 'tell';
  if (ctx.door && !ctx.canSit) return 'door';
  return '';
}

function ctxLabel(ctx: EngineCtx, act: CtxAct): string {
  if (ctx.seated) return 'Đứng dậy';
  if (act === 'talk') return 'Gặp huấn luyện viên';
  if (act === 'tell') return `Nghe ${tellersOf(TEMPLE.id)[ctx.teller ?? 0]?.name ?? 'kể chuyện'}`;
  if (act === 'door') return ctx.door === 'out' ? 'Ra sân ngắm cảnh' : 'Vào sảnh';
  return 'Ngồi xuống';
}

export function TempleApp({ lang }: { lang: string }) {
  const [tick, setTick] = useState(0);
  const [screen, setScreen] = useState<'loader' | 'hud'>('loader');
  const [loaderPct, setLoaderPct] = useState(4);
  const [loaderOut, setLoaderOut] = useState(false);
  const [loaderStep, setLoaderStep] = useState('Mở cổng đền');
  const [noGl, setNoGl] = useState(false);
  const [view, setView] = useState<ViewKind>('hall');
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [friendsTab, setFriendsTab] = useState<string | null>(null);
  // Mỗi tin 'game' là một nhịp bảo bảng Tỷ Thí đọc lại: trận nằm trong database của máy
  // chủ, còn nước đi của đối thủ thì không có cách nào biết sớm hơn.
  const [gameTick, setGameTick] = useState(0);
  // Lời mời đang chờ mình trả lời — con số ở góc bảng, không phải trong người chơi.
  const [duelWait, setDuelWait] = useState(0);
  const noticeSeq = useRef(0);
  const [npc, setNpc] = useState<{ kind: NpcKind; index: number } | null>(null);
  const [queOpen, setQueOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [toastHtml, setToastHtml] = useState('');
  // Quote chỉ được rút sau khi hydrate: rút ở module scope thì server và client ra
  // hai câu khác nhau và React phải dựng lại cả cây.
  const [quote, setQuote] = useState('');
  const [guide, setGuide] = useState('Kéo trái để đi · Vuốt phải để xoay · Chạm bệ ngồi để ngồi');
  const [guideFade, setGuideFade] = useState(true);
  const [levelQueue, setLevelQueue] = useState<LevelUp[]>([]);
  // Boot fail thì màn chờ phải nói được lý do và cho bấm lại, chứ không đứng đó mãi.
  const [bootError, setBootError] = useState('');
  // Màn chờ đang chờ người chơi chọn lối vào (khách / đăng nhập / đăng ký).
  const [choice, setChoice] = useState(false);
  const [online, setOnline] = useState(1);
  const [ctxUi, setCtxUi] = useState<{ show: boolean; act: CtxAct; label: string; out: boolean; outside: boolean }>({ show: false, act: '', label: 'Ngồi xuống', out: false, outside: false });
  const [, setFsTick] = useState(0);

  // Nguồn dữ liệu thật của HUD nằm ở refs: hàm nào cũng đọc giá trị hiện tại thay vì
  // giá trị chốt trong closure lần render đầu.
  const stateRef = useRef<TempleState | null>(null);
  const guestRef = useRef(false);
  const adminRef = useRef(false);
  const meRef = useRef(0);
  const bowRef = useRef<'idle' | 'bowing' | 'stopping'>('idle');
  const ctxRef = useRef<EngineCtx | null>(null);
  const playersRef = useRef<RemotePlayer[]>([]);
  const ambienceRef = useRef(AMBIENCES[0].label);
  // Khởi động theo đúng lựa chọn đã lưu, không theo hàng đầu của bảng.
  const weatherRef = useRef((WEATHERS.find((w) => w.id === local.get('weather')) ?? WEATHERS[0]).label);
  const viewRef = useRef<ViewKind>('hall');
  const fxRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const joyRef = useRef<HTMLDivElement | null>(null);

  const engRef = useRef<TempleEngine | null>(null);
  const roomRef = useRef<TempleRoom | null>(null);
  const startedRef = useRef(false);
  // Màn chờ chỉ mờ dần khi cả hai việc đã xong: cảnh dựng xong (ready) và người chơi
  // thực sự có phiên (entered). Trước đây ready là đủ, nên ai mở trang rồi bỏ đi cũng
  // bị kéo vào sảnh với tư cách khách — đúng cái màn chờ mới phải ngăn.
  const readyRef = useRef(false);
  const enteredRef = useRef(false);
  const revealedRef = useRef(false);

  const pendingBows = useRef(0);
  const bowsAt = useRef(Date.now());
  const sendingBows = useRef(false);
  const staleHall = useRef<number | null>(null);


  const render = () => setTick((n) => n + 1);
  const setState = (s: TempleState | null) => {
    stateRef.current = s;
    render();
  };

  const toast = (html: string, ms = 2600) => {
    setToastHtml(html);
    window.setTimeout(() => setToastHtml((cur) => (cur === html ? '' : cur)), ms);
  };

  const feed = (html: string) => {
    setGuide(html);
    setGuideFade(false);
    window.setTimeout(() => setGuideFade(true), 5000);
  };

  // Tin social của chính mình (quà, lời chúc, lời mời kết bạn) xếp thành chồng giữa lề
  // phải chứ không phải một dòng toast thoáng qua rồi hết: người nhận phải còn thấy nó
  // khi đang ngồi, và bấm vào là tới thẳng bảng cần xem.
  const pushNotice = (n: Omit<Notice, 'id'>) => setNotices((v) => [...v, { ...n, id: (noticeSeq.current += 1) }].slice(-6));
  const dismissNotice = useCallback((id: number) => setNotices((v) => v.filter((x) => x.id !== id)), []);
  const openNotice = (n: Notice) => {
    // Lời mời tỷ thí thì mở bảng Tỷ Thí, các tin khác vẫn về bảng Đồng đội như trước.
    if (n.t === 'game') setSheet('games');
    else {
      setFriendsTab(n.t === 'gift' ? 'gifts' : 'friends');
      setSheet('friends');
    }
    dismissNotice(n.id);
  };

  const apply = (g: Gain) => {
    setState(g.state ?? stateRef.current);
    if (g.gained) {
      floater(fxRef.current, `<svg class="i"><use href="#i-incense"/></svg> +${fmt(g.gained)}`);
    }
    if (g.level_ups?.length) {
      setLevelQueue((q) => [...q, ...g.level_ups!]);
      // Nhãn trên đầu đi từ hồ sơ trên dây, nên lên bậc phải báo một nhịp: máy chủ đọc
      // lại exp và phát danh hiệu mới cho cả phòng — trong đó có chính mình.
      roomRef.current?.send({ t: 'look' });
    }
  };

  // Tin tỷ thí: máy chủ báo khi có lời mời, khi bên kia nhận/từ chối/bỏ ván, và khi ván
  // ngã ngũ. Hai nhịp trong ván ('move'/'round') không thành thẻ — bảng đang mở thì nó
  // tự đọc lại theo gameTick, còn đóng bảng thì một dòng "đối thủ vừa gieo" chẳng để làm
  // gì cho ai, vì người nhận không có gì phải trả lời.
  const gameEvent = (msg: Record<string, unknown>) => {
    const kind = String(msg.kind ?? '');
    const match = msg.match as GameMatch | undefined;
    setGameTick((n) => n + 1);
    if (!match) return;
    const by = msg.by as Notice['by'] | undefined;
    if (!by?.id) return;
    // Người ra đòn cuối đã nhận trọn kết quả trong response của chính họ, nên phần
    // thưởng trong tin này là của người kia — cộng thẳng vào ví và hàng đợi lên bậc.
    if (kind === 'over') {
      apply({ state: msg.state as TempleState, gained: Number(msg.gained ?? 0), level_ups: (msg.level_ups as Gain['level_ups']) ?? [] });
      if (msg.outcome === 'win') luckyShower(20);
    }
    if (kind === 'move' || kind === 'round') return;
    // Đối thủ nhận lời thì bảng thi đấu tự mở ở máy người mời: khoảnh khắc trận bắt đầu là
    // khoảnh khắc hai người đang chờ nhau, không ai phải đi bấm lại menu giữa chừng.
    if (kind === 'accept') {
      setSheet('games');
      return;
    }
    if (kind === 'invite') setDuelWait((n) => n + 1);
    pushNotice({ t: 'game', kind, by, text: gameLine(kind, match, meRef.current), gift_sen: 0, at: new Date().toISOString() });
  };

  const practice = async (body: Record<string, unknown>, opts: { silent?: boolean } = {}) => {
    try {
      const r = (await post<Gain & Record<string, unknown>>('/practice', body)) as Gain;
      const ms = (r as unknown as { meditate_start?: unknown }).meditate_start;
      if (typeof ms === 'string') r.state = { ...r.state, meditate_start: ms };
      apply(r);
      if (!opts.silent && r.gained) toast(`<svg class="i"><use href="#i-spark"/></svg> +${fmt(r.gained)} Điểm May Mắn`);
      return r;
    } catch (e) {
      if ((e as TempleApiError).status !== 429) toast((e as Error).message);
      return null;
    }
  };

  const refresh = async () => {
    try {
      const r = await get<{ state: TempleState; guest: boolean; admin: boolean; player_id: number }>('/state');
      stateRef.current = r.state;
      guestRef.current = r.guest;
      adminRef.current = r.admin === true;
      meRef.current = r.player_id;
      render();
    } catch (e) {
      if ((e as TempleApiError).status !== 429) throw e;
    }
  };

  const setViewBoth = (v: ViewKind) => {
    viewRef.current = v;
    setView(v);
  };

  const refreshLook = (profile: Look) => {
    const st = stateRef.current;
    if (!st) return;
    const me: EnginePerson = {
      id: meRef.current,
      name: profile.name ?? st.name,
      sect: profile.sect ?? st.sect,
      title: st.title,
      honor: st.honor,
      level: st.level,
      appearance: profile.appearance ?? {},
      equipped: profile.equipped ?? {},
    };
    engRef.current?.look(me);
    // Avatar của mình trong máy người khác vẽ từ hồ sơ máy chủ đang giữ, nên đổi xong
    // phải báo một nhịp; không thì mình thấy tên/nhân vật mới mà cả phòng vẫn thấy cũ.
    roomRef.current?.send({ t: 'look' });
  };

  const sendBows = async () => {
    if (sendingBows.current || !pendingBows.current) return;
    const n = Math.min(5, pendingBows.current);
    sendingBows.current = true;
    try {
      // Chỉ trừ sổ khi máy chủ ghi nhận: nhịp 429 hay rớt mạng mà trừ trước là số lạy
      // vừa lạy biến mất không dấu vết, nhịp 1s dưới đây sẽ tự gửi lại phần còn thiếu.
      if (await practice({ type: 'bow', count: n }, { silent: true })) pendingBows.current -= n;
    } finally {
      sendingBows.current = false;
    }
  };

  const onBowDone = () => {
    if (bowRef.current === 'stopping' && (engRef.current?.world?.player?.bowT ?? 0) === 0) {
      bowRef.current = 'idle';
      render();
    }
    pendingBows.current += 1;
    if (pendingBows.current === 1) bowsAt.current = Date.now();
    if (pendingBows.current >= 4) void sendBows();
  };

  const clickBow = () => {
    const en = engRef.current;
    if (!en) return;
    if (bowRef.current === 'idle') {
      if (!en.seated && !en.sit()) {
        toast('Hãy đến gần một bệ trống để ngồi cầu may');
        return;
      }
      en.setBowing(true);
      bowRef.current = 'bowing';
    } else if (bowRef.current === 'bowing') {
      en.setBowing(false);
      bowRef.current = en.world?.player?.bowT === 0 ? 'idle' : 'stopping';
    }
    render();
  };

  const clickBowStop = () => {
    const en = engRef.current;
    if (!en || bowRef.current === 'idle') return;
    en.setBowing(false, true);
    bowRef.current = 'idle';
    render();
  };

  const clickCtx = () => {
    const ctx = ctxRef.current;
    const en = engRef.current;
    if (!ctx || !en) return;
    const act = ctxAct(ctx);
    if (act === 'talk') setNpc({ kind: 'abbot', index: 0 });
    else if (act === 'tell') setNpc({ kind: 'teller', index: ctx.teller ?? 0 });
    else if (act === 'door') en.goOutside();
    else if (en.seated) en.stand();
    else en.sit();
  };

  const doOffer = async (kind: string) => {
    setOfferOpen(false);
    try {
      const r = await post<Gain & { left: number }>('/use', { item: kind });
      apply(r);
      engRef.current?.offer(kind as 'huong_tram' | 'nen_sap' | 'hoa_dang');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const setAmbienceBoth = (label: string) => {
    ambienceRef.current = label;
    render();
  };

  const setWeatherBoth = (label: string) => {
    weatherRef.current = label;
    render();
  };

  const startRoom = () => {
    if (roomRef.current) return;
    roomRef.current = new TempleRoom(
      {
        onPlayers: (list, n) => {
          playersRef.current = list;
          setOnline(n);
          engRef.current?.applyRoom(list, meRef.current);
        },
        onJoined: (pid) => {
          if (pid) meRef.current = pid;
        },
        onEvent: (msg) => {
          if (msg.t === 'emote') {
            engRef.current?.emote(Number(msg.id), String(msg.e ?? ''));
            return;
          }
          // Tỷ thí: lời mời, kết quả và các nước đi tới tay người kia qua cùng một cửa.
          if (msg.t === 'game') {
            gameEvent(msg);
            return;
          }
          // Quà, lời chúc và lời mời kết bạn tới tay người nhận ngay tại đây: phía gửi
          // đã được REST trả lời rồi, còn phía kia nếu không có tin này thì phải tự mở
          // bảng "Đồng đội" mới thấy.
          if (msg.t !== 'friend' && msg.t !== 'gift') return;
          const by = msg.by as Notice['by'] | undefined;
          if (!by?.id) return;
          pushNotice({
            t: msg.t === 'gift' ? 'gift' : 'friend',
            kind: String(msg.kind ?? ''),
            by,
            text: String(msg.text ?? ''),
            gift_sen: Number(msg.gift_sen ?? 0),
            at: new Date().toISOString(),
          });
        },
        onConnection: (up) => {
          if (staleHall.current !== null) {
            window.clearTimeout(staleHall.current);
            staleHall.current = null;
          }
          if (up) {
            void refresh().catch(() => null);
            return;
          }
          // Máy chủ đã cấp 3 giây ân hạn cho một cú đứt nối, nên hall đứng yên là đúng
          // sự thật trong khoảng đó: avatar vẫn còn ở chỗ cũ, chỉ chưa cập nhật. Xoá
          // ngay thì chính người xem thấy cả chánh điện nhấp nháy mỗi lần đường dây
          // chập chờn; chỉ thu về một mình mình khi thật sự chưa nối lại được.
          staleHall.current = window.setTimeout(() => {
            staleHall.current = null;
            playersRef.current = [];
            setOnline(1);
            engRef.current?.applyRoom([], meRef.current);
          }, 3_000);
        },
      },
      TEMPLE.id,
      'chung',
      () => engRef.current?.netState() ?? null,
    );
    void roomRef.current.connect();
  };

  // Màn chờ mờ dần rồi mới gỡ (.loader.out của bản gốc), không cắt phựt: chính cú cắt
  // đó làm cảnh sảnh "nhảy" vào mặt người vừa bước qua cổng.
  const reveal = () => {
    if (revealedRef.current || !readyRef.current || !enteredRef.current) return;
    revealedRef.current = true;
    setLoaderPct(100);
    window.setTimeout(() => setLoaderOut(true), 550);
    window.setTimeout(() => setScreen('hud'), 1150);
    window.setTimeout(() => setGuideFade(true), 9000);
  };

  // Nối phòng + dựng engine: một lần trong đời trang, không phụ thuộc render.
  //
  // Tách phần "xin phiên → an vị → nối phòng" khỏi useEffect để màn chờ gọi lại được
  // đúng đường đó khi boot fail, thay vì bắt người chơi tải cả trang.
  const enterHall = async (session: Promise<GuestReply | null>) => {
    const engine = engRef.current;
    if (!engine) return;
    try {
      setBootError('');
      const g = await session;
      if (!g) throw new Error('Sảnh đang bận, thử lại sau nhé');
      guestRef.current = g.guest;
      meRef.current = g.profile.playerId;
      setLoaderPct(4);
      // /state nuôi HUD (số hôm nay, ví, túi đồ) chứ không nuôi avatar, nên để nó chạy
      // song song với nhịp dựng cảnh thay vì đứng chắn trước cổng đền.
      const hud = get<{ state: TempleState; guest: boolean; admin: boolean; player_id: number }>('/state');
      await engine.enter({
        id: g.profile.playerId,
        name: g.profile.name || DEFAULT_GUEST,
        sect: g.profile.sect,
        title: g.profile.title,
        honor: g.profile.honor,
        level: g.profile.level,
        appearance: g.profile.appearance,
        equipped: g.profile.equipped,
      });
      // Phòng đi trước bảng số: /state fail thì người chơi vẫn thấy đồng đội quanh mình,
      // và nhịp nối phòng đã tự gọi refresh() để lấy lại số.
      startRoom();
      const hudR = await hud;
      stateRef.current = hudR.state;
      adminRef.current = hudR.admin === true;
      render();
      if (stateRef.current.today.visits === 0) void practice({ type: 'visit' }, { silent: true });
      void get<{ rows: Ann[] }>('/announcements')
        .then((a) => setAnns(a.rows))
        .catch(() => null);
      setWheelCan(false);
      enteredRef.current = true;
      reveal();
    } catch (e) {
      setLoaderPct(0);
      setBootError((e as Error).message || 'Sảnh đang bận, thử lại sau nhé');
    }
  };

  // Biết mình là ai trước khi xin phiên: /me trả 401 khi trình duyệt chưa có cookie
  // nào, và khi chưa có ai chọn gì thì đền không được tự mọc một hàng users.
  const probeSession = () => {
    // "Thử lại" là bỏ lỗi lần trước: thẻ lỗi xếp trên màn lựa chọn, nên để bootError còn
    // đó thì /me có 401 đi nữa người chơi vẫn chỉ thấy nút "Thử lại" — bấm mãi không tới.
    setBootError('');
    get<GuestReply>('/me')
      .then((me) => void enterHall(Promise.resolve(me)))
      .catch((e: unknown) => {
        if ((e as TempleApiError).status === 401) setChoice(true);
        else {
          setLoaderPct(0);
          setBootError((e as Error).message || 'Sảnh đang bận, thử lại sau nhé');
        }
      });
  };

  const enterAsGuest = () => {
    setChoice(false);
    void enterHall(post<GuestReply>('/guest'));
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (!hasWebGL()) {
      setNoGl(true);
      return;
    }

    const engine = new TempleEngine({
      onProgress: (pct, step) => {
        setLoaderPct(pct);
        setLoaderStep(step);
      },
      onReady: () => {
        readyRef.current = true;
        reveal();
        // Bia chỉ tồn tại sau cú enterTemple bên trong engine.enter, nên số liệu phải đổ
        // ở đây; gọi lúc attach thì world.temple còn chưa có và bia giữ khắc "trống".
        void paintPlaques(engine).catch(() => {});
      },
      onBowDone,
      onContext: (ctx) => {
        ctxRef.current = ctx;
        Sound.setOutdoors?.(!!ctx.outside);
        const act = ctxAct(ctx);
        setCtxUi({ show: ctx.seated || ctx.canSit || ctx.canTalk || (ctx.teller !== null && ctx.teller >= 0) || !!ctx.door, act, label: ctxLabel(ctx, act), out: !!ctx.door, outside: !!ctx.outside });
        if (!ctx.seated && bowRef.current !== 'idle') clickBowStop();
        if (ctx.outside) setGuideFade(true);
      },
      onToast: toast,
      onNpc: (kind, index) => setNpc({ kind, index: index ?? 0 }),
      onPlayerTap: (id) => setCardId(id),
      onMerit: () => setSheet('stele'),
    });
    engRef.current = engine;
    try {
      engine.attach(sceneRef.current!, joyRef.current!);
    } catch {
      // Thăm dò đã qua nhưng trình duyệt vẫn từ chối context (hết suất, GPU process chết).
      engRef.current = null;
      setNoGl(true);
      return;
    }
    // Dựng cảnh và hỏi "ai đang đứng ở cổng đây" chạy song song: engine mất cả giây,
    // còn /me chỉ là một round trip ngắn.
    probeSession();

    return () => {
      // Rời trang mà không đóng thì phòng vẫn nối, đồng hồ vẫn đẩy vị trí và máy còn
      // render cả cảnh chùa của lần vào trước chồng lên lần vào sau.
      roomRef.current?.close();
      roomRef.current = null;
      if (staleHall.current !== null) {
        window.clearTimeout(staleHall.current);
        staleHall.current = null;
      }
      engRef.current?.dispose();
      engRef.current = null;
      // Cho phép dựng lại khi trang được mở lại (React dựng effect hai lần ở dev).
      startedRef.current = false;
    };
  }, []);

  const [anns, setAnns] = useState<Ann[]>([]);
  const [annIdx, setAnnIdx] = useState(0);
  const [wheelCan, setWheelCan] = useState(false);
  const [queDone, setQueDone] = useState<boolean | null>(null);

  useEffect(() => {
    if (!anns.length) return;
    const t = window.setInterval(() => setAnnIdx((i) => (i + 1) % anns.length), 12_000);
    return () => window.clearInterval(t);
  }, [anns.length]);

  useEffect(() => {
    // Hai đọc này là của HUD: trong lúc loader còn chạy thì phiên khách chưa kịp có,
    // gọi sớm chỉ tổ 401 và để lại nút quay sai trạng thái cho tới lần mở bảng kế tiếp.
    if (screen !== 'hud') return;
    if (view !== 'wheel') {
      void get<{ can: boolean }>('/draws/wheel')
        .then((r) => setWheelCan(r.can))
        .catch(() => null);
    }
    if (view !== 'que') {
      void get<{ que: unknown }>('/draws/que')
        .then((r) => setQueDone(!!r.que))
        .catch(() => null);
    }
  }, [view, screen]);

  // Nhịp 1s: gom cầu may cho tới khi đủ một gói.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (pendingBows.current && (bowRef.current !== 'bowing' || Date.now() - bowsAt.current > 10_000)) {
        bowsAt.current = Date.now();
        void sendBows();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape') {
        if (sheet) setSheet(null);
        else if (offerOpen) setOfferOpen(false);
        else setSheet('settings');
        return;
      }
      if (e.code === 'KeyB') clickBow();
      if (e.code === 'KeyE') clickCtx();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, offerOpen]);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? '');
  }, []);

  useEffect(() => {
    const onFs = () => setFsTick((n) => n + 1);
    document.addEventListener('fullscreenchange', onFs);
    // Rời trang thì xin rời phòng ngay thay vì chờ máy chủ phát hiện socket chết: nếu
    // không, avatar của mình còn đứng trong sảnh thêm nửa phút và người khác đếm
    // thừa một người.
    const bye = () => roomRef.current?.close();
    window.addEventListener('pagehide', bye);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('pagehide', bye);
    };
  }, []);

  const st = stateRef.current;
  const uiMin = local.get('ui') === true;
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  const store: Store = {
    lang,
    guest: guestRef.current,
    isAdmin: adminRef.current,
    state: st,
    engine: engRef.current,
    room: roomRef.current,
    me: meRef.current,
    online,
    connected: !!roomRef.current?.connected,
    view,
    sheet,
    busy: false,
    bow: bowRef.current,
    ambience: ambienceRef.current,
    setAmbience: setAmbienceBoth,
    setBow: (b) => {
      bowRef.current = b;
      render();
    },
    setView: setViewBoth,
    setSheet,
    setCard: (id) => setCardId(id),
    toast,
    refresh,
    apply,
    practice,
    players: () => playersRef.current,
    player: (id) => playersRef.current.find((p) => p.id === id),
    refreshLook,
  };
  void tick;

  const meAva = (st?.name?.trim().split(/\s+/).pop() ?? DEFAULT_GUEST)[0]?.toUpperCase() ?? '?';
  // Vạch trong chip đo đoạn đã đi CỦA BẬC ĐANG ĐỨNG (exp_prev → exp_next), đúng như
  // bảng Hồ sơ: chia exp cho cả thang thì người bậc 16 thấy thanh gần đầy còn người mới
  // toan lên bậc 2 thấy một vạch chưa nhô khỏi mép.
  const xpSpan = st ? st.exp_next - st.exp_prev : 0;
  const xpPct = st && xpSpan > 0 ? Math.max(0, Math.min(100, ((st.exp - st.exp_prev) / xpSpan) * 100)) : 0;
  const atTop = (st?.level ?? 1) >= LADDER_TOP;
  const buffLeft = st?.buff_until ? Math.max(0, Date.parse(st.buff_until) - Date.now()) : 0;
  const inv = st?.inventory ?? {};
  const ticker = anns[annIdx];

  return (
    <div id="temple-dom">
      <canvas id="scene" ref={sceneRef as React.RefObject<HTMLCanvasElement>} />
      <div id="joy" className="joy" ref={joyRef}>
        <div className="knob" />
      </div>

      {screen === 'loader' ? (
        <section id="loader" className={`loader${loaderOut ? ' out' : ''}`}>
          <div className="loader-card">
            <div className="lotus-load">
              <svg viewBox="0 0 100 100">
                <g className="petals">
                  <path d="M50 18c9 10 13 21 13 31S58 70 50 76c-8-6-13-17-13-27s4-21 13-31z" />
                  <path d="M50 76C38 76 22 68 16 50c13-1 24 4 32 13" />
                  <path d="M50 76c12 0 28-8 34-26-13-1-24 4-32 13" />
                  <path d="M50 76C42 70 28 58 30 38c9 3 15 10 19 20" />
                  <path d="M50 76c8-6 22-18 20-38-9 3-15 10-19 20" />
                </g>
                <path className="water" d="M14 84c12 4 24 6 36 6s24-2 36-6" />
              </svg>
            </div>
            {noGl ? (
              <>
                <h2>Không dựng được sảnh 3D</h2>
                <small>
                  Máy tính này chưa bật tăng tốc đồ hoạ, nên trình duyệt không cấp ngữ cảnh WebGL. Bật ở{' '}
                  <code>chrome://settings/system</code> rồi mở lại trang.
                </small>
                <button type="button" className="btn gold" onClick={() => location.reload()}>
                  Thử lại
                </button>
              </>
            ) : bootError ? (
              <>
                <h2>Chưa vào được sảnh</h2>
                <small>{bootError}</small>
                <button type="button" className="btn gold" onClick={probeSession}>
                  Thử lại
                </button>
              </>
            ) : choice ? (
              <>
                <h2>{TEMPLE.name}</h2>
                <small>Cầu may trước trận, không cần tài khoản. Điểm đang có vẫn ở nguyên khi đăng ký.</small>
                <div className="loader-acts">
                  <button type="button" className="btn gold wide" onClick={enterAsGuest}>
                    <Icon name="pray" /> Vào với tư cách khách
                  </button>
                  <a className="btn ghost wide" href={loginUrls(lang).signup}>
                    Tạo tài khoản
                  </a>
                  <a className="btn ghost wide" href={loginUrls(lang).login}>
                    Đã có tài khoản
                  </a>
                </div>
              </>
            ) : (
              <>
                <h2>Đang vào sảnh…</h2>
                <div className="bar">
                  <i style={{ ['--p' as string]: `${loaderPct / 100}` }} />
                </div>
                <small>{loaderStep}</small>
              </>
            )}
            <p className="quote">{quote}</p>
          </div>
        </section>
      ) : null}

      {screen === 'hud' ? (
        <div id="hud" className={`hud${ticker ? ' has-ticker' : ''}`}>
          {ticker ? (
            <button id="ticker" className="ticker" aria-label="Thông báo" key={`${ticker.id}-${annIdx}`}>
              <span className="tk-ic">📢</span>
              <span className="tk-win">
                <span className="tk-txt">{ticker.text}</span>
              </span>
            </button>
          ) : null}
          <div className="hud-top">
            <button id="meChip" className="me-chip" onClick={() => setSheet('profile')} title="Hồ sơ">
              <span className="me-ava" style={{ background: sectOf(st?.sect ?? '').color }}>
                {meAva}
              </span>
              <span className="me-info">
                <b>{st?.name || DEFAULT_GUEST}</b>
                <small>{st ? rungLabel(st.level) : ''}</small>
                <i className="xp">
                  <i style={{ width: `${xpPct}%` }} />
                </i>
                <small className="xp-num">{st ? (atTop ? fmt(st.exp) : `${fmt(st.exp)} / ${fmt(st.exp_next)}`) : ''}</small>
              </span>
              <TitleBadge title={st?.title} level={st?.level} size={26} />
              <span className="me-lv">{st?.level ?? 1}</span>
            </button>
            <div className="zoom-btns">
              <button title="Phóng to" aria-label="Phóng to" onClick={() => engRef.current?.zoom(0.85)}>
                +
              </button>
              <button title="Thu nhỏ" aria-label="Thu nhỏ" onClick={() => engRef.current?.zoom(1 / 0.85)}>
                −
              </button>
            </div>
            <div className="top-right">
              <button
                className="help-btn ui-toggle"
                title="Thu gọn menu"
                aria-label="Thu gọn menu"
                onClick={() => {
                  local.set('ui', !uiMin);
                  render();
                }}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <div className="wallet">
                <span title="Tinh Hoa">
                  <Icon name="hex" /> <b>{fmt(st?.sen ?? 0)}</b>
                </span>
                <span title="Kim Cương">
                  <Icon name="ngoc" /> <b>{fmt(st?.ngoc ?? 0)}</b>
                </span>
              </div>
              {fsSupported ? (
                <button
                  className="help-btn"
                  title="Toàn màn hình"
                  aria-label="Toàn màn hình"
                  onClick={() => {
                    if (document.fullscreenElement) void document.exitFullscreen().catch(() => null);
                    else void document.documentElement.requestFullscreen().catch(() => null);
                  }}
                >
                  <Icon name={document.fullscreenElement ? 'compress' : 'expand'} />
                </button>
              ) : null}
              <button className="help-btn mail-btn" title="Gieo quẻ" aria-label="Gieo quẻ" onClick={() => setQueOpen(true)}>
                <Icon name="story" />
                <i className={`mail-badge${queDone === false ? '' : ' hidden'}`}>{queDone === false ? '1' : ''}</i>
              </button>
              <button className="help-btn mail-btn" title="Vòng quay lộc" aria-label="Vòng quay lộc" onClick={() => setViewBoth('wheel')}>
                <Icon name="gift" />
                <i className={`mail-badge${wheelCan ? '' : ' hidden'}`}>{wheelCan ? '1' : ''}</i>
              </button>
              <button className="help-btn" title="Cách chơi" aria-label="Cách chơi" onClick={() => setSheet('guide')}>
                ?
              </button>
              <button className="help-btn esc-btn" title="Cài đặt" aria-label="Cài đặt" onClick={() => setSheet('settings')}>
                esc
              </button>
            </div>
          </div>
          <div className="hud-temple">
            <span className="tname">{TEMPLE.name}</span>
            {ctxUi.out ? (
              <button className="out-btn" onClick={() => engRef.current?.goOutside()}>
                <Icon name={ctxUi.outside ? 'temple' : 'map'} /> {ctxUi.outside ? 'Vào sảnh' : 'Ra sân ngắm cảnh'}
              </button>
            ) : null}
            <span id="tOnline" title="Người thật đang online">
              <i className="dot" /> {online} đang online
            </span>
            {buffLeft > 0 ? <span className="buff">🧧 Bùa +20% · còn {Math.ceil(buffLeft / 60000)} phút</span> : null}
            <a className="out-btn" href={`/${lang}`}>
              <Icon name="back" /> TFTIQ
            </a>
          </div>
          <div className="custom-bar">
            <button
              className="cb-pill"
              title="Đổi không khí / thời gian trong sảnh"
              onClick={() => {
                const label = engRef.current?.nextAmbience();
                if (label) setAmbienceBoth(label);
              }}
            >
              {ambienceRef.current}
            </button>
            <button
              className="cb-pill"
              title="Đổi thời tiết · có tiếng trời"
              onClick={() => {
                const label = engRef.current?.nextWeather();
                if (label) setWeatherBoth(label);
              }}
            >
              {weatherRef.current}
            </button>
          </div>
          <nav className="side-menu">
            {(
              [
                ['rank', 'trophy', 'BXH'],
                ['community', 'users', 'Cộng đồng'],
                ['friends', 'user', 'Đồng đội'],
                ['lobby', 'gamepad', 'Tìm Bạn'],
                ['games', 'dice', 'Tỷ thí'],
                ['stele', 'medal', 'Bảng Tri Ân'],
                ['profile', 'palette', 'Hồ sơ'],
                ['shop', 'shop', 'Cửa hàng'],
                ['bag', 'bag', 'Túi đồ'],
                ['guide', 'book', 'Hướng dẫn'],
                ['settings', 'gear', 'Cài đặt'],
              ] as [SheetKind, string, string][]
            ).map(([kind, icon, label]) => (
              <button key={kind} title={label} onClick={() => setSheet(kind)}>
                <span>
                  <Icon name={icon} />
                </span>
                <em>{label}</em>
                {/* lời mời còn chờ trả lời; im đi khi bảng đang mở vì ván đó đã hiện ra trước mắt */}
                {kind === 'games' && duelWait && sheet !== 'games' ? <i className="badge">{duelWait}</i> : null}
              </button>
            ))}
          </nav>
          <p className={`guide${guideFade ? ' fade' : ''}`} dangerouslySetInnerHTML={{ __html: guide }} />
          <div className="ctx-wrap">
            <button className={`ctx${ctxUi.show ? '' : ' hidden'}`} onClick={clickCtx}>
              {ctxUi.label}
            </button>
          </div>
          <div className="actions">
            <button className={`act${bowRef.current === 'bowing' ? ' on' : ''}${bowRef.current === 'stopping' ? ' wait' : ''}`} onClick={clickBow}>
              <span>
                <Icon name="bow" />
              </span>
              <em>{bowRef.current === 'bowing' ? 'Dừng' : bowRef.current === 'stopping' ? 'Đang dừng…' : 'Cầu may'}</em>
            </button>
            <button className="act" onClick={() => setViewBoth('meditate')}>
              <span>
                <Icon name="meditate" />
              </span>
              <em>Thiền</em>
            </button>
            <button className="act" onClick={() => setOfferOpen((o) => !o)}>
              <span>
                <Icon name="offer" />
              </span>
              <em>Dâng bùa</em>
            </button>
          </div>
          {offerOpen ? (
            <div className="pop">
              {[
                ['huong_tram', 'incense', 'Bùa May Mắn'],
                ['nen_sap', 'candle', 'Nến Hex'],
                ['hoa_dang', 'flower', 'Đóa Sao'],
              ].map(([id, icon, label]) => (
                <button key={id} onClick={() => void doOffer(id)}>
                  <Icon name={icon} /> {label} <b>{inv[id] ?? 0}</b>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {view === 'wheel' ? <WheelView s={store} /> : null}
      {view === 'meditate' ? <MeditateView s={store} /> : null}

      {sheet === 'rank' ? <RankSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'stele' ? <SteleSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'shop' ? <ShopSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'bag' ? <BagSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'profile' ? <ProfileSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'guide' ? <GuideSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'settings' ? <SettingsSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'community' ? <GroupSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'games' ? <GameSheet s={store} tick={gameTick} onWaiting={setDuelWait} onClose={() => setSheet(null)} /> : null}
      {sheet === 'friends' ? (
        <FriendsSheet
          s={store}
          notice={notices[notices.length - 1] ?? null}
          tab0={friendsTab}
          onClose={() => {
            setSheet(null);
            setFriendsTab(null);
          }}
        />
      ) : null}
      {sheet === 'lobby' ? <LobbySheet s={store} onClose={() => setSheet(null)} /> : null}

      {/* Thẻ phải nằm trong khung .modal-card: toàn bộ CSS của nó (rộng 420px, nền phủ,
          lời chúc một hàng) gắn với selector .modal-card:has(.pcard), mount trần là vỡ. */}
      {cardId !== null ? (
        <Modal onClose={() => setCardId(null)}>
          <PlayerCard s={store} id={cardId} onClose={() => setCardId(null)} />
        </Modal>
      ) : null}
      {npc ? <NpcModal s={store} kind={npc.kind} index={npc.index} onClose={() => setNpc(null)} /> : null}

      {queOpen ? (
        <QueModal
          s={store}
          onClose={() => {
            setQueOpen(false);
            setQueDone(true);
          }}
        />
      ) : null}

      {levelQueue.length ? (
        <Modal onClose={() => setLevelQueue((q) => q.slice(1))}>
          <div className="big">
            <TitleBadge big level={levelQueue[0].level} title={levelQueue[0].title} size={64} />
          </div>
          <h3>{rungOf(levelQueue[0].level).stage === 1 ? 'Thăng vận' : 'Lên bậc'}</h3>
          <p>
            Mốc mới: <b>{levelQueue[0].title} · {rungLabel(levelQueue[0].level)}</b>
            <br />+{fmt(levelQueue[0].sen)} Tinh Hoa
            <br />+{fmt(levelQueue[0].ngoc)} Kim Cương
          </p>
          <p className="realm-about">{REALM_ABOUT[rungOf(levelQueue[0].level).realm - 1]}</p>
          <button className="btn gold" onClick={() => setLevelQueue((q) => q.slice(1))}>
            Tiếp tục
          </button>
        </Modal>
      ) : null}

      <div id="fxLayer" className="floaters" ref={fxRef} />
      <div className="floaters" />
      <Notices items={notices} sheetOpen={sheet !== null} onDismiss={dismissNotice} onOpen={openNotice} />
      <Toast html={toastHtml} />
    </div>
  );
}
