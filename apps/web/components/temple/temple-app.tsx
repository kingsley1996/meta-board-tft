// Chánh điện: màn hình chờ, HUD và chỗ nối phòng.
//
// Cây DOM dựng theo đúng id/lớp mà vendor/temple/css/app.css của bản gốc định nghĩa,
// nên stylesheet áp dụng nguyên vẹn; nguồn markup (main.js + temple-markup.ts) đã cắt
// cùng nhóm C, cần đối chiếu thì mở ở commit cca9c6d. DJ/stress/mõ-quest/topup/loc/
// mail/checkin/chore/map/share/coach không được dựng lại. Mọi con số đọc từ apps/api.
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Gain, TempleState } from './api';
import { TempleApiError, get, post } from './api';
import { AMBIENCES, ITEMS, Sound, TEMPLE, TempleEngine, hasWebGL, local, nextFrames, sectOf, type EngineCtx, type EnginePerson } from './engine';
import { petalShower, launchLantern, floater } from './effects';
import { QUOTES } from './stories';
import { TempleRoom, type RemotePlayer } from './room';
import { BagSheet, GardenSheet, GuideSheet, RankSheet, SettingsSheet, SteleSheet, WishDock } from './hall';
import { ChatModal, FriendsSheet, GroupSheet, NpcModal, PlayerCard, type NpcKind } from './people';
import { ChantView, MeditateView, QueModal, WheelView } from './practice';
import { Icon, Modal, Sheet, Toast, esc, fmt, type Look, type SheetKind, type Store, type ViewKind } from './ui';

type LevelUp = { level: number; title: string; sen: number };
type Ann = { id: number; text: string; effect: string };
type CtxAct = 'talk' | 'tell' | 'door' | 'ride' | 'unride' | 'stand' | 'sit' | '';

const ROUND_NAMES = ['thứ nhất', 'thứ hai', 'thứ ba', 'thứ tư', 'thứ năm', 'thứ sáu', 'thứ bảy', 'thứ tám', 'thứ chín', 'thứ mười'];

const DEFAULT_GUEST = 'Phật tử';

function ctxAct(ctx: EngineCtx): CtxAct {
  if (ctx.cable === 'riding') return 'unride';
  if (ctx.seated) return '';
  if (ctx.canTalk) return 'talk';
  if (ctx.teller !== null && ctx.teller >= 0) return 'tell';
  if (ctx.cable) return 'ride';
  if (ctx.door && !ctx.canSit) return 'door';
  return '';
}

function ctxLabel(ctx: EngineCtx, act: CtxAct): string {
  if (ctx.cable === 'riding') return 'Rời cáp treo';
  if (act === 'ride') return 'Đi cáp treo lên đỉnh';
  if (ctx.seated) return 'Đứng dậy';
  if (act === 'talk') return 'Thưa chuyện với thầy';
  if (act === 'tell') return 'Nghe kể chuyện';
  if (act === 'door') return ctx.door === 'out' ? 'Ra sân ngắm cảnh' : 'Vào chánh điện';
  return 'Ngồi xuống';
}

