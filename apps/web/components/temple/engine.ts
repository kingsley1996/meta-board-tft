// Chỗ nối giữa HUD React và engine 3D vendored.
//
// Engine (world.js · temple.js · avatar.js · statues.js …) giữ nguyên từng dòng: chính
// nó tạo ra cảnh chùa "giống y như bản gốc", viết lại là mất. File này chỉ làm hai
// việc — dựng World theo đúng thứ tự main.js vẫn dựng, và bọc đúng những lời gọi HUD
// cần thành hàm có kiểu để phần React không phải với tay vào object không kiểu.
// main.js cùng bộ HUD vendored đã bị cắt ở nhóm C; cần đối chiếu dòng nào thì xem
// `git show cca9c6d:apps/web/vendor/temple/js/main.js`.
'use client';

import * as THREE from 'three';
import meta from '@/vendor/temple/data/meta.json';
import { HERO_LIST } from '@/vendor/temple/js/avatar.js';
import { Sound } from '@/vendor/temple/js/audio.js';
import { TRACKS } from '@/vendor/temple/js/playlist.js';
import { injectIcons } from '@/vendor/temple/js/icons.js';
import { local } from '@/vendor/temple/js/prefs.js';
import { World } from '@/vendor/temple/js/world.js';
import type { RemotePlayer } from './room';
import { ABBOT, tellersOf } from './stories';

export type TempleItem = { id: string; name: string; type?: string; description?: string; price_sen?: number; price_ngoc?: number; unlock_level?: number; data?: Record<string, unknown> };

export const ITEMS: Record<string, TempleItem> = Object.fromEntries((meta.items as TempleItem[]).map((i) => [i.id, i]));

// Ba field này vào màn hình (people.tsx:39 · hall.tsx:548); bonus/titles của bản gốc bị
// bỏ vì không một dòng code nào đọc — xem §6 của docs/SHRINE-CONTENT-MAP.md.
export type Sect = { id: string; name: string; color: string; icon: string; desc: string };

export const SECTS = meta.sects as Record<string, Sect>;

// main.js:434 thay emoji trong meta bằng icon SVG cùng tên (`ic('sect-' + id)`), nên
// HUD vẽ <Icon name={`sect-${id}`}/> chứ không in ra field icon của meta.
export const sectOf = (id: string): Sect => SECTS[id] ?? Object.values(SECTS)[0];

export type Hero = { id: string; name: string; title: string };

// 12 nhận vật engine nặn được, theo đúng thứ tự tấm ảnh tham khảo 4 cột × 3 hàng mà
// .hc-thumb cắt (app.css:1170). Toạ độ lấy từ renderHeroGrid của HUD gốc (main.js:468).
export const HEROES = HERO_LIST as Hero[];
export const HERO_SPRITE: Record<string, string> = {
  luffy_g5: '0% 0%',
  naruto_sage: '33.33% 0%',
  zoro: '66.66% 0%',
  sasuke: '100% 0%',
  sanji: '0% 50%',
  kakashi: '33.33% 50%',
  law: '66.66% 50%',
  itachi: '100% 50%',
  ace: '0% 100%',
  shanks: '33.33% 100%',
  minato: '66.66% 100%',
  kaido: '100% 100%',
};

// "Nhiều chùa / nhiều server" đã cắt theo đề bài, nên id chùa là hằng số chứ không phải
// lựa chọn của máy khách — máy khách gửi id lạ thì cũng chỉ vào được một chánh điện.
export const TEMPLE = (meta.temples.find((t) => t.id === 'nhattru') ?? meta.temples[0]) as {
  id: string;
  name: string;
  npc?: number;
  theme: { statues?: { kind: string }[]; view?: string; fog?: string; size?: number[] };
};

export const AMBIENCES = [
  { id: 'day', label: '☀️ Ban ngày', bg: null as string | null, fog: null as string | null, exp: 1.15 },
  { id: 'sunset', label: '🌇 Hoàng hôn', bg: '#4a2518', fog: '#5c2d1c', exp: 1.02 },
  { id: 'night', label: '🏮 Đêm hoa đăng', bg: '#0c1022', fog: '#11162e', exp: 0.85 },
  { id: 'dawn', label: '🌅 Bình minh', bg: '#382a3e', fog: '#4c3850', exp: 1.08 },
];

export type EnginePerson = {
  id: number;
  name: string;
  sect: string;
  title: string;
  honor: string;
  level: number;
  appearance: Record<string, unknown>;
  equipped: Record<string, unknown>;
};

export type EngineCtx = { seated: boolean; canSit: boolean; canTalk: boolean; teller: number | null; door?: 'in' | 'out' | null; outside: boolean };

export type EngineHandlers = {
  onProgress: (pct: number, step: string) => void;
  onReady: () => void;
  onBowDone: () => void;
  onContext: (ctx: EngineCtx) => void;
  onToast: (html: string) => void;
  onNpc: (kind: 'abbot' | 'hermit' | 'teller', index?: number) => void;
  onPlayerTap: (id: number) => void;
  onMerit: () => void;
};

