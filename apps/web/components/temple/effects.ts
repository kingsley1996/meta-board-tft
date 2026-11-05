// Hai hiệu ứng ăn mừng của HUD, giữ nguyên từ share.js (bản gốc) — share.js bị cắt
// theo nhóm C nhưng hai hàm này không liên quan gì tới chia sẻ, chỉ là cánh sen rơi
// và dòng "+N công đức" bay lên.
'use client';

export function petalShower(n = 36, chars = ['🌸', '🌸', '✨']): void {
  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:46;overflow:hidden';
  document.body.appendChild(layer);
  for (let i = 0; i < n; i += 1) {
    const p = document.createElement('span');
    const size = 14 + Math.random() * 16;
    const dur = 2.8 + Math.random() * 2.2;
    p.textContent = chars[(Math.random() * chars.length) | 0];
    p.style.cssText = `position:absolute;left:${Math.random() * 100}vw;top:-40px;font-size:${size}px;opacity:.95;transition:transform ${dur}s cubic-bezier(.3,.6,.5,1),opacity ${dur}s;`;
    layer.appendChild(p);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        p.style.transform = `translate(${(Math.random() - 0.5) * 30}vw, ${105 + Math.random() * 10}vh) rotate(${Math.random() * 720 - 360}deg)`;
        p.style.opacity = '0.2';
      }),
    );
  }
  window.setTimeout(() => layer.remove(), 5500);
}

export function floater(layer: HTMLElement | null, html: string): void {
  if (!layer) return;
  const f = document.createElement('div');
  f.className = 'floater';
  f.innerHTML = html;
  f.style.left = `${40 + Math.random() * 20}%`;
  layer.appendChild(f);
  window.setTimeout(() => f.remove(), 1500);
}

// Đèn nguyện bay ngang màn hình: mỗi ngọn một nhịp trễ, sống 16,5 giây rồi tự gỡ.
export function launchLantern(layer: HTMLElement | null, name: string, text: string, delay = 0): void {
  if (!layer) return;
  window.setTimeout(() => {
    const d = document.createElement('div');
    d.className = 'lantern';
    d.style.left = `${5 + Math.random() * 55}%`;
    d.innerHTML = `<div class="l"><svg class="i"><use href="#i-lantern"/></svg></div><p><b></b>: </p>`;
    const b = d.querySelector('b');
    const p = d.querySelector('p');
    if (b && p) {
      b.textContent = name;
      p.append(text);
    }
    layer.appendChild(d);
    window.setTimeout(() => d.remove(), 16500);
  }, delay);
}
