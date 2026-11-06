// Vài lựa chọn của máy này (âm thanh, bài nhạc, hiện tên…) sống trong localStorage chứ
// không phải trên server: đổi máy là mất, và đó là đúng ý — chúng là tuỳ ý của trình
// duyệt, không phải hồ sơ tu tập.
//
// Tách ra khỏi api.js vì api.js là mock của bản cũ (localStorage + AI peers) và đã bị
// thay bằng server thật; audio.js chỉ cần mỗi cái bọc localStorage này.
const PREFIX = 'chuaxoa:';

export const local = {
  get: (k, d = null) => {
    try {
      const v = localStorage.getItem(PREFIX + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set: (k, v) => {
    try {
      v === null ? localStorage.removeItem(PREFIX + k) : localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch {}
  },
};
