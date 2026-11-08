// Âm thanh của sảnh: tiếng chạm tự tổng hợp bằng Web Audio + băng lofi phát từ tệp mp3.
//
// Nhạc hiệu không còn lấy một tiếng chuông chùa — trước đây mỗi lần cầu may, ngồi thiền
// hay mở túi đồ đều đóng bằng một hồi bell tổng hợp từ các hoạ tần bất hoà của chuông đồng.
import { local } from './prefs.js';
import { LofiPlayer, TRACKS } from './playlist.js';

const rand = (a, b) => a + Math.random() * (b - a);

// Mỗi kiểu thời tiết là vài lớp nhiễu lọc băng, dựng khi bấm và bỏ khi tắt — không có
// tệp âm thanh nào mới, nên không phải xin thêm chỗ chứa trên bucket.
// g = đỉnh biên độ lớp, lfo/depth = nhịp gust (oscillator cộng thẳng vào gain của lớp).
const WX_LAYERS = {
  clear: [],
  rain: [
    { hp: 380, lp: 2300, g: 0.1 }, // thân cơn mưa
    { bp: 5200, q: 0.7, g: 0.032, rate: 1.07 }, // hạt đập trên ngói
    { bp: 320, q: 0.8, g: 0.05, lfo: 0.055, depth: 0.03, rate: 0.94 }, // gió cuốn qua cửa
  ],
  snow: [{ bp: 260, q: 0.7, g: 0.032, lfo: 0.042, depth: 0.02 }],
  blossom: [{ bp: 640, q: 0.5, g: 0.02, lfo: 0.07, depth: 0.014 }],
};

