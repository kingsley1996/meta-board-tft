// Hai màn nằm đè lên cảnh đền: thiền định · vòng quay Hex, cùng modal quẻ đội hình.
//
// Cả ba giữ đúng cây DOM và đúng lớp CSS của bản gốc (meditate/wheel-view trong app.css)
// nên giao diện không đổi; thứ đổi là chỗ quyết định điểm — mọi con số đều do apps/api
// trả về, máy khách không tự tính nữa.
'use client';

import { useEffect, useRef, useState } from 'react';
import { get, post, type Gain, type TempleState } from './api';
import { Sound } from './engine';
import { luckyShower } from './effects';
import { Icon, Modal, fmt, type Store } from './ui';
import { QUOTES } from './stories';

// ---- Thiền định --------------------------------------------------------------

const DURATIONS = [5, 10, 20, 30, 0];

export function MeditateView({ s }: { s: Store }) {
  const [min, setMin] = useState(5);
  const [start, setStart] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [done, setDone] = useState<{ minutes: number; gained: number; complete: boolean } | null>(null);
  const target = useRef(min);
  const stopping = useRef(false);

  // Trang tải lại giữa lúc đang ngồi thiền thì đồng hồ phải chạy tiếp từ giờ máy
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
    en?.setMeditating(false);
    const r = await s.practice({ type: 'meditate_end' }, { silent: true });
    const minutes = Number(r?.extra?.minutes ?? 0);
    stopping.current = false;
    setStart(null);
    if (minutes > 0) setDone({ minutes, gained: r?.gained ?? 0, complete });
    else s.toast('Thiền chưa đủ 1 phút nên chưa được tính điểm');
  };

  useEffect(() => {
    if (start === null || done) return;
    if ((target.current && secs >= target.current * 60) || secs >= 3600) void stop(true);
  }, [secs, start, done]);

  const begin = async () => {
    if (!s.engine?.walkToSeat()) {
      s.toast('Hãy đến gần một bệ ngồi trống để bắt đầu');
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
          <p className="muted">{QUOTES[Math.floor(secs / 30) % QUOTES.length]}</p>
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
          <h3>{done.complete ? 'Tròn nhịp' : 'Dừng sớm'}</h3>
          <p>
            Bạn đã thiền {done.minutes} phút
            <br />+{fmt(done.gained)} Điểm May Mắn
          </p>
          <p className="muted">{QUOTES[done.minutes % QUOTES.length]}</p>
          <button
            className="btn gold"
            onClick={() => {
              setDone(null);
              s.setView('hall');
            }}
          >
            Vào queue <Icon name="spark" />
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

// ---- Vòng quay Hex -----------------------------------------------------------

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
        luckyShower(r.result.rare ? 70 : 40, ['💠', '✨', '⭐', '🏮']);
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
          <h3>Vòng quay Hex</h3>
          <button className="btn gold" disabled={!info.can || busy.current} onClick={() => void go()}>
            {info.can ? 'Quay ngay' : 'Hôm nay đã quay, mai quay tiếp nhé'}
          </button>
          <p className="wheel-odds">
            Mỗi ngày 1 lượt miễn phí. Tỉ lệ: {info.segs.map((seg) => `${seg.label} ${seg.pct}%`).join(', ')}. Quà đã vào túi ngay khi vòng dừng.
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
            {won.rare ? 'Bạn quay trúng đồ quý:' : 'Vòng quay tặng bạn:'} <b>{won.label}</b>
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
            Về sảnh
          </button>
        </Modal>
      ) : null}
    </section>
  );
}

// ---- Quẻ đội hình ------------------------------------------------------------

export type QueCard = { rank: string; name: string; text: string; advice: string };
type QueDraw = { state: TempleState; que: QueCard; already: boolean; gained: number; level_ups?: Gain['level_ups'] };

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
    await new Promise((r) => window.setTimeout(r, 1200));
    try {
      const r = await post<QueDraw>('/draws/que');
      setQue(r.que);
      s.apply({ state: r.state, gained: r.already ? 0 : r.gained, level_ups: r.level_ups });
      luckyShower(14);
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
            Đã rõ
          </button>
        </>
      ) : (
        <>
          <div className={`big que-tube${shaking ? ' shake-tube' : ''}`}>
            <Icon name="story" />
          </div>
          <h3>Gieo quẻ đầu ngày</h3>
          <p>Nghĩ tới đội hình mình định chơi rồi gieo. Mỗi ngày chỉ một quẻ, và quẻ là gợi ý cho hôm nay chứ không phải lời đoán kết quả.</p>
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
