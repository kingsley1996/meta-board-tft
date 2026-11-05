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
import { Sound } from '@/vendor/temple/js/audio.js';
import { BeadsView } from '@/vendor/temple/js/beads.js';
import { showGardenTrees, showPlants } from '@/vendor/temple/js/chores.js';
import { injectIcons } from '@/vendor/temple/js/icons.js';
import { local } from '@/vendor/temple/js/prefs.js';
import { preloadFigures } from '@/vendor/temple/js/statues.js';
import { World } from '@/vendor/temple/js/world.js';
import type { RemotePlayer } from './room';
import { ABBOT, tellersOf } from './stories';

export type TempleItem = { id: string; name: string; type?: string; description?: string; price_sen?: number; price_ngoc?: number; unlock_level?: number; data?: Record<string, unknown> };

export const ITEMS: Record<string, TempleItem> = Object.fromEntries((meta.items as TempleItem[]).map((i) => [i.id, i]));

export type Sect = { id: string; name: string; color: string; icon: string; desc: string; bonusText: string; titles: string[] };

export const SECTS = meta.sects as Record<string, Sect>;

// main.js:434 thay emoji trong meta bằng icon SVG cùng tên (`ic('sect-' + id)`), nên
// HUD vẽ <Icon name={`sect-${id}`}/> chứ không in ra field icon của meta.
export const sectOf = (id: string): Sect => SECTS[id] ?? Object.values(SECTS)[0];

// "Nhiều chùa / nhiều server" đã cắt theo đề bài, nên id chùa là hằng số chứ không phải
// lựa chọn của máy khách — máy khách gửi id lạ thì cũng chỉ vào được một chánh điện.
export const TEMPLE = (meta.temples.find((t) => t.id === 'nhattru') ?? meta.temples[0]) as {
  id: string;
  name: string;
  npc?: number;
  theme: { statues?: { kind: string }[]; view?: string; fog?: string; size?: number[] };
};

// Tượng lớn ngoài trời dựng theo khung cảnh, còn lại lấy từ danh sách tượng của chánh
// điện (main.js:1140-1141) — thiếu một kind là thiếu một pho tượng trong cảnh.
const VIEW_STATUES: Record<string, string[]> = { fansipan: ['amida', 'quanam'], sontra: ['quanam'] };
const statueKinds = (t: typeof TEMPLE) => [...(t.theme.statues ?? []).map((s) => s.kind), ...(VIEW_STATUES[t.theme.view ?? ''] ?? [])];

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

export type EngineCtx = { seated: boolean; canSit: boolean; canTalk: boolean; teller: number | null; door?: 'in' | 'out' | null; outside: boolean; cable?: 'riding' | 'near' | null };