export const Sound = {
  ctx: null, master: null,
  enabled: local.get('sound', true),
  musicOn: local.get('music', true),
  // âm lượng 0..1: tổng, nhạc nền, hiệu ứng
  vol: { master: 0.9, sfx: 0.8, music: 0.9, ...local.get('vol', {}) },
  active: false, // đang ở trong sảnh hay ngoài sân — chỉ dùng để chỉnh nhạc nền
  trackId: local.get('track', TRACKS[0]?.id ?? null),
  // Thời tiết là tuỳ ý của trình duyệt nên nó ở localStorage, không phải trên server;
  // `wx.nodes` là các lớp đang phát, còn `weather` là cái người chơi đã chọn.
  weather: local.get('weather', 'clear'),
  wx: { id: null, nodes: [], gain: null },

  // 4 giây nhiễu hồng (Paul Kellet) cho mưa/gió: loop 0.3 s của `noise` sẽ lộ nhịp xào
  // xào khi phát liên tục, còn nhiễu hồng thì gần như không có chu kỳ tai nhận ra được.
  pinkBuffer() {
    const c = this.ctx, len = Math.floor(c.sampleRate * 4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.81671 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    return buf;
  },

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); this.music?.resume(); return; }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.vol.master : 0;
    this.master.connect(this.ctx.destination);
    this.bus = {};
    for (const k of ['sfx', 'music']) { this.bus[k] = this.ctx.createGain(); this.bus[k].gain.value = this.vol[k]; }
    this.bus.sfx.connect(this.master); this.bus.music.connect(this.master);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.3, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.ambBus = this.ctx.createGain();
    this.ambBus.gain.value = this.vol.sfx; // một slider "Hiệu ứng" lo cả tiếng trời
    this.ambBus.connect(this.master);
    this.pink = this.pinkBuffer();
    this.wx.gain = this.ctx.createGain();
    this.wx.gain.gain.value = 0.0001;
    this.wx.gain.connect(this.ambBus);
    this.music = new LofiPlayer(this.ctx, this.bus.music);
    // AudioContext và autoplay đều cần một cú chạm, mà mã này chạy lúc trang vừa mở.
    const wake = () => { if (this.ctx.state === 'suspended') void this.ctx.resume(); this.music.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.setTrack(this.trackId);
    this.setWeather(this.weather);
  },
  get now() { return this.ctx ? this.ctx.currentTime : 0; },
  setEnabled(on) {
    this.enabled = on; local.set('sound', on);
    if (this.master) this.master.gain.setTargetAtTime(on ? this.vol.master : 0, this.ctx.currentTime, 0.05);
    this.duckMusic();
  },
  setVolume(kind, v) {
    this.vol[kind] = v; local.set('vol', this.vol);
    if (!this.ctx) return;
    const node = kind === 'master' ? (this.enabled ? this.master : null) : this.bus[kind];
    node?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
    if (kind === 'sfx' && this.ambBus) this.ambBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  },
  setActive(on) { this.active = on; this.duckMusic(); },
  // Đổi bài là việc của người chơi, không phải của chùa: chọn xong là phát ngay, nhớ lại
  // cho lần sau.
  setTrack(id) {
    this.trackId = id; local.set('track', id);
    if (!this.ctx) return;
    if (!id || !this.musicOn) { this.music.stop(0.6); return; }
    this.music.set(id);
    this.duckMusic();
  },
  setMusicOn(on) { this.musicOn = on; local.set('music', on); this.setTrack(this.trackId); },
  setOutdoors(on) { if (this.outdoors !== on) { this.outdoors = on; this.duckMusic(); this.wxLevel(); } },
  duckMusic() { this.music?.setLevel(this.outdoors && this.active ? 1 : 0.6); }, // ngoài sân nghe rõ, trong sảnh lùi xuống
  // Trong sảnh thì mưa phải nghe qua tường: trần và tường thật không che được sóng âm
  // tổng hợp, nên giảm 45% là cách duy nhất.
  wxLevel() {
    if (!this.ctx || !this.wx.gain) return;
    const on = { rain: 1, snow: 0.8, blossom: 0.6 }[this.weather] ?? 0;
    this.wx.gain.gain.setTargetAtTime(on * (this.outdoors ? 1 : 0.45), this.ctx.currentTime, 0.45);
  },
  setWeather(id) {
    this.weather = id;
    local.set('weather', id);
    if (!this.ctx) return;
    if (this.wx.id === id) return this.wxLevel();
    for (const n of this.wx.nodes) {
      try { n.stop ? n.stop(this.ctx.currentTime + 0.3) : n.disconnect(); } catch {}
    }
    this.wx.nodes = [];
    this.wx.id = id;
    for (const L of WX_LAYERS[id] ?? []) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      src.playbackRate.value = L.rate ?? 1;
      let node = src;
      for (const [type, freq, q] of [['highpass', L.hp], ['lowpass', L.lp], ['bandpass', L.bp, L.q]]) {
        if (!freq) continue;
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        if (q) f.Q.value = q;
        node.connect(f);
        node = f;
      }
      const g = c.createGain();
      g.gain.value = L.g;
      node.connect(g).connect(this.wx.gain);
      if (L.lfo) {
        // gust: một oscillator rất chậm cộng thẳng vào gain, không có node điều biến nào
        const o = c.createOscillator(), lg = c.createGain();
        o.frequency.value = L.lfo;
        lg.gain.value = L.depth;
        o.connect(lg).connect(g.gain);
        o.start();
        this.wx.nodes.push(o);
      }
      src.start();
      this.wx.nodes.push(src, g, node);
    }
    this.wxLevel();
  },
  // Sấm: tiếng ồm dưới 50 Hz mới ra hơi "xa", tiếng nổ trắng chỉ thành một cái đập.
  thunder(delay = 0.8) {
    if (!this.ctx || this.wx.id !== 'rain') return;
    const c = this.ctx, t = this.now + delay;
    const n = c.createBufferSource(), lp = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.pink;
    n.playbackRate.value = 0.42;
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    n.connect(lp).connect(g).connect(this.ambBus);
    n.start(t);
    n.stop(t + 2.7);
    const o = c.createOscillator(), go = c.createGain();
    o.frequency.setValueAtTime(52, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    go.gain.setValueAtTime(0.0001, t);
    go.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
    go.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(go).connect(this.ambBus);
    o.start(t);
    o.stop(t + 2.3);
  },
  env(g, t, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  },
  // Phím mềm: ba hoạ tần hoà âm (quint, bát độ) qua lowpass, tắt nhanh — thứ tiếng chạm
  // hợp với băng lofi, không kéo đuôi như chuông.
  key(t = this.now, freq = 523, peak = 0.12, len = 0.4) {
    if (!this.ctx) return;
    const c = this.ctx;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.5;
    lp.connect(this.bus.sfx);
    [[1, 1], [1.5, 0.34], [2, 0.18]].forEach(([r, a]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle';
      o.frequency.value = freq * r * (1 + rand(-0.002, 0.002));
      this.env(g, t, peak * a, len);
      o.connect(g).connect(lp); o.start(t); o.stop(t + len + 0.05);
    });
  },
  click(t = this.now) {
    if (!this.ctx) return;
    const c = this.ctx;
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    n.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 6;
    this.env(g, t, 0.6, 0.04);
    n.connect(bp).connect(g).connect(this.bus.sfx); n.start(t); n.stop(t + 0.05);
    const o = c.createOscillator(), go = c.createGain();
    o.frequency.value = 1500;
    this.env(go, t, 0.15, 0.05);
    o.connect(go).connect(this.bus.sfx); o.start(t); o.stop(t + 0.06);
  },
  tap() { this.key(this.now, 523, 0.1, 0.3); },
  spark() { [0, 0.09, 0.18].forEach((d, i) => this.key(this.now + d, [523, 659, 784][i], 0.1, 0.34)); },
};