// Chỉ khai báo phần world.js mà HUD thật sự chạm tới. world.js là JS không có kiểu,
// nên ép qua interface này: vừa giữ được autocomplete, vừa không phải `any` rải rác
// khắp các component React.
type WorldSlice = {
  scene: THREE.Scene;
  renderer: { toneMappingExposure: number };
  player: { root: { position: THREE.Vector3 }; bowT: number; meditating: boolean } | null;
  od: { hw: number; hd: number } | null;
  outside: boolean;
  seated: boolean;
  moving: boolean;
  walkTarget: unknown;
  enterTemple: (temple: unknown, me: unknown, keepPos?: boolean) => void;
  setPlayerLook: (me: unknown) => void;
  warmUp: (maxMs?: number) => Promise<void>;
  start: () => void;
  stop: () => void;
  applyRoom: (players: RemotePlayer[], myId: number) => void;
  netState: () => { x: number; z: number; y: number; r: number; seat: number; a: number };
  sit: (cu?: unknown) => unknown;
  stand: () => void;
  walkToSeat: () => boolean;
  setBowing: (on: boolean, immediate?: boolean) => void;
  liftView: (px: number, sideX?: number) => void;
  zoomBy: (k: number) => void;
  teleportToZone: (zone?: string) => void;
  goThroughDoor: () => void;
  setShowNpc: (on: boolean) => void;
  setShowNames: (on: boolean) => void;
  showEmote: (id: number, e: string) => void;
  bowingCount: () => number;
  groundAt: (x: number, z: number, fromY?: number) => number | null;
  isInside: (x: number, z: number) => boolean;
  walkable: (x: number, z: number, curY?: number) => number | null;
  emitContext: () => void;
  temple: { setStele: (rows: unknown[], subtitle?: string) => void; setMerit: (rows: unknown[], subtitle?: string) => void; addIncense: () => void; brightenCandles: () => void; offerFlowers: () => void };
  onBow?: () => void;
  onContext?: (ctx: EngineCtx) => void;
  onToast?: (html: string) => void;
  onTalk?: () => void;
  onHermit?: () => void;
  onTell?: (index: number) => void;
  onPlayerTap?: (id: number) => void;
  onMerit?: () => void;
  abbotInfo?: (t: unknown) => { name: string };
  tellerInfo?: (t: { id: string }) => { name: string; role: string }[];
  beastName?: (item: string) => string;
};

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let left = n;
    const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

// World dựng WebGLRenderer ngay ở dòng đầu, nên máy tính tắt tăng tốc đồ hoạ là
// attach ném giữa hiệu ứng chờ. Thử một canvas vô hình trước để trang còn nói được
// lý do thay vì treo.
export function hasWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  } catch {
    return false;
  }
}

export class TempleEngine {
  world: WorldSlice | null = null;
  private ambience = 0;

  constructor(private readonly h: EngineHandlers) {}

  attach(scene: HTMLCanvasElement, joy: HTMLElement): void {
    injectIcons();
    const world = new World(scene, joy, ITEMS) as unknown as WorldSlice;
    world.onBow = () => this.h.onBowDone();
    world.onContext = (ctx) => this.h.onContext(ctx);
    world.onToast = (html) => this.h.onToast(html);
    world.onTalk = () => this.h.onNpc('abbot');
    world.onHermit = () => this.h.onNpc('hermit');
    world.onTell = (i) => this.h.onNpc('teller', i);
    world.onPlayerTap = (id) => this.h.onPlayerTap(id);
    // Bảng tri ân mở trễ một nhịp: cú chạm vừa rồi mà đóng sheet ngay thì người chơi
    // tưởng bấm không ăn (main.js:1183).
    world.onMerit = () => window.setTimeout(() => this.h.onMerit(), 350);
    world.abbotInfo = () => ({ name: ABBOT });
    world.tellerInfo = (t) => tellersOf(t.id).map(({ name, role }) => ({ name, role }));
    world.beastName = (item) => ITEMS[item]?.name ?? 'Linh thú';
    // Không có khoá nào trong máy nghĩa là "bật", nên chỉ cần so khác false.
    world.setShowNpc(local.get('npc') !== false);
    world.setShowNames(local.get('names') !== false);
    this.world = world;
  }

  // Đúng thứ tự main.js:1152-1215 chạy khi vào chùa: dựng cảnh → an vị → warmUp →
  // start → chuông. Bỏ một bước là cảnh hiện ra trắng một khung hình.
  async enter(me: EnginePerson): Promise<void> {
    const world = this.world;
    if (!world) return;
    this.h.onProgress(10, 'Dựng sảnh đền');
    // buildTemple là một nhịp blocking dài của main thread; nhả ba khung hình ở đây để
    // hiệu ứng chờ kịp khởi động chuyển động trước khi cảnh bị dựng đè lên.
    await nextFrames(3);
    world.enterTemple(TEMPLE, me);
    this.h.onProgress(72, 'Dọn sân đền');
    await nextFrames(1);
    await world.warmUp();
    world.start();
    await nextFrames(3);
    Sound.init();
    Sound.setActive(true);
    this.setAmbience(0);
    this.h.onReady();
  }

