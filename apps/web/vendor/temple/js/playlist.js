// Nhạc nền của sảnh: băng lofi không lời.
//
// Bản cũ tự sinh ngũ cung + chiêng + tiếng nước/chim bằng Web Audio; đổi sang tệp nhạc
// thì bỏ luôn mô-típ chuông chùa, và người chơi tự chọn bài trong Cài đặt.
//
// Một deck là đủ: người nghe đổi bài bằng tay nên để nhạc nhỏ hẳn rồi bật lại còn hơn
// giữ hai deck crossfade.
//
// Tệp mp3 nằm trên Supabase Storage (bucket TFTIQ, đường temple/music) thay vì trong
// repo: 18MB âm thanh lọt vào git history là không rút lại được. Đường dẫn này là
// public-read và Supabase gửi kèm `access-control-allow-origin: *`, điều kiện để
// `crossOrigin` bên dưới nối được vào Web Audio.
const MUSIC_BASE = 'https://gdnxyxdtfllwstpfondh.storage.supabase.co/storage/v1/object/public/TFTIQ/temple/music';

// id là khoá lưu trong localStorage; file là tên mp3 trong bucket; url là trang gốc của
// bản nhạc để ghi credit ngay dưới bài đang phát.
/** @type {{id: string, title: string, artist: string, file: string, license: string, url: string}[]} */
export const TRACKS = [
  // Cả sáu bản đều của Holizna (holiznaCC0) và mỗi node gốc tự ghi "This music is
  // public domain CC0, so use it how you want!" — nên không cần hệ thống credit riêng,
  // chỉ nối url về node gốc để ai tò mò thì bấm vào nghe bản đầy đủ.
  { id: 'chills', title: 'Chills', artist: 'Holizna', file: 'chills.mp3', license: 'CC0', url: 'https://opengameart.org/content/chills' },
  { id: 'blue-skies', title: 'Blue Skies', artist: 'Holizna', file: 'blue-skies.mp3', license: 'CC0', url: 'https://opengameart.org/content/happy-lo-fi-lofi-collection' },
  { id: 'first-snow', title: 'First Snow', artist: 'Holizna', file: 'first-snow.mp3', license: 'CC0', url: 'https://opengameart.org/content/lo-fi-and-chill-collection' },
  { id: 'quiet-village', title: 'Quiet Village', artist: 'Holizna', file: 'quiet-village.mp3', license: 'CC0', url: 'https://opengameart.org/content/quiet-village-collection' },
  { id: 'small-towns', title: 'Small Towns', artist: 'Holizna', file: 'small-towns.mp3', license: 'CC0', url: 'https://opengameart.org/content/sad-lo-fi-lofi-collectioni' },
  { id: 'lost-in-your-eyes', title: 'Lost in Your Eyes', artist: 'Holizna', file: 'lost-in-your-eyes.mp3', license: 'CC0', url: 'https://opengameart.org/content/relaxing-instrumentals-collection' },
];

export const trackOf = (id) => TRACKS.find((t) => t.id === id) ?? null;

export class LofiPlayer {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(out);
    this.el = new Audio();
    // Thiếu cờ này thì createMediaElementSource bị coi là đọc nguồn chéo chưa được
    // phép và cho ra im lặng hoàn toàn, dù el.play() vẫn chạy.
    this.el.crossOrigin = 'anonymous';
    this.el.loop = true;
    ctx.createMediaElementSource(this.el).connect(this.gain);
    this.id = null;
    this.want = null;
    this.level = 1;
    this.blocked = false;
  }

  set(id) {
    this.want = id;
    if (!this.ctx) return;
    if (!id) return this.stop(0.6);
    if (id === this.id && !this.el.paused) return;
    this.fade(0.18, 0.0001);
    window.clearTimeout(this.timer);
    // Đợi mờ hết rồi mới đổi nguồn: đổi src giữa lúc đang nghe là một tiếng "cụp".
    this.timer = window.setTimeout(() => this.load(), 340);
  }

  load() {
    const t = trackOf(this.want);
    if (!t) return this.stop(0.4);
    const src = `${MUSIC_BASE}/${t.file}`;
    if (this.el.src !== src) this.el.src = src;
    this.id = this.want;
    const p = this.el.play();
    if (p) p.then(() => this.apply()).catch(() => (this.blocked = true));
  }

  // Trình duyệt chặn tự phát thì bài vẫn nằm trong `want`; cú chạm đầu tiên gọi lại
  // load() một lần nữa, không cần người chơi vào lại Cài đặt.
  resume() {
    if (this.blocked && this.want) this.load();
  }

  apply() {
    this.blocked = false;
    this.fade(0.9, this.level);
  }

  setLevel(v) {
    this.level = v;
    if (this.id && !this.el.paused) this.fade(0.4, v);
  }

  stop(fade = 0.6) {
    if (!this.ctx) return;
    this.fade(fade / 3, 0.0001);
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el.pause(), fade * 1000);
  }

  fade(constant, to) {
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(to, t, constant);
  }
}
