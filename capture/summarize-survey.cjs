const s = require('../capture/source/home/survey.json');
for (const key of ['space', 'type', 'radius', 'shadow', 'maxWidth', 'text', 'fill']) {
  console.log(key + ':', JSON.stringify(s[key].slice(0, 12)));
}
console.log('breakpoints:', s.breakpoints.join(', '));
console.log('inlineSvg:', s.inlineSvg);
const assets = {};
for (const a of s.assets) assets[a.kind] = (assets[a.kind] || 0) + 1;
console.log('assets by kind:', JSON.stringify(assets));
console.log('sample asset hosts:', [...new Set(s.assets.map((a) => { try { return new URL(a.url).host; } catch { return 'inline'; } }))].join(', '));