export type EngineHandlers = {
  onProgress: (pct: number, step: string) => void;
  onReady: () => void;
  onBowDone: () => void;
  onContext: (ctx: EngineCtx) => void;
  onToast: (html: string) => void;
  onNpc: (kind: 'abbot' | 'hermit' | 'teller', index?: number) => void;
  onPlayerTap: (id: number) => void;
  onMerit: () => void;
  onBead: () => void;
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
  warmUp: (maxMs?: number) => Promise<void>;
  start: () => void;
  stop: () => void;
  resize: () => void;
  applyRoom: (players: RemotePlayer[], myId: number) => void;
  netState: () => { x: number; z: number; y: number; r: number; seat: number; a: number };
  sit: (cu?: unknown) => unknown;
  stand: () => void;
  walkToSeat: () => boolean;
  setBowing: (on: boolean, immediate?: boolean) => void;
  showMo: (on: boolean) => void;
  strikeMo: () => void;
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
  temple: { setStele: (rows: unknown[], subtitle?: string) => void; setMerit: (rows: unknown[]) => void; addIncense: () => void; brightenCandles: () => void; offerFlowers: () => void };
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

type BeadsSlice = {
  init: () => void;
  setSkin: (data?: Record<string, unknown>) => void;
  layout: () => void;
  advance: () => void;
  resize: () => void;
  start: () => void;
  stop: () => void;
};

export type GardenPlant = { id: number; item: string; owner: string; mine: boolean; x: number; z: number; fruits: number; per_pick: number; ripe: boolean; at: number; next_at: string | null };

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
  beads: BeadsSlice | null = null;
  private ambience = 0;
  private readonly onResize = () => this.world?.resize();

  constructor(private readonly h: EngineHandlers) {}

  attach(scene: HTMLCanvasElement, joy: HTMLElement, beadsCanvas: HTMLCanvasElement): void {
    injectIcons();
    const world = new World(scene, joy, ITEMS) as unknown as WorldSlice;
    world.onBow = () => this.h.onBowDone();
    world.onContext = (ctx) => this.h.onContext(ctx);
    world.onToast = (html) => this.h.onToast(html);
    world.onTalk = () => this.h.onNpc('abbot');
    world.onHermit = () => this.h.onNpc('hermit');
    world.onTell = (i) => this.h.onNpc('teller', i);
    world.onPlayerTap = (id) => this.h.onPlayerTap(id);
    // Bia công đức mở trễ một nhịp: cú chạm vừa rồi mà đóng sheet ngay thì người chơi
    // tưởng bấm không ăn (main.js:1183).
    world.onMerit = () => window.setTimeout(() => this.h.onMerit(), 350);
    world.abbotInfo = () => ({ name: ABBOT });
    world.tellerInfo = (t) => tellersOf(t.id).map(({ name, role }) => ({ name, role }));
    world.beastName = (item) => ITEMS[item]?.name ?? 'Linh thú';
    // Không có khoá nào trong máy nghĩa là "bật", nên chỉ cần so khác false.
    world.setShowNpc(local.get('npc') !== false);
    world.setShowNames(local.get('names') !== false);
    this.world = world;
    this.beads = new BeadsView(beadsCanvas, () => this.h.onBead()) as unknown as BeadsSlice;
    window.addEventListener('resize', this.onResize);
  }

  // Đúng thứ tự main.js:1152-1215 chạy khi vào chùa: dựng cảnh → tải tượng → an vị →
  // warmUp → start → chuông. Bỏ một bước là cảnh hiện ra trắng một khung hình.
  async enter(me: EnginePerson): Promise<void> {
    const world = this.world;
    if (!world) return;
    this.h.onProgress(8, 'Thắp đèn chánh điện');
    await nextFrames(3);
    await preloadFigures(statueKinds(TEMPLE)).catch(() => null);
    this.h.onProgress(55, 'An vị tượng Phật');
    await nextFrames(1);
    world.enterTemple(TEMPLE, me);
    this.h.onProgress(80, 'Dọn sân chùa');
    await world.warmUp();
    world.start();
    await nextFrames(3);
    Sound.init();
    Sound.setActive(true);
    Sound.setTempleMusic(TEMPLE.id);
    Sound.bell(Sound.now + 0.2, 174, 0.3, 8);
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

  look(me: EnginePerson): void {
    this.world?.enterTemple(TEMPLE, me, true);
  }

  sit(): boolean {
    const world = this.world;
    if (!world) return false;
    if (world.seated) return true;
    if (world.sit()) {
      Sound.chime();
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

  showMo(on: boolean): void {
    this.world?.showMo(on);
  }

  strikeMo(): void {
    Sound.mok(Sound.now, 0.6);
    this.world?.strikeMo();
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
    Sound.chime();
    return AMBIENCES[this.ambience].label;
  }

  // Dâng lễ: hiệu ứng nằm trong cảnh 3D (temple.js:915-917), còn công đức thì máy chủ tính.
  offer(kind: 'huong_tram' | 'nen_sap' | 'hoa_dang' | 'bell'): void {
    const t = this.world?.temple;
    if (!t) return;
    if (kind === 'huong_tram') t.addIncense();
    else if (kind === 'nen_sap') t.brightenCandles();
    else if (kind === 'hoa_dang') t.offerFlowers();
    else Sound.bigBell();
  }

  stele(rows: { name: string; title: string; score: number }[]): void {
    this.world?.temple.setStele(rows, TEMPLE.name);
  }

  meritBoard(rows: { name: string }[]): void {
    this.world?.temple.setMerit(rows);
  }

  plants(rows: GardenPlant[]): void {
    if (this.world) showPlants(this.world, rows);
  }

  gardenTrees(count: number): void {
    if (this.world) showGardenTrees(this.world, count);
  }

  openBeads(beadsItemId: string | null | undefined): void {
    this.beads?.setSkin(beadsItemId ? ITEMS[beadsItemId]?.data : {});
    this.beads?.start();
  }

  closeBeads(): void {
    this.beads?.stop();
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
    window.removeEventListener('resize', this.onResize);
    this.beads?.stop();
    this.world?.stop();
    Sound.setActive(false);
  }
}

export { Sound, local, nextFrames };