  get seated(): boolean {
    return !!this.world?.seated;
  }

  get outside(): boolean {
    return !!this.world?.outside;
  }

  get bowingCount(): number {
    return this.world?.bowingCount() ?? 0;
  }

  netState(): ReturnType<WorldSlice['netState']> | null {
    return this.world?.netState() ?? null;
  }

  myPosition(): { x: number; z: number; y: number } | null {
    const p = this.world?.player?.root.position;
    return p ? { x: p.x, y: p.y, z: p.z } : null;
  }

  applyRoom(players: RemotePlayer[], myId: number): void {
    this.world?.applyRoom(players, myId);
  }

  // Đổi trang bị thì thay người, không thay cả ngôi chùa. enterTemple dựng lại
  // buildTemple, đặt seat = null và bắt người đang ngồi đứng dậy (world.js:148-149),
  // nên một cú mặc áo làm mất cả bồ đoàn đang ngồi; setPlayerLook chỉ dựng lại avatar
  // và tự sơn lại cushion tại chỗ ngồi (world.js:510).
  look(me: EnginePerson): void {
    this.world?.setPlayerLook(me);
  }

  sit(): boolean {
    const world = this.world;
    if (!world) return false;
    if (world.seated) return true;
    if (world.sit()) {
      Sound.tap();
      return true;
    }
    return false;
  }

  // Ngồi xuống rồi mới hành trì được; chưa ngồi thì tự đi tới bồ đoàn trống gần nhất và
  // báo lại để HUD chờ (main.js:1875-1885).
  walkToSeat(): boolean {
    const world = this.world;
    if (!world) return false;
    if (world.seated || world.sit()) return true;
    return world.walkToSeat();
  }

  stand(): void {
    this.world?.stand();
  }

  setBowing(on: boolean, immediate = false): void {
    const world = this.world;
    if (!world?.player) return;
    world.player.meditating = false;
    world.setBowing(on, immediate);
  }

  liftView(px: number, sideX = 0): void {
    this.world?.liftView(px, sideX);
  }

  setMeditating(on: boolean): void {
    if (this.world) this.world.player && (this.world.player.meditating = on);
  }

  zoom(by: number): void {
    this.world?.zoomBy(by);
  }

  goHome(): void {
    this.world?.teleportToZone('hall');
  }

  goOutside(): void {
    this.world?.goThroughDoor();
  }

  emote(id: number, e: string): void {
    this.world?.showEmote(id, e);
  }

  setShowNpc(on: boolean): void {
    local.set('npc', on);
    this.world?.setShowNpc(on);
  }

  setShowNames(on: boolean): void {
    local.set('names', on);
    this.world?.setShowNames(on);
  }

  setAmbience(index: number): void {
    const world = this.world;
    this.ambience = ((index % AMBIENCES.length) + AMBIENCES.length) % AMBIENCES.length;
    const a = AMBIENCES[this.ambience];
    if (!world?.scene) return;
    const fallback = TEMPLE.theme.fog ?? '#241509';
    world.scene.background = new THREE.Color(a.bg ?? fallback);
    if (world.scene.fog) world.scene.fog.color.set(a.fog ?? fallback);
    world.renderer.toneMappingExposure = a.exp;
  }

  nextAmbience(): string {
    this.setAmbience(this.ambience + 1);
    Sound.tap();
    return AMBIENCES[this.ambience].label;
  }

  // Dâng bùa: hiệu ứng nằm trong cảnh 3D (temple.js:915-917), còn điểm thì máy chủ tính.
  // Chuông (bell) đã bỏ nên ba món dưới đây là toàn bộ những gì cảnh phản ứng được.
  offer(kind: 'huong_tram' | 'nen_sap' | 'hoa_dang'): void {
    const t = this.world?.temple;
    if (!t) return;
    if (kind === 'huong_tram') t.addIncense();
    else if (kind === 'nen_sap') t.brightenCandles();
    else t.offerFlowers();
  }

  // Hai tấm bia khắc tên ngay trong chánh điện: trái = Điểm May Mắn hành trì, phải =
  // Tinh Hoa đóng góp. Sảnh gọi cả hai lúc dựng cảnh, không chờ ai mở sheet.
  rankPlaque(rows: { name: string; title: string; score: number }[]): void {
    this.world?.temple.setStele(rows, TEMPLE.name);
  }

  meritPlaque(rows: { name: string; title: string; score: number }[]): void {
    this.world?.temple.setMerit(rows, TEMPLE.name);
  }

  start(): void {
    this.world?.start();
    Sound.setActive(true);
  }

  pause(): void {
    this.world?.stop();
    Sound.setActive(false);
  }

  dispose(): void {
    this.world?.stop();
    Sound.setActive(false);
  }
}

export { Sound, local, nextFrames, TRACKS };
