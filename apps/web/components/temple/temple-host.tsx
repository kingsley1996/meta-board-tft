// Điểm mount của chánh điện React.
//
// Điểm mount của chánh điện React: HUD là temple-app.tsx, engine dựng qua
// components/temple/engine.ts, còn danh tính/phòng do apps/api sở hữu. Bản cũ nạp
// @/vendor/temple/js/main.js (HUD vẽ hết bằng innerHTML) đã bị cắt ở nhóm C — cần xem
// lại nguyên văn thì mở ở commit cca9c6d.
'use client';

import { useEffect } from 'react';
import { TempleApp } from './temple-app';

declare global {
  interface Window {
    __TEMPLE_WS__?: string;
  }
}

export function TempleHost({ lang }: { lang: string }) {
  useEffect(() => {
    // Rewrite của Next chỉ chuyển /api/*; cú pháp nâng cấp WebSocket thì không, nên
    // phòng chùa phải được nối thẳng tới apps/api thay vì đi qua trang.
    window.__TEMPLE_WS__ = process.env.NEXT_PUBLIC_TEMPLE_WS;
  }, []);

  return <TempleApp lang={lang} />;
}
