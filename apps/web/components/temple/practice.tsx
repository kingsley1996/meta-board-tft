// Ba màn hành trì nằm đè lên cảnh chùa: tụng kinh · gõ mõ, thiền định, vòng quay lộc.
//
// Cả ba giữ đúng cây DOM và đúng lớp CSS của bản gốc (chant/meditate/wheel-view trong
// app.css) nên giao diện không đổi; thứ đổi là chỗ quyết định số công đức — mọi con số
// đều do apps/api trả về, máy khách không tự tính nữa.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { KINH } from '@/vendor/temple/js/kinh.js';
import { get, post, type TempleState } from './api';
import { Sound, local } from './engine';
import { petalShower } from './effects';
import { Icon, Modal, fmt, type Store } from './ui';

type Sutra = { id: string; name: string; note: string; lines: string[] };

const lineUrl = (k: Sutra, i: number) => `/audio/kinh/${k.id}/${String(k.id === 'niem' ? 0 : i).padStart(2, '0')}.mp3`;

// ---- Tụng kinh ---------------------------------------------------------------

export function ChantView({ s }: { s: Store }) {
  const [kinhId, setKinhId] = useState<string>(KINH[0].id);
  const [at, setAt] = useState(0);
  const [said, setSaid] = useState<number | null>(null);
  const [gain, setGain] = useState('');
  const [voice, setVoice] = useState(() => local.get('chantVoice') !== false);
  const [auto, setAuto] = useState(false);
  const [tempo, setTempo] = useState(() => Number(local.get('tempo') ?? 66));

  const box = useRef<HTMLElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const mo = useRef<HTMLButtonElement>(null);
  // Trạng thái của một buổi tụng đổi theo mỗi tiếng mõ, mà vòng lặp tự động phải đọc
  // được giá trị mới nhất — nên nó nằm trong ref, không nằm trong state.
  const c = useRef({ i: 0, say: null as number | null, finishing: false, timer: 0, autoId: 0, kinh: KINH[0] as Sutra });
  const store = useRef(s);
  store.current = s;

  const kinh = KINH.find((k) => k.id === kinhId) ?? KINH[0];
  c.current.kinh = kinh;

  const mark = useCallback((index: number, saying: number | null) => {
    setAt(index);
    setSaid(saying);
    const box2 = lines.current;
    const cur = box2?.children[saying ?? index] as HTMLElement | undefined;
    if (box2 && cur) box2.scrollTo({ top: cur.offsetTop - box2.clientHeight / 2 + cur.clientHeight / 2, behavior: 'smooth' });
  }, []);

  const finish = useCallback(async () => {
    const k = c.current.kinh;
    c.current.i = 0;
    c.current.say = null;
    c.current.finishing = false;
    mark(0, null);
    Sound.bigBell();
    petalShower(24);
    const r = await store.current.practice({ type: 'chant_done', sutra: k.id }, { silent: true });
    setGain(r?.gained ? `+${r.gained} công đức` : '');
    store.current.toast(`<svg class="i"><use href="#i-lotus"/></svg> Đã tụng trọn ${k.name}${r?.gained ? `: +${r.gained} công đức` : ''}. Nam mô A Di Đà Phật.`, 4500);
  }, [mark]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  const flush = useCallback(() => {
    if (!c.current.finishing) return;
    window.clearTimeout(c.current.timer);
    void finishRef.current();
  }, []);

  const hit = useCallback(
    (byAuto: boolean) => {
      const st = c.current;
      if (st.finishing) return Promise.resolve(0);
      Sound.mok(Sound.now, 0.6);
      const b = mo.current;
      if (b) {
        b.classList.remove('hit');
        void b.offsetWidth;
        b.classList.add('hit');
      }
      store.current.engine?.strikeMo();
      const k = st.kinh;
      const index = st.i++;
      const last = st.i >= k.lines.length;
      const text = k.lines[k.id === 'niem' ? 0 : index] ?? '';
      const on = voice && Sound.enabled;
      const speaking = on ? Sound.sayLine(lineUrl(k, index), text) : null;
      st.say = speaking ? index : null;
      if (speaking) for (const n of [index + 1, index + 2]) if (n < k.lines.length) void Sound.loadLine(lineUrl(k, n));
      if (!last) mark(st.i, st.say);
      else if (!speaking) void finishRef.current();
      else {
        st.finishing = true;
        mark(st.i, st.say);
        void speaking.then((ms) => {
          if (st.finishing) st.timer = window.setTimeout(() => flush(), ms + 200);
        });
      }
      return speaking ?? Promise.resolve(0);
    },
    [flush, mark, voice],
  );

  const hitRef = useRef(hit);
  hitRef.current = hit;

  // Nhịp gõ là nhịp *tối đa*: câu dài thì đợi giọng đọc xong mới gõ tiếng kế tiếp.
  useEffect(() => {
    const st = c.current;
    window.clearTimeout(st.timer);
    const id = ++st.autoId;
    if (!auto) return;
    const step = async () => {
      const ms = (await hitRef.current(true)) || 0;
      if (id === c.current.autoId) {
        c.current.timer = window.setTimeout(() => void step(), Math.max(60000 / tempo, ms ? ms + 250 : 0) + (c.current.finishing ? 4000 : 0));
      }
    };
    st.timer = window.setTimeout(() => void step(), 60000 / tempo);
    return () => window.clearTimeout(st.timer);
  }, [auto, tempo]);

  // Vào buổi tụng: cảnh chùa vẫn chạy, chỉ có bảng kinh và mõ ở dưới màn hình.
  useEffect(() => {
    const en = s.engine;
    Sound.init();
    Sound.setActive(false);
    en?.setMeditating(true);
    en?.showMo(true);
    const lift = () => {
      const el = box.current;
      if (!el) return;
      if (window.matchMedia('(max-height: 480px)').matches) en?.liftView(0, el.offsetWidth / 2);
      else en?.liftView(Math.max(el.offsetHeight * 0.55, el.offsetHeight - window.innerHeight * 0.18));
    };
    lift();
    window.addEventListener('resize', lift);
    return () => {
      window.removeEventListener('resize', lift);
      window.clearTimeout(c.current.timer);
      Sound.stopLine();
      en?.showMo(false);
      en?.liftView(0);
      en?.setMeditating(false);
      Sound.setActive(true);
    };
  }, [s.engine]);

  const pick = (id: string) => {
    flush();
    Sound.stopLine();
    c.current.i = 0;
    c.current.say = null;
    setKinhId(id);
    mark(0, null);
    setGain('');
  };

  const niem = kinh.id === 'niem';

  return (
    <section className="chant" ref={box}>
      <button className="pill back" onClick={() => s.setView('hall')}>
        <Icon name="back" /> Quay lại
      </button>
      <div className="chant-pick">
        {KINH.map((k) => (
          <button key={k.id} className={k.id === kinh.id ? 'on' : ''} onClick={() => pick(k.id)}>
            {k.name}
          </button>
        ))}
      </div>
      <p className="chant-note">{kinh.note}</p>
      <div className="chant-lines" ref={lines}>
        {niem ? (
          <p className="on big">{kinh.lines[0]}</p>
        ) : (
          kinh.lines.map((l, i) => {
            const cur = said ?? at;
            return (
              <p key={i} className={i === cur ? 'on' : i < cur ? 'done' : ''}>
                {l}
              </p>
            );
          })
        )}
      </div>
      <div className="chant-foot">
        <div className="chant-count">
          <b>{at}</b>
          <span> / {kinh.lines.length}</span>
          <small>{gain}</small>
        </div>
        <button className="mo" ref={mo} aria-label="Gõ mõ" onClick={() => void hit(false)}>
          <svg viewBox="0 0 120 100" aria-hidden="true">
            <defs>
              <radialGradient id="moG" cx=".4" cy=".35" r=".8">
                <stop offset="0" stopColor="#c47a3a" />
                <stop offset=".6" stopColor="#8a4a1e" />
                <stop offset="1" stopColor="#4a2410" />
              </radialGradient>
            </defs>
            <ellipse cx="60" cy="58" rx="50" ry="36" fill="url(#moG)" />
            <path d="M18 62c14 12 70 12 84 0" fill="none" stroke="#2a1408" strokeWidth="5" strokeLinecap="round" />
            <path d="M34 34c14-9 38-9 52 0" fill="none" stroke="#e0a868" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
            <circle cx="60" cy="20" r="7" fill="#6a3616" />
          </svg>
        </button>
        <div className="chant-auto">
          <label>
            <input
              type="checkbox"
              checked={voice}
              onChange={(e) => {
                setVoice(e.target.checked);
                local.set('chantVoice', e.target.checked);
                if (!e.target.checked) {
                  Sound.stopLine();
                  c.current.say = null;
                  mark(c.current.i, null);
                }
              }}
            />{' '}
            Giọng đọc (AI)
          </label>
          <label>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Mõ tự động
          </label>
          <label className="chant-tempo">
            Nhịp <input type="range" min={40} max={110} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} />
          </label>
          <small>Tụng trọn một bài kinh mới có công đức</small>
        </div>
      </div>
    </section>
  );
}

