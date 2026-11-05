// Mảnh giao diện dùng chung của HUD chùa: biểu tượng, con số, khung sheet/modal.
//
// Tên lớp giữ nguyên như vendor/temple/css/app.css đang định nghĩa — bản gốc vẽ HUD
// bằng innerHTML với đúng mấy lớp này, nên React chỉ việc dựng lại cùng một cây DOM
// thì giao diện không lệch một pixel.
'use client';

import type { ReactNode } from 'react';
import type { Gain, TempleState } from './api';
import type { TempleEngine } from './engine';
import type { RemotePlayer, TempleRoom } from './room';

export type ViewKind = 'hall' | 'beads' | 'chant' | 'meditate' | 'wheel' | 'que';
export type SheetKind = 'rank' | 'community' | 'friends' | 'garden' | 'stele' | 'bag' | 'guide' | 'settings';

export type Look = { appearance?: Record<string, string>; equipped?: Record<string, string | null> };

export type Store = {
  lang: string;
  guest: boolean;
  state: TempleState | null;
  engine: TempleEngine | null;
  room: TempleRoom | null;
  me: number;
  online: number;
  connected: boolean;
  view: ViewKind;
  sheet: SheetKind | null;
  busy: boolean;
  bow: 'idle' | 'bowing' | 'stopping';
  ambience: string;
  setAmbience: (label: string) => void;
  setBow: (b: 'idle' | 'bowing' | 'stopping') => void;
  setView: (v: ViewKind) => void;
  setSheet: (s: SheetKind | null) => void;
  setCard: (id: number | null) => void;
  toast: (html: string, ms?: number) => void;
  refresh: () => Promise<void>;
  apply: (g: Gain) => void;
  practice: (body: Record<string, unknown>, opts?: { silent?: boolean }) => Promise<Gain | null>;
  players: () => RemotePlayer[];
  player: (id: number) => RemotePlayer | undefined;
  // Lớp DOM để đèn hoa đăng bay ngang màn hình; null khi HUD chưa dựng xong.
  lanternLayer: () => HTMLElement | null;
  openLanternForm: () => void;
  // Đổi ngoại trang phục xong phải vẽ lại avatar của chính mình và báo cho phòng, nếu
  // không thì mình thấy áo mới mà người khác vẫn thấy áo cũ.
  refreshLook: (profile: Look) => void;
};

export const fmt = (n: number) => Number(n || 0).toLocaleString('vi-VN');

export const esc = (t: unknown) =>
  String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function Icon({ name, cls = '' }: { name: string; cls?: string }) {
  return (
    <svg className={`i ${cls}`.trim()} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

// Chuỗi thông báo của HUD là HTML (có biểu tượng xen chữ), đúng như bản gốc; phần động
// trong đó phải đi qua esc() ở chỗ gọi.
export function Toast({ html }: { html: string }) {
  return <div className={`toast${html ? ' show' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Modal({ children, onClose }: { children?: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Sheet({
  title,
  tabs,
  tab,
  onTab,
  onClose,
  children,
}: {
  title: string;
  tabs?: { id: string; label: string }[];
  tab?: string;
  onTab?: (id: string) => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="sheet">
      <div className="sheet-card">
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="x" onClick={onClose} aria-label="Đóng">
            <Icon name="close" />
          </button>
        </div>
        {tabs?.length ? (
          <div className="tabs">
            {tabs.map((t) => (
              <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => onTab?.(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function ago(at: string | number): string {
  const t = typeof at === 'number' ? at : Date.parse(at);
  const d = Math.max(0, Date.now() - t);
  if (d < MIN) return 'vừa xong';
  if (d < HOUR) return `${Math.round(d / MIN)} phút trước`;
  if (d < DAY) return `${Math.round(d / HOUR)} giờ trước`;
  return `${Math.round(d / DAY)} ngày trước`;
}

export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}