export function TempleApp({ lang }: { lang: string }) {
  const [tick, setTick] = useState(0);
  const [screen, setScreen] = useState<'loader' | 'hud'>('loader');
  const [loaderPct, setLoaderPct] = useState(4);
  const [loaderStep, setLoaderStep] = useState('Mở cổng chùa');
  const [noGl, setNoGl] = useState(false);
  const [view, setView] = useState<ViewKind>('hall');
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [npc, setNpc] = useState<{ kind: NpcKind; index: number } | null>(null);
  const [queOpen, setQueOpen] = useState(false);
  const [lanternOpen, setLanternOpen] = useState(false);
  const [lanternText, setLanternText] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [toastHtml, setToastHtml] = useState('');
  // Quote chỉ được rút sau khi hydrate: rút ở module scope thì server và client ra
  // hai câu khác nhau và React phải dựng lại cả cây.
  const [quote, setQuote] = useState('');
  const [guide, setGuide] = useState('Kéo trái để đi · Vuốt phải để xoay · Chạm bồ đoàn để ngồi');
  const [guideFade, setGuideFade] = useState(true);
  const [levelQueue, setLevelQueue] = useState<LevelUp[]>([]);
  const [fullInfo, setFullInfo] = useState<{ count: number; cap: number } | null>(null);
  const [online, setOnline] = useState(1);
  const [ctxUi, setCtxUi] = useState<{ show: boolean; act: CtxAct; label: string; out: boolean; outside: boolean }>({ show: false, act: '', label: 'Ngồi xuống', out: false, outside: false });
  const [, setFsTick] = useState(0);

  // Nguồn dữ liệu thật của HUD nằm ở refs: hàm nào cũng đọc giá trị hiện tại thay vì
  // giá trị chốt trong closure lần render đầu.
  const stateRef = useRef<TempleState | null>(null);
  const guestRef = useRef(false);
  const meRef = useRef(0);
  const bowRef = useRef<'idle' | 'bowing' | 'stopping'>('idle');
  const ctxRef = useRef<EngineCtx | null>(null);
  const playersRef = useRef<RemotePlayer[]>([]);
  const ambienceRef = useRef(AMBIENCES[0].label);
  const viewRef = useRef<ViewKind>('hall');
  const lanternRef = useRef<HTMLDivElement | null>(null);
  const beadsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<HTMLCanvasElement | null>(null);
  const joyRef = useRef<HTMLDivElement | null>(null);
  const beadsBoxRef = useRef<HTMLElement | null>(null);

  const engRef = useRef<TempleEngine | null>(null);
  const roomRef = useRef<TempleRoom | null>(null);
  const startedRef = useRef(false);

  const pendingBows = useRef(0);
  const bowsAt = useRef(Date.now());
  const sendingBows = useRef(false);
  const beadShown = useRef(0);
  const pendingBeads = useRef(0);
  const beadLast = useRef(Date.now());
  const beadWaitUntil = useRef(0);

  const [beadUi, setBeadUi] = useState({ num: 0, round: '', gain: '' });

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

  const apply = (g: Gain) => {
    setState(g.state ?? stateRef.current);
    if (g.gained) {
      floater(lanternRef.current, `<svg class="i"><use href="#i-incense"/></svg> +${fmt(g.gained)}`);
      Sound.chime();
    }
    if (g.level_ups?.length) setLevelQueue((q) => [...q, ...g.level_ups!.map((l) => ({ level: l.level, title: l.title, sen: l.sen }))]);
  };

  const practice = async (body: Record<string, unknown>, opts: { silent?: boolean } = {}) => {
    try {
      const r = (await post<Gain & Record<string, unknown>>('/practice', body)) as Gain;
      const ms = (r as unknown as { meditate_start?: unknown }).meditate_start;
      if (typeof ms === 'string') r.state = { ...r.state, meditate_start: ms };
      apply(r);
      if (!opts.silent && r.gained) toast(`<svg class="i"><use href="#i-lotus"/></svg> +${fmt(r.gained)} công đức`);
      return r;
    } catch (e) {
      if ((e as TempleApiError).status !== 429) toast((e as Error).message);
      return null;
    }
  };

  const refresh = async () => {
    try {
      const r = await get<{ state: TempleState; guest: boolean; player_id: number }>('/state');
      stateRef.current = r.state;
      guestRef.current = r.guest;
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
    engRef.current?.look({
      id: meRef.current,
      name: st.name,
      sect: st.sect,
      title: st.title,
      honor: st.honor,
      level: st.level,
      appearance: profile.appearance ?? {},
      equipped: profile.equipped ?? {},
    });
  };

  const sendBows = async () => {
    if (sendingBows.current || !pendingBows.current) return;
    const n = Math.min(5, pendingBows.current);
    pendingBows.current -= n;
    sendingBows.current = true;
    try {
      await practice({ type: 'bow', count: n }, { silent: true });
    } finally {
      sendingBows.current = false;
    }
  };

  const onBowDone = () => {
    Sound.chime();
    if (bowRef.current === 'stopping' && (engRef.current?.world?.player?.bowT ?? 0) === 0) {
      bowRef.current = 'idle';
      render();
    }
    pendingBows.current += 1;
    if (pendingBows.current === 1) bowsAt.current = Date.now();
    if (pendingBows.current >= 4) void sendBows();
  };

  const tapBead = () => {
    beadShown.current += 1;
    pendingBeads.current += 1;
    Sound.click();
    if (beadShown.current % 108 === 0) Sound.bell(Sound.now + 0.05, 220, 0.3, 6);
    const st = stateRef.current;
    const round = Math.floor((st?.lifetime.beads ?? 0) / 108) + (st?.lifetime.rounds ?? 0);
    setBeadUi({
      num: beadShown.current % 108,
      round: `Vòng ${ROUND_NAMES[round] || `thứ ${round + 1}`} · tổng ${fmt(st?.lifetime.rounds ?? 0)} chuỗi`,
      gain: '',
    });
  };

  const liftBeads = () => {
    const box = beadsBoxRef.current;
    if (!box) return;
    if (window.matchMedia('(max-height: 480px)').matches) engRef.current?.liftView(0, box.offsetWidth / 2);
    else engRef.current?.liftView(Math.max(box.offsetHeight * 0.55, box.offsetHeight - window.innerHeight * 0.18));
  };

  const openBeadsView = () => {
    beadWaitUntil.current = 0;
    setViewBoth('beads');
    engRef.current?.openBeads(stateRef.current?.equipped.beads);
    beadShown.current = 0;
    beadLast.current = Date.now();
    setBeadUi({ num: 0, round: `Vòng ${ROUND_NAMES[Math.floor((stateRef.current?.lifetime.beads ?? 0) / 108)] || 'thứ nhất'} · tổng ${fmt(stateRef.current?.lifetime.rounds ?? 0)} chuỗi`, gain: '' });
    engRef.current?.setMeditating(true);
    Sound.setActive(false);
    liftBeads();
  };

  const clickBeads = () => {
    const en = engRef.current;
    if (!en) return;
    clickBowStop();
    if (!en.seated) {
      if (en.sit()) {
        openBeadsView();
        return;
      }
      if (!en.walkToSeat()) {
        toast('Hãy vào chánh điện, ngồi lên bồ đoàn để lần hạt');
        return;
      }
      beadWaitUntil.current = Date.now() + 20_000;
      feed(`<svg class="i"><use href="#i-cushion"/></svg> Đang đến bồ đoàn…`);
      return;
    }
    openBeadsView();
  };

  const closeBeads = () => {
    engRef.current?.closeBeads();
    engRef.current?.liftView(0);
    engRef.current?.setMeditating(false);
    Sound.setActive(true);
    setViewBoth('hall');
  };

  const clickBow = () => {
    const en = engRef.current;
    if (!en) return;
    if (bowRef.current === 'idle') {
      if (!en.seated && !en.sit()) {
        toast('Hãy đến gần một bồ đoàn trống để ngồi lạy');
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
    if (kind === 'bell') {
      engRef.current?.offer('bell');
      await practice({ type: 'bell' });
      return;
    }
    if (kind === 'den_hoa_dang') {
      setLanternText('');
      setLanternOpen(true);
      return;
    }
    try {
      const r = await post<Gain & { left: number }>('/use', { item: kind });
      apply(r);
      engRef.current?.offer(kind as 'huong_tram' | 'nen_sap' | 'hoa_dang');
      Sound.chime();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const releaseLantern = async () => {
    if (lanternBusy.current) return;
    lanternBusy.current = true;
    try {
      const r = await post<{ state: TempleState; lantern: { id: number; text: string; status: string }; gained: number; level_ups: LevelUp[] }>('/lanterns', { text: lanternText.trim() });
      apply({ state: r.state, gained: r.gained, level_ups: r.level_ups });
      setLanternOpen(false);
      if (r.lantern.status === 'live') launchLantern(lanternRef.current, stateRef.current?.name ?? '', r.lantern.text);
      Sound.success();
      petalShower(18);
      toast(`<svg class="i"><use href="#i-lantern"/></svg> Đã thả đèn nguyện`);
      void refresh().catch(() => null);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      lanternBusy.current = false;
    }
  };
  const lanternBusy = useRef(false);

  const setAmbienceBoth = (label: string) => {
    ambienceRef.current = label;
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
        onFull: setFullInfo,
        onEvent: (msg) => {
          if (msg.t === 'emote') engRef.current?.emote(Number(msg.id), String(msg.e ?? ''));
          else if (msg.t === 'lantern') {
            launchLantern(lanternRef.current, String(msg.name ?? ''), String(msg.text ?? ''));
            toast(`<svg class="i"><use href="#i-lantern"/></svg> <b>${esc(msg.name)}</b> vừa thả một ngọn đèn`);
          }
        },
        onConnection: (up) => {
          if (up) void refresh().catch(() => null);
        },
      },
      TEMPLE.id,
      'chung',
      () => engRef.current?.netState() ?? null,
    );
    void roomRef.current.connect();
  };

  // Nối phòng + dựng engine: một lần trong đời trang, không phụ thuộc render.
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
        setLoaderPct(100);
        void nextFrames(2).then(() => setScreen('hud'));
        window.setTimeout(() => setGuideFade(true), 9000);
      },
      onBowDone,
      onContext: (ctx) => {
        ctxRef.current = ctx;
        Sound.setOutdoors?.(!!ctx.outside);
        const act = ctxAct(ctx);
        setCtxUi({ show: ctx.seated || ctx.canSit || ctx.canTalk || (ctx.teller !== null && ctx.teller >= 0) || !!ctx.door || !!ctx.cable, act, label: ctxLabel(ctx, act), out: !!ctx.door, outside: !!ctx.outside });
        if (!ctx.seated && bowRef.current !== 'idle') clickBowStop();
        if (ctx.outside) setGuideFade(true);
      },
      onToast: toast,
      onNpc: (kind, index) => setNpc({ kind, index: index ?? 0 }),
      onPlayerTap: (id) => setCardId(id),
      onMerit: () => setSheet('stele'),
      onBead: tapBead,
    });
    engRef.current = engine;
    try {
      engine.attach(sceneRef.current!, joyRef.current!, beadsCanvasRef.current!);
    } catch {
      // Thăm dò đã qua nhưng trình duyệt vẫn từ chối context (hết suất, GPU process chết).
      setNoGl(true);
      return;
    }

    void (async () => {
      try {
        // /state đòi phiên, mà lượt ghé đầu tiên thì chưa có cookie nào: một hàng
        // khách được dựng ở đây, trước mọi lời gọi khác của chùa.
        await post('/guest');
        const r = await get<{ state: TempleState; guest: boolean; player_id: number }>('/state');
        stateRef.current = r.state;
        guestRef.current = r.guest;
        meRef.current = r.player_id;
        render();
        setLoaderPct(4);
        const person: EnginePerson = {
          id: r.player_id,
          name: r.state.name || DEFAULT_GUEST,
          sect: r.state.sect,
          title: r.state.title,
          honor: r.state.honor,
          level: r.state.level,
          appearance: r.state.appearance,
          equipped: r.state.equipped,
        };
        await engine.enter(person);
        if (r.state.today.visits === 0) void practice({ type: 'visit' }, { silent: true });
        startRoom();
        void get<{ rows: Ann[] }>('/announcements')
          .then((a) => setAnns(a.rows))
          .catch(() => null);
        setWheelCan(false);
      } catch (e) {
        setLoaderStep((e as Error).message || 'Chùa đang bận, thử lại sau nhé');
        setLoaderPct(0);
      }
    })();
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

  // Nhịp 1s: gom lạy, gom hạt, chờ bồ đoàn.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (pendingBows.current && (bowRef.current !== 'bowing' || Date.now() - bowsAt.current > 10_000)) {
        bowsAt.current = Date.now();
        void sendBows();
      }
      if (beadWaitUntil.current && Date.now() < beadWaitUntil.current && engRef.current?.seated) openBeadsView();
      if (beadWaitUntil.current && Date.now() >= beadWaitUntil.current) beadWaitUntil.current = 0;
      if (pendingBeads.current && viewRef.current === 'beads' && Date.now() - beadLast.current >= 4000) {
        beadLast.current = Date.now();
        const n = Math.min(30, pendingBeads.current);
        pendingBeads.current -= n;
        void (async () => {
          const r = await practice({ type: 'bead', count: n }, { silent: true });
          if (!r) return;
          setBeadUi((b) => ({ ...b, gain: `+${fmt(r.gained ?? 0)} công đức` }));
          if (r.extra?.rounds) {
            petalShower(26);
            toast(`<svg class="i"><use href="#i-beads"/></svg> Tròn một chuỗi 108 hạt!`);
          }
        })();
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Escape') {
        if (viewRef.current === 'beads') closeBeads();
        else if (sheet) setSheet(null);
        else if (offerOpen) setOfferOpen(false);
        return;
      }
      if (e.code === 'KeyB') clickBow();
      if (e.code === 'KeyT') (viewRef.current === 'beads' ? closeBeads : clickBeads)();
      if (e.code === 'KeyE') clickCtx();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet, offerOpen]);

  useEffect(() => {
    setQuote(QUOTES[Math.floor(Math.random() * QUOTES.length)] ?? '');
  }, []);

  useEffect(() => {
    const onVis = () => roomRef.current?.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const onFs = () => setFsTick((n) => n + 1);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const st = stateRef.current;
  const uiMin = local.get('ui') === true;
  const fsSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

  const store: Store = {
    lang,
    guest: guestRef.current,
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
    lanternLayer: () => lanternRef.current,
    openLanternForm: () => {
      setLanternText('');
      setLanternOpen(true);
    },
    refreshLook,
  };
  void tick;

  const meAva = (st?.name?.trim().split(/\s+/).pop() ?? DEFAULT_GUEST)[0]?.toUpperCase() ?? '?';
  const xpPct = st && st.exp_next > 0 ? Math.min(100, (st.exp / st.exp_next) * 100) : 0;
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
        <section id="loader" className="loader">
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
                <h2>Không dựng được chánh điện 3D</h2>
                <small>
                  Máy tính này chưa bật tăng tốc đồ hoạ, nên trình duyệt không cấp ngữ cảnh WebGL. Bật ở{' '}
                  <code>chrome://settings/system</code> rồi mở lại trang.
                </small>
                <button type="button" className="btn gold" onClick={() => location.reload()}>
                  Thử lại
                </button>
              </>
            ) : (
              <>
                <h2>Đang về chùa…</h2>
                <div className="bar">
                  <i style={{ width: `${loaderPct}%` }} />
                </div>
                <small>{loaderStep}</small>
              </>
            )}
            <p className="quote">{quote}</p>
          </div>
        </section>
      ) : null}

      {screen === 'hud' ? (
        <div id="hud" className={`hud${ticker ? ' has-ticker' : ''}${view === 'beads' ? ' hidden' : ''}`}>
          {ticker ? (
            <button id="ticker" className="ticker" aria-label="Thông báo" key={`${ticker.id}-${annIdx}`}>
              <span className="tk-ic">📢</span>
              <span className="tk-win">
                <span className="tk-txt">{ticker.text}</span>
              </span>
            </button>
          ) : null}
          <div className="hud-top">
            <button id="meChip" className="me-chip" onClick={() => setSheet('bag')}>
              <span className="me-ava" style={{ background: sectOf(st?.sect ?? '').color }}>
                {meAva}
              </span>
              <span className="me-info">
                <b>{st?.name || DEFAULT_GUEST}</b>
                <small>{st?.title}</small>
                <i className="xp">
                  <i style={{ width: `${xpPct}%` }} />
                </i>
              </span>
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
                <span>
                  <Icon name="sen" /> <b>{fmt(st?.sen ?? 0)}</b>
                </span>
                <span>
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
            </div>
          </div>
          <div className="hud-temple">
            <span className="tname">{TEMPLE.name}</span>
            {ctxUi.out ? (
              <button className="out-btn" onClick={() => engRef.current?.goOutside()}>
                <Icon name={ctxUi.outside ? 'temple' : 'map'} /> {ctxUi.outside ? 'Vào chánh điện' : 'Ra sân ngắm cảnh'}
              </button>
            ) : null}
            <span id="tOnline" title="Người thật đang online">
              <i className="dot" /> {online} đang online
            </span>
            {buffLeft > 0 ? <span className="buff">🪷 Trầm hương +20% · còn {Math.ceil(buffLeft / 60000)} phút</span> : null}
            <a className="out-btn" href={`/${lang}`}>
              <Icon name="back" /> TFTIQ
            </a>
          </div>
          <div className="custom-bar">
            <button
              className="cb-pill"
              title="Đổi không khí / thời gian trong chùa"
              onClick={() => {
                const label = engRef.current?.nextAmbience();
                if (label) setAmbienceBoth(label);
              }}
            >
              {ambienceRef.current}
            </button>
          </div>
          <nav className="side-menu">
            {(
              [
                ['rank', 'trophy', 'Xếp hạng'],
                ['community', 'users', 'Cộng đồng'],
                ['friends', 'user', 'Đồng tu'],
                ['garden', 'lotus', 'Vườn Phật'],
                ['stele', 'medal', 'Bia tri ân'],
                ['bag', 'bag', 'Túi đồ'],
                ['guide', 'book', 'Thiền phái'],
                ['settings', 'gear', 'Cài đặt'],
              ] as [SheetKind, string, string][]
            ).map(([kind, icon, label]) => (
              <button key={kind} title={label} onClick={() => setSheet(kind)}>
                <span>
                  <Icon name={icon} />
                </span>
                <em>{label}</em>
              </button>
            ))}
          </nav>
          <WishDock s={store} />
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
              <em>{bowRef.current === 'bowing' ? 'Dừng lạy' : bowRef.current === 'stopping' ? 'Đang dừng…' : 'Lạy Phật'}</em>
            </button>
            <button className={`act${view === 'beads' ? ' on' : ''}`} onClick={clickBeads}>
              <span>
                <Icon name="beads" />
              </span>
              <em>Tràng hạt</em>
            </button>
            <button className="act" onClick={() => setViewBoth('chant')}>
              <span>
                <Icon name="drum" />
              </span>
              <em>Tụng kinh</em>
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
              <em>Dâng lễ</em>
            </button>
          </div>
          {offerOpen ? (
            <div className="pop">
              {[
                ['huong_tram', 'incense', 'Thắp hương'],
                ['nen_sap', 'candle', 'Thắp nến'],
                ['hoa_dang', 'flower', 'Dâng hoa'],
                ['den_hoa_dang', 'lantern', 'Thả đèn hoa đăng'],
              ].map(([id, icon, label]) => (
                <button key={id} onClick={() => void doOffer(id)}>
                  <Icon name={icon} /> {label} <b>{inv[id] ?? 0}</b>
                </button>
              ))}
              <button onClick={() => void doOffer('bell')}>
                <Icon name="bell" /> Thỉnh chuông
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <section id="beadsView" className={`beads${view === 'beads' ? '' : ' hidden'}`}>
        <canvas id="beadsCanvas" ref={beadsCanvasRef} />
        <button className="pill back" onClick={closeBeads}>
          <Icon name="back" /> Quay lại
        </button>
        <div className="bead-count">
          <div>
            <b>{beadUi.num}</b> <span>/ 108</span>
          </div>
          <small>{beadUi.round}</small>
        </div>
        <p className="bead-hint">
          Chạm hoặc vuốt xuống để lần hạt
          <br />
          <span>{beadUi.gain}</span>
        </p>
      </section>

      {view === 'wheel' ? <WheelView s={store} /> : null}
      {view === 'chant' ? <ChantView s={store} /> : null}
      {view === 'meditate' ? <MeditateView s={store} /> : null}

      {sheet === 'rank' ? <RankSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'garden' ? <GardenSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'stele' ? <SteleSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'bag' ? <BagSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'guide' ? <GuideSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'settings' ? <SettingsSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'community' ? <GroupSheet s={store} onClose={() => setSheet(null)} /> : null}
      {sheet === 'friends' ? <FriendsSheet s={store} onClose={() => setSheet(null)} onChat={(id) => { setSheet(null); setChatId(id); }} /> : null}

      {cardId !== null ? <PlayerCard s={store} id={cardId} onClose={() => setCardId(null)} onChat={(id) => { setCardId(null); setChatId(id); }} /> : null}
      {chatId !== null ? <ChatModal s={store} id={chatId} onClose={() => setChatId(null)} /> : null}
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

      {lanternOpen ? (
        <Modal onClose={() => setLanternOpen(false)}>
          <h3>
            <Icon name="lantern" /> Thả đèn nguyện
          </h3>
          <p className="muted">Ngọn đèn kèm lời nguyện của bạn sẽ bay ngang màn hình của mọi người trong chánh điện.</p>
          <input maxLength={140} placeholder="Nguyện cầu bình an cho muôn loài 🪷" value={lanternText} onChange={(e) => setLanternText(e.target.value)} />
          <div className="row">
            <button className="btn ghost" onClick={() => setLanternOpen(false)}>
              Để sau
            </button>
            <button className="btn gold" onClick={() => void releaseLantern()}>
              Thả đèn <Icon name="lantern" />
            </button>
          </div>
        </Modal>
      ) : null}

      {fullInfo ? (
        <div className="full-screen">
          <div className="full-card">
            <div className="full-lotus">
              <Icon name="sen" />
            </div>
            <h3>Chùa đã đủ người</h3>
            <p>Chánh điện đang có {fullInfo.count}/{fullInfo.cap} đạo hữu. Chờ một slot trống rồi vào lại nhé.</p>
            <button className="btn gold" onClick={() => window.location.reload()}>
              Thử lại ngay
            </button>
          </div>
        </div>
      ) : null}

      {levelQueue.length ? (
        <Modal onClose={() => setLevelQueue((q) => q.slice(1))}>
          <div className="big">
            <Icon name="spark" />
          </div>
          <h3>Lên bậc {levelQueue[0].level}</h3>
          <p>
            Bậc mới: <b>{levelQueue[0].title}</b>
            <br />+{fmt(levelQueue[0].sen)} Sen
          </p>
          <button className="btn gold" onClick={() => setLevelQueue((q) => q.slice(1))}>
            Nam mô A Di Đà Phật
          </button>
        </Modal>
      ) : null}

      <div id="lanternLayer" className="lantern-layer" ref={lanternRef} />
      <div className="floaters" />
      <Toast html={toastHtml} />
    </div>
  );
}