// ---- Thiền định --------------------------------------------------------------

const DURATIONS = [5, 10, 20, 30, 0];

export function MeditateView({ s }: { s: Store }) {
  const [min, setMin] = useState(5);
  const [start, setStart] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState<{ minutes: number; gained: number; complete: boolean } | null>(null);
  const target = useRef(min);
  const stopping = useRef(false);

  // Trang được tải lại giữa lúc đang ngồi thiền thì đồng hồ phải chạy tiếp từ giờ máy
  // chủ ghi, không phải từ lúc component mount.
  useEffect(() => {
    const iso = s.state?.meditate_start;
    if (iso) {
      setStart(Date.parse(iso));
      target.current = min;
    }
  }, []);

  useEffect(() => {
    if (start === null || done) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, [start, done]);

  const secs = start === null ? 0 : Math.floor((Date.now() - start) / 1000);
  void tick;

  const stop = async (complete: boolean) => {
    // Một nhịp xả chỉ được đi một lần: đồng hồ 250ms và effect dưới đây cùng gọi stop()
    // khi chạm mốc, mà setStart(null) chỉ có tác dụng sau một lượt render.
    if (stopping.current) return;
    stopping.current = true;
    const en = s.engine;
    Sound.bigBell();
    en?.setMeditating(false);
    const r = await s.practice({ type: 'meditate_end' }, { silent: true });
    const minutes = Number(r?.extra?.minutes ?? 0);
    stopping.current = false;
    setStart(null);
    if (minutes > 0) setDone({ minutes, gained: r?.gained ?? 0, complete });
    else s.toast('Thiền chưa đủ 1 phút nên chưa ghi nhận công đức');
  };

  useEffect(() => {
    if (start === null || done) return;
    if ((target.current && secs >= target.current * 60) || secs >= 3600) void stop(true);
  }, [secs, start, done]);

  const begin = async () => {
    if (!s.engine?.walkToSeat()) {
      s.toast('Hãy đến gần một bồ đoàn trống để ngồi thiền');
      return;
    }
    try {
      const r = await s.practice({ type: 'meditate_start' }, { silent: true });
      const iso = r?.state.meditate_start;
      if (!iso) return;
      target.current = min;
      setStart(Date.parse(iso));
      s.engine?.setMeditating(true);
      Sound.setActive(false);
      Sound.bigBell();
    } catch {
      // practice() đã báo lỗi bằng toast
    }
  };

  const phase = (secs % 10) / 10;
  const breath = phase < 0.4 ? 'Hít vào…' : phase < 0.5 ? 'Giữ…' : 'Thở ra…';
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <section className="meditate">
      {start === null ? (
        <div className="med-pick">
          <h2>Thiền định</h2>
          <p>Ngồi thẳng lưng, thả lỏng vai, theo dõi hơi thở.</p>
          <div className="chips big">
            {DURATIONS.map((m) => (
              <button key={m} className={m === min ? 'on' : ''} onClick={() => setMin(m)}>
                {m ? `${m} phút` : 'Tự do'}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => s.setView('hall')}>
              Để sau
            </button>
            <button className="btn gold" onClick={() => void begin()}>
              Bắt đầu
            </button>
          </div>
        </div>
      ) : (
        <div className="med-run">
          <div className="breath">
            <i />
            <span>{breath}</span>
          </div>
          <div className="med-time">
            {mm}:{ss}
          </div>
          <p className="muted">{min ? `Mục tiêu ${min} phút · tối đa 60 phút một nhịp` : 'Thiền tự do · tối đa 60 phút một nhịp'}</p>
          <button className="btn ghost" onClick={() => void stop(false)}>
            Xả thiền
          </button>
        </div>
      )}
      {done ? (
        <Modal
          onClose={() => {
            setDone(null);
            s.setView('hall');
          }}
        >
          <div className="big">
            <Icon name="meditate" />
          </div>
          <h3>{done.complete ? 'Viên mãn' : 'Xả thiền'}</h3>
          <p>
            Bạn đã thiền {done.minutes} phút
            <br />+{fmt(done.gained)} công đức
          </p>
          <p className="muted">“Tâm an thì cảnh an.”</p>
          <button
            className="btn gold"
            onClick={() => {
              setDone(null);
              s.setView('hall');
            }}
          >
            Hồi hướng công đức <Icon name="pray" />
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

// ---- Vòng quay lộc -----------------------------------------------------------

type Segment = { label: string; pct: number; sen?: number; ngoc?: number; item?: string; count?: number; rare?: boolean };
type Drawn = Segment & { idx: number };
type WheelInfo = { segs: Segment[]; can: boolean; result: Drawn | null };
type WheelDraw = { state: TempleState; result: Drawn; again: boolean };

export function WheelView({ s }: { s: Store }) {
  const [info, setInfo] = useState<WheelInfo | null>(null);
  const [spin, setSpin] = useState<number | null>(null);
  const [won, setWon] = useState<Drawn | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    void get<WheelInfo>('/draws/wheel')
      .then(setInfo)
      .catch((e: Error) => s.toast(e.message));
  }, []);

  if (!info) return <section className="wheel-view" />;
  const step = 360 / info.segs.length;
  const stops = info.segs.map((_, i) => `${i % 2 ? '#f6e3b4' : '#fff6e0'} ${i * step}deg ${(i + 1) * step}deg`).join(',');

  const go = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await post<WheelDraw>('/draws/wheel');
      setSpin(r.result.idx);
      window.setTimeout(() => {
        busy.current = false;
        setWon(r.result);
        s.apply({ state: r.state });
        petalShower(r.result.rare ? 70 : 40, ['🌸', '✨', '🪷', '🏮']);
        void get<WheelInfo>('/draws/wheel').then(setInfo).catch(() => null);
      }, 4300);
    } catch (e) {
      busy.current = false;
      s.toast((e as Error).message);
    }
  };

  return (
    <section className="wheel-view">
      <button className="pill back" onClick={() => s.setView('hall')}>
        <Icon name="back" /> Quay lại
      </button>
      <div className="wheel-box">
        <div className="wheel-wrap">
          <i className="wheel-pin" />
          <div
            className="wheel"
            style={{
              background: `conic-gradient(${stops})`,
              transform: spin === null ? undefined : `rotate(${360 * 6 + 360 - (spin + 0.5) * step}deg)`,
            }}
          >
            {info.segs.map((seg, i) => (
              <span key={seg.label} style={{ transform: `rotate(${(i + 0.5) * step}deg)` }}>
                <b>{seg.label}</b>
              </span>
            ))}
          </div>
        </div>
        <div className="wheel-side">
          <h3>Vòng quay lộc</h3>
          <button className="btn gold" disabled={!info.can || busy.current} onClick={() => void go()}>
            {info.can ? 'Quay ngay' : 'Hôm nay đã quay, mai quay tiếp nhé'}
          </button>
          <p className="wheel-odds">
            Mỗi ngày 1 lượt miễn phí. Tỉ lệ: {info.segs.map((seg) => `${seg.label} ${seg.pct}%`).join(', ')}. Lộc đã vào túi ngay khi vòng dừng.
          </p>
        </div>
      </div>
      {won ? (
        <Modal
          onClose={() => {
            setWon(null);
            s.setView('hall');
          }}
        >
          <div className="big">
            <Icon name="gift" />
          </div>
          <h3>{won.rare ? 'Đại cát đại lợi!' : 'Chúc mừng bạn!'}</h3>
          <p>
            {won.rare ? 'Bạn quay trúng đồ quý:' : 'Vòng quay lộc tặng bạn:'} <b>{won.label}</b>
            <br />
            Quà đã vào tài khoản của bạn.
          </p>
          <button
            className="btn gold"
            onClick={() => {
              setWon(null);
              s.setView('hall');
            }}
          >
            Tiếp tục tu tập
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

// ---- Xỉ quẻ ------------------------------------------------------------------

export type QueCard = { rank: string; name: string; text: string; advice: string };
type QueDraw = { state: TempleState; que: QueCard; already: boolean; gained: number };

export function QueCardView({ q }: { q: QueCard }) {
  return (
    <div className="que-card">
      <span className="que-rank">{q.rank}</span>
      <h3>{q.name}</h3>
      <p>{q.text}</p>
      <p className="que-advice">
        <b>Lời nhắc hôm nay:</b> {q.advice}
      </p>
    </div>
  );
}

// Mỗi ngày một quẻ: gieo rồi thì mở lại vẫn xem được quẻ hôm nay, nên modal tự chia
// hai nhánh — chưa có quẻ thì mời gieo, có rồi thì chỉ đọc.
export function QueModal({ s, onClose }: { s: Store; onClose: () => void }) {
  const [que, setQue] = useState<QueCard | null>(null);
  const [shaking, setShaking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void get<{ que: QueCard | null }>('/draws/que')
      .then((r) => setQue(r.que))
      .catch(() => null)
      .finally(() => setLoaded(true));
  }, []);

  const cast = async () => {
    setShaking(true);
    Sound.chime();
    await new Promise((r) => window.setTimeout(r, 1200));
    try {
      const r = await post<QueDraw>('/draws/que');
      setQue(r.que);
      s.apply({ state: r.state, gained: r.already ? 0 : r.gained });
      Sound.success();
      petalShower(14);
    } catch (e) {
      s.toast((e as Error).message);
    } finally {
      setShaking(false);
    }
  };

  if (!loaded) return <Modal onClose={onClose} />;

  return (
    <Modal onClose={onClose}>
      {que ? (
        <>
          <h3>Quẻ hôm nay</h3>
          <QueCardView q={que} />
          <p className="muted">Mỗi ngày gieo một quẻ, ngày mai quay lại nhé.</p>
          <button className="btn gold" onClick={onClose}>
            Nam mô A Di Đà Phật
          </button>
        </>
      ) : (
        <>
          <div className={`big que-tube${shaking ? ' shake-tube' : ''}`}>
            <Icon name="story" />
          </div>
          <h3>Gieo quẻ đầu ngày</h3>
          <p>Thành tâm niệm một câu Phật hiệu rồi gieo. Mỗi ngày chỉ gieo một quẻ, quẻ là lời nhắc tu tập chứ không phải lời tiên đoán.</p>
          <button className="btn gold" disabled={shaking} onClick={() => void cast()}>
            Gieo quẻ
          </button>
          <button className="btn ghost" onClick={onClose}>
            Để sau
          </button>
        </>
      )}
    </Modal>
  );
}
