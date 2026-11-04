'use client';

import { useEffect, useRef } from 'react';
import meta from '@/vendor/temple/data/meta.json';
import content from '@/vendor/temple/data/content.json';
import { TEMPLE_MARKUP } from '@/vendor/temple/temple-markup';

declare global {
  interface Window {
    __GAME_THEME__?: string;
    __SANSA_STRESS__?: boolean;
    __STATIC_META__?: unknown;
    __STATIC_CONTENT__?: unknown;
  }
}

const TOKEN_KEY = 'chuaxoa:token';

// main.js gọi boot() ngay khi module được nạp, nên engine chỉ được import một
// lần trong đời trang; import lại sẽ chạy đè lên state đang sống.
let engineLoaded = false;

function isVisible(id: string) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden');
}

function goToTemple(lang: string) {
  const deadline = Date.now() + 20000;
  const timer = window.setInterval(() => {
    if (isVisible('welcome')) {
      window.clearInterval(timer);
      document.getElementById('btnEnter')?.click();
      addExitLink(lang);
    } else if (Date.now() > deadline) window.clearInterval(timer);
  }, 120);
}

// Nút về app, đội đúng lớp .out-btn của chùa nên nó là một chip của HUD chùa.
// .hud-temple có sẵn trong markup và không bị app viết lại nên gắn một lần là xong.
function addExitLink(lang: string) {
  const slot = document.querySelector('#temple-root .hud-temple');
  if (!slot) return;
  const link = document.createElement('a');
  link.className = 'out-btn';
  link.href = `/${lang}`;
  link.textContent = '← Về TFTIQ';
  slot.appendChild(link);
}

export function TempleHost({ lang }: { lang: string }) {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || engineLoaded) return;
    started.current = true;

    window.__GAME_THEME__ = 'temple';
    window.__SANSA_STRESS__ = true;
    window.__STATIC_META__ = meta;
    window.__STATIC_CONTENT__ = content;

    // Có token là boot() đi nhánh người cũ: bỏ màn nặn nhân vật, vào thẳng chánh điện.
    if (!localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, 'tok_temple_next');

    void import('@/vendor/temple/js/main.js').then(() => {
      engineLoaded = true;
      goToTemple(lang);
    });
  }, [lang]);

  return <div id="temple-dom" dangerouslySetInnerHTML={{ __html: TEMPLE_MARKUP }} />;
}
