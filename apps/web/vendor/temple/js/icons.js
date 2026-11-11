// Bộ icon SVG (sprite) thay cho emoji. Dùng: ic('lotus') → <svg class="i"><use href="#i-lotus"/></svg>
const P = {
  pray: '<path d="M12 3c-1 0-1.6.8-1.8 1.8L9 12l-3.5 3.2a1.4 1.4 0 000 2L8.5 20H12"/><path d="M12 3c1 0 1.6.8 1.8 1.8L15 12l3.5 3.2a1.4 1.4 0 010 2L15.5 20H12"/><path d="M12 5v15"/>',
  spark: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  warn: '<path d="M12 3l10 17H2L12 3z"/><path d="M12 10v4M12 17.2v.1"/>',
  megaphone: '<path d="M4 10v4h3l9 5V5L7 10H4z"/><path d="M7 14l1.5 5h2.5l-1-4.4M19 9.5a3 3 0 010 5"/>',
  wheel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 4v5.8M12 14.2V20M4 12h5.8M14.2 12H20M6.3 6.3l4.1 4.1M13.6 13.6l4.1 4.1M17.7 6.3l-4.1 4.1M10.4 13.6l-4.1 4.1"/>',
  drum: '<ellipse cx="12" cy="13" rx="8" ry="6"/><path d="M8 11.5c1.5-1 6.5-1 8 0"/><path d="M15 3l3 5"/><circle cx="18.5" cy="8.5" r="1.2"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2M9 9.5v.1M15 9.5v.1"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.5-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 004-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7.3" r="1.2"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8" r="1.5"/>',
  child: '<circle cx="12" cy="7" r="3.5"/><path d="M6 21c0-4 2.6-7 6-7s6 3 6 7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>',
  lotus: '<path d="M12 5c1.8 2 2.6 4.3 2.6 6.4S13.6 15.6 12 17c-1.6-1.4-2.6-3.5-2.6-5.6S10.2 7 12 5z"/><path d="M9.6 9.2C7.6 8.6 5.6 8.8 4 9.8c.6 3.8 3.6 6.8 8 7.2M14.4 9.2c2-.6 4-.4 5.6.6-.6 3.8-3.6 6.8-8 7.2"/><path d="M5 19.5h14"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  dice: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor"/>',
  compress: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
  // oẳn tù tì — ba đòn trong trận "Tỷ Thí"; tên khớp mã mà /api/temple trả về
  // (bua→rock, bao→paper, keo→scissors).
  rock: '<path d="M5.5 12.8A4.8 4.8 0 0110.3 8h3.4a4.8 4.8 0 014.8 4.8v2.4A4.8 4.8 0 0113.7 20h-3.4A4.8 4.8 0 015.5 15.2z"/><path d="M9 9.4v3M12 8.6v3.8M15 9.4v3"/><path d="M6 13.7c-1.8-.7-3.7.5-3.9 2.3-.2 1.6 1 3 2.6 3.3l2.6.4"/>',
  paper: '<path d="M18 11.5V6.8a2 2 0 10-4 0v4.2"/><path d="M14 10.5V4.8a2 2 0 10-4 0v6.2"/><path d="M10 11V6.8a2 2 0 10-4 0V13"/><path d="M18 8.8a2 2 0 114 0v6.4a7.8 7.8 0 01-7.8 7.8h-1.4c-2.7 0-4.4-.9-5.8-2.4l-3.4-3.7a2 2 0 012.9-2.8l1.7 1.9"/>',
  scissors: '<circle cx="6.2" cy="6.2" r="2.8"/><circle cx="6.2" cy="17.8" r="2.8"/><path d="M19.6 4L8.4 15.7M8.4 8.3l3.4 3.4M14.6 14.6l5 5.4"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M9.2 4.4v15.2M14.8 4.4v15.2M4.4 9.2h15.2M4.4 14.8h15.2"/>',
  // giao diện
  scroll: '<path d="M7 4h11a2 2 0 012 2v1H9"/><path d="M7 4a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V8"/><path d="M9 11h7M9 15h5"/>',
  bag: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 016 0v2"/>',
  shop: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a2.7 2.7 0 01-5.3 0 2.7 2.7 0 01-5.4 0A2.7 2.7 0 014 11V9z"/><path d="M5.5 13v7h13v-7M10 20v-4h4v4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M16 5.5a3 3 0 010 5.5M18 14c1.7.6 2.7 2.4 3 5"/>',
  // sảnh chờ "Tìm Bạn Chơi" — cùng hình với badge trên đầu nhân vật (textures.js:lobbyBadgeTex)
  gamepad: '<rect x="2.5" y="8" width="19" height="8" rx="4"/><path d="M7 10.2v3.6M5.2 12h3.6"/><circle cx="16" cy="11" r="1"/><circle cx="18.4" cy="13.4" r="1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4z"/><path d="M8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4"/><path d="M12 13v3M9 20h6M10 16h4l1 4H9l1-4z"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  book: '<path d="M4 5a2 2 0 012-2h5v17H6a2 2 0 00-2 2V5z"/><path d="M20 5a2 2 0 00-2-2h-5v17h5a2 2 0 012 2V5z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  menu: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6.5 8-6.5s7 2 8 6.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  // hai chiều của phiếu "đã chơi cùng" trong sảnh chờ. Xuống = cùng một nét quay
  // ngược trục, nên hai nút luôn cân nhau mà không phải vẽ hai bàn tay khác ý.
  up: '<path d="M7 10.5v9H4.6a1.1 1.1 0 01-1.1-1.1v-6.8A1.1 1.1 0 014.6 10.5H7z"/><path d="M7 10.5l3.9-7a2 2 0 012.1 2.6L12.2 9.6h6.4a2.1 2.1 0 012 2.6l-1.4 5.6a2.4 2.4 0 01-2.3 1.8H7"/>',
  down: '<g transform="translate(0 24) scale(1 -1)"><path d="M7 10.5v9H4.6a1.1 1.1 0 01-1.1-1.1v-6.8A1.1 1.1 0 014.6 10.5H7z"/><path d="M7 10.5l3.9-7a2 2 0 012.1 2.6L12.2 9.6h6.4a2.1 2.1 0 012 2.6l-1.4 5.6a2.4 2.4 0 01-2.3 1.8H7"/></g>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  fb: '<path d="M14 21v-8h3l.5-3.5H14V7.4c0-1 .4-1.7 1.8-1.7h1.8V2.6c-.5-.1-1.5-.2-2.6-.2-2.6 0-4.3 1.6-4.3 4.5v2.6H8V13h2.7v8z"/>',
  heart: '<path d="M12 20s-7.5-4.6-9-9.2C1.9 7.4 4 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.2 0 5.3 2.9 4.2 6.3-1.5 4.6-9 9.2-9 9.2z"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>',
  story: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h6"/>',
  online: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
  // hành trì
  bow: '<circle cx="15" cy="6" r="2.3"/><path d="M4 19h16"/><path d="M13.5 9.5c-2.5 1-4.5 3-5.5 5.5l-1 4"/><path d="M13.5 9.5l2.5 3.5-3 2.5 1 3.5"/><path d="M10 12.5L7 14"/>',
  beads: '<circle cx="12" cy="4.5" r="1.7"/><circle cx="17.2" cy="6.6" r="1.7"/><circle cx="19.4" cy="11.6" r="1.7"/><circle cx="17.2" cy="16.6" r="1.7"/><circle cx="6.8" cy="16.6" r="1.7"/><circle cx="4.6" cy="11.6" r="1.7"/><circle cx="6.8" cy="6.6" r="1.7"/><path d="M12 18.5v3M10.8 21.5h2.4"/><circle cx="12" cy="18.6" r="1.4"/>',
  pet: '<circle cx="5.5" cy="11" r="1.9"/><circle cx="9.5" cy="6.5" r="1.9"/><circle cx="14.5" cy="6.5" r="1.9"/><circle cx="18.5" cy="11" r="1.9"/><path d="M12 11.5c-2.6 0-5 2.8-5 5.2 0 1.8 1.4 2.8 3 2.5.8-.2 1.3-.4 2-.4s1.2.2 2 .4c1.6.3 3-.7 3-2.5 0-2.4-2.4-5.2-5-5.2z"/>',
  meditate: '<circle cx="12" cy="5" r="2.3"/><path d="M12 8.5v5"/><path d="M8 11c1.2 1.4 2.5 2.2 4 2.2s2.8-.8 4-2.2"/><path d="M4 19c2-2.5 5-3.2 8-3.2s6 .7 8 3.2c-3 .8-5.5 1-8 1s-5-.2-8-1z"/>',
  incense: '<path d="M8 21h8M6.5 17h11l-1.5 4h-8z"/><path d="M10 17V8M12 17V6M14 17V8"/><path d="M12 6c-1-1.5.5-2.5 0-4M10 8c-.8-1.2.4-2 0-3.2M14 8c-.8-1.2.4-2 0-3.2" opacity=".6"/>',
  candle: '<rect x="9" y="10" width="6" height="10" rx="1"/><path d="M12 10V8"/><path d="M12 3c1.5 1.8 1.5 3.4 0 4.8-1.5-1.4-1.5-3 0-4.8z"/><path d="M7 20h10"/>',
  flower: '<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8c0-2.5 2.7-3.4 2.7-.9M14.2 9c2.5 0 3.4 2.7.9 2.7M12 11.2c0 2.5-2.7 3.4-2.7.9M9.8 9c-2.5 0-3.4-2.7-.9-2.7"/><path d="M12 11.5V21M12 17c-2-2-4-2-5-1M12 15c2-2 4-2 5-1"/>',
  lantern: '<path d="M12 2v2M9 4h6"/><path d="M8 7c0-1.7 1.8-3 4-3s4 1.3 4 3v8c0 1.7-1.8 3-4 3s-4-1.3-4-3V7z"/><path d="M8 11h8M12 4v14M10 18v2h4v-2"/>',
  bell: '<path d="M12 3a1.5 1.5 0 011.5 1.5v.6A5.5 5.5 0 0117.5 10v4l1.8 2.5H4.7L6.5 14v-4a5.5 5.5 0 014-4.9v-.6A1.5 1.5 0 0112 3z"/><path d="M10 19a2 2 0 004 0"/>',
  offer: '<path d="M5 13h14l-1.5 7h-11z"/><path d="M8 13c0-3 1.8-5 4-5s4 2 4 5"/><path d="M12 8V3M10 5l2-2 2 2"/>',
  robe: '<path d="M8 3l4 3 4-3 4 4-3 3v11H7V10L4 7l4-4z"/><path d="M12 6l-3 15"/>',
  cushion: '<ellipse cx="12" cy="14" rx="9" ry="4"/><path d="M3 14v2c0 2.2 4 4 9 4s9-1.8 9-4v-2"/>',
  fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-3.6 3-5.3 3.6-9 1.8 1.2 2.9 3 3 5 1-1 1.6-2.4 1.6-4 2.9 2.1 4.8 5 4.8 8 0 3.4-2.5 6-6.5 6z"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11L6 3h4l2 5M15.5 11L18 3h-4l-2 5"/>',
  temple: '<path d="M3 10l9-6 9 6"/><path d="M2 10.5c3 0 4-1 4-1h12s1 1 4 1"/><path d="M5 10v9h14v-9"/><path d="M10 19v-5h4v5M3 19h18"/>',
  // tiền tệ (tô màu)
  sen: '<path d="M12 5c1.8 2 2.6 4.3 2.6 6.4S13.6 15.6 12 17c-1.6-1.4-2.6-3.5-2.6-5.6S10.2 7 12 5z" fill="#f2a5b8" stroke="#c4688a"/><path d="M12 17c-2.6.2-6-1.4-7.5-5.2 2.8-.2 5 .8 6.6 2.6M12 17c2.6.2 6-1.4 7.5-5.2-2.8-.2-5 .8-6.6 2.6" fill="#f6c3d0" stroke="#c4688a"/><path d="M6 18.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2" stroke="#4f8a4a"/>',
  ngoc: '<path d="M6 4h12l3 5-9 11L3 9l3-5z" fill="#8fd3e8" stroke="#3a8aa8"/><path d="M3 9h18M9 4l3 5 3-5M12 9v11" stroke="#3a8aa8" opacity=".7"/>',
  hex: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="#f2a5b8" stroke="#c4688a"/><path d="M12 7.2 16 9.5v4.6L12 16.4 8 14.1V9.5z" fill="#f6c3d0" stroke="#c4688a" opacity=".85"/>',
  // lối chơi (tô màu) — id phải khớp sects trong meta.json, HUD vẽ qua
  // <Icon name={`sect-${id}`}/>; thiếu một id là biểu tượng biến mất hẳn.
  'sect-reroll': '<path d="M20.5 12a8.5 8.5 0 01-8.5 8.5A8.5 8.5 0 015 13.5" fill="none" stroke="#c4688a"/><path d="M3.5 12A8.5 8.5 0 0112 3.5a8.5 8.5 0 017 3.7" fill="none" stroke="#c4688a"/><path d="M10.4 5.2 12 1.2 8 1z" fill="#f2a5b8" stroke="#c4688a"/><path d="M13.6 18.8 12 22.8 16 23z" fill="#f2a5b8" stroke="#c4688a"/>',
  'sect-fast8': '<path d="M13.4 2 4.8 13.9h4.7L8.2 22 19.2 9.4h-5z" fill="#a8d69a" stroke="#4f8a4a"/>',
  'sect-fast9': '<path d="M12 2.5c3 2.5 4.4 5.5 4.4 8.6L12 18.2l-4.4-7.1c0-3.1 1.4-6.1 4.4-8.6z" fill="#bfe0f5" stroke="#3f6f9a"/><circle cx="12" cy="9.6" r="1.7" fill="#fff" stroke="#3f6f9a"/><path d="M7.6 11.6 4.4 14.2l1.2 3.4 3-3.3M16.4 11.6l3.2 2.6-1.2 3.4-3-3.3" fill="#8ab8dc" stroke="#3f6f9a"/><path d="M12 18.6v3.2" stroke="#3f6f9a"/>',
  'sect-tempo': '<circle cx="12" cy="14.2" r="7" fill="#f6c9a4" stroke="#c0602e"/><path d="M12 14.2V9.6M10 2.8h4M12 2.8v4.4M19.6 7.6l1.6-1.6" stroke="#c0602e"/>',
  'sect-flex': '<path d="M12 3.5 20 8l-8 4.5L4 8z" fill="#d9c6f2" stroke="#8a5cc8"/><path d="M4 12.4 12 17l8-4.6M4 16.6 12 21.2l8-4.6" stroke="#8a5cc8"/>',
};

export function injectIcons() {
  if (document.getElementById('icon-sprite')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg id="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(P)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`).join('')}</svg>`;
  document.body.prepend(wrap.firstChild);
}

export const ic = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// biểu tượng vật phẩm
export const ITEM_ICON = { huong_tram: 'incense', nen_sap: 'candle', hoa_dang: 'flower' };
export const TYPE_ICON = { robe: 'robe', beads: 'beads', cushion: 'cushion', consumable: 'gift' };

// biểu cảm gửi trong chùa (mã gửi qua mạng → icon)
export const EMOTES = ['pray', 'hex', 'wheel', 'smile'];
const EMOTE_COLOR = { pray: '#ffd36b', hex: '#f2a5b8', wheel: '#ffd36b', smile: '#ffe9a8' };
// Vẽ một icon lên canvas 2D (dùng cho sprite 3D)
export function drawIcon(g, name, x, y, size, color = '#ffd36b', onload) {
  const body = P[name]; if (!body) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" color="${color}">${body.replace(/currentColor/g, color)}</svg>`;
  const img = new Image();
  img.onload = () => { g.drawImage(img, x, y, size, size); onload?.(); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
export const emoteColor = (e) => EMOTE_COLOR[e] || '#ffd36b';
