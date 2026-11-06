// Âm thanh của sảnh: tiếng chạm tự tổng hợp bằng Web Audio + băng lofi phát từ tệp mp3.
//
// Nhạc hiệu không còn lấy một tiếng chuông chùa — trước đây mỗi lần cầu may, ngồi thiền
// hay mở túi đồ đều đóng bằng một hồi bell tổng hợp từ các hoạ tần bất hoà của chuông đồng.
import { local } from './prefs.js';
import { LofiPlayer, TRACKS } from './playlist.js';

const rand = (a, b) => a + Math.random() * (b - a);

export const Sound = {
  ctx: null, master: null,
  enabled: local.get('sound', true),
  musicOn: local.get('music', true),
  // âm lượng 0..1: tổng, nhạc nền, hiệu ứng
  vol: { master: 0.9, sfx: 0.8, music: 0.9, ...local.get('vol', {}) },
  active: false, // đang ở trong sảnh hay ngoài sân — chỉ dùng để chỉnh nhạc nền
  trackId: local.get('track', TRACKS[0]?.id ?? null),

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
    this.music = new LofiPlayer(this.ctx, this.bus.music);
    // AudioContext và autoplay đều cần một cú chạm, mà mã này chạy lúc trang vừa mở.
    const wake = () => { if (this.ctx.state === 'suspended') void this.ctx.resume(); this.music.resume(); };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    this.setTrack(this.trackId);
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
  setOutdoors(on) { if (this.outdoors !== on) { this.outdoors = on; this.duckMusic(); } },
  duckMusic() { this.music?.setLevel(this.outdoors && this.active ? 1 : 0.6); }, // ngoài sân nghe rõ, trong sảnh lùi xuống
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
