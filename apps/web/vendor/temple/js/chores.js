// Vườn cây ngoài sân chùa: cây đã trồng ở lại sân, mọi người cùng thấy.
import * as THREE from 'three';

const MAX_TREES = 120;
// Cây công quả theo đường xoắn ốc ở sân trước, chừa lối đi giữa. Vị trí tính theo số thứ tự nên ai cũng thấy giống nhau.
// Gộp nhiều hình thành một để mỗi loại cây chỉ tốn vài lượt vẽ
function merged(list) {
  const ps = [], ns = [];
  for (const g of list) { const n = g.toNonIndexed(); ps.push(...n.attributes.position.array); ns.push(...n.attributes.normal.array); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(ps, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
  return out;
}
const ball = (r, x, y, z, sy = 1) => new THREE.IcosahedronGeometry(r, 1).scale(1, sy, 1).translate(x, y, z);
const PLANT_PARTS = {
  bode: { top: 5.6, parts: () => [
    [merged([new THREE.CylinderGeometry(0.28, 0.5, 3.2, 7).translate(0, 1.6, 0)]), '#74624e'],
    [merged([ball(2.1, 0, 4, 0, 0.72), ball(1.5, 1.5, 3.5, 0.5, 0.7), ball(1.5, -1.4, 3.6, -0.6, 0.7), ball(1.3, 0.2, 3.4, 1.5, 0.7)]), '#4f8f3f'],
  ] },
  sala: { top: 7.8, parts: () => [
    [merged([new THREE.CylinderGeometry(0.17, 0.3, 5.2, 7).translate(0, 2.6, 0)]), '#6d5a45'],
    [merged([ball(1.2, 0, 6.6, 0, 1.05), ball(1.15, 0.85, 5.6, 0.3, 0.8), ball(1.15, -0.85, 5.8, -0.3, 0.8), ball(1, 0.1, 5.3, -0.9, 0.8), ball(1, -0.1, 5.4, 0.95, 0.8)]), '#4c8a42'],
    // chùm hoa sala nhỏ màu vàng trắng
    [merged(Array.from({ length: 44 }, (_, i) => { const a = i * 2.39996, y = 4.9 + (i % 11) * 0.27, r = 1.95 - Math.abs(y - 5.8) * 0.62; return new THREE.IcosahedronGeometry(0.075, 0).translate(Math.sin(a) * r, y, Math.cos(a) * r); })), '#f7f0c4'],
  ] },
  sen: { top: 1.6, parts: () => [
    [merged([new THREE.CylinderGeometry(1.05, 0.8, 0.55, 12).translate(0, 0.28, 0)]), '#9a9488'],
    [merged([new THREE.CylinderGeometry(0.92, 0.92, 0.04, 12).translate(0, 0.54, 0)]), '#6f9fb0'],
    [merged([new THREE.CylinderGeometry(0.34, 0.34, 0.03, 9).translate(0.45, 0.59, 0.2), new THREE.CylinderGeometry(0.3, 0.3, 0.03, 9).translate(-0.4, 0.59, 0.32), new THREE.CylinderGeometry(0.28, 0.28, 0.03, 9).translate(-0.1, 0.59, -0.5), new THREE.CylinderGeometry(0.018, 0.018, 0.6, 5).translate(0, 0.82, 0)]), '#4f9150'],
    [merged([...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return ball(0.14, Math.sin(a) * 0.17, 1.14, Math.cos(a) * 0.17, 1.7); }), ball(0.1, 0, 1.2, 0, 1.2)]), '#ee9dbb'],
  ] },
};
const PLANT_KIND = { cay_bode: 'bode', cay_sala: 'sala', cay_sen: 'sen' };
const WEEK_MS = 7 * 864e5;
// Vẽ cây Phật đã mua. Cây toạ độ trong điện hoặc ngoài địa hình thì không hiện.
export function showPlants(world, plants) {
  const od = world.od;
  (world.plantMeshes || []).forEach((o) => { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); });
  world.plantMeshes = [];
  if (!od) return;
  const by = {};
  for (const p of plants) {
    if (world.isInside(p.x, p.z) || !PLANT_KIND[p.item]) continue;
    let y = null;
    for (const from of [0, 2, -2, 4, -4, 8]) { y = world.groundAt(p.x, p.z, from); if (y !== null) break; }
    if (y !== null) (by[PLANT_KIND[p.item]] ||= []).push({ ...p, y });
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), s = new THREE.Vector3();
  const add = (geo, color, list, place, opts = {}) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }), list.length);
    list.forEach((p, i) => { mesh.setMatrixAt(i, place(p)); });
    mesh.castShadow = !opts.emissive; od.group.add(mesh); world.plantMeshes.push(mesh);
  };
  for (const [kind, list] of Object.entries(by)) {
    const def = PLANT_PARTS[kind];
    const grow = (p) => 0.55 + 0.45 * Math.min(1, (Date.now() - p.at) / WEEK_MS);
    const place = (p) => m.compose(pos.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.id * 1.7), s.setScalar(grow(p)));
    def.parts().forEach(([geo, color]) => add(geo, color, list, place));
    const ripe = list.filter((p) => p.ripe);
    // quả chín lơ lửng trên ngọn cho dễ thấy
    if (ripe.length) add(new THREE.IcosahedronGeometry(0.2, 1), '#f0c64a', ripe, (p) => m.compose(pos.set(p.x, p.y + def.top * grow(p), p.z), q.identity(), s.setScalar(1)), { emissive: '#a87a10', emissiveIntensity: 0.9 });
  }
}

export function showGardenTrees(world, count) {
  const od = world.od;
  if (!od) return;
  const old = world.choreTrees;
  if (old) { old.forEach((o) => { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); }); world.choreTrees = null; }
  const spots = [], cz = (od.hd || 12) + 20;
  const n = Math.min(count, MAX_TREES);
  for (let i = 0; i < 600 && spots.length < n; i++) {
    const a = i * 2.39996, r = 5 + 1.75 * Math.sqrt(i) * 2.2, x = Math.sin(a) * r, z = cz + Math.cos(a) * r;
    if (Math.abs(x) < 3.5 || world.isInside(x, z)) continue;
    let g = null;
    for (const from of [0, 2, -2, 4, -4, 8]) { g = world.groundAt(x, z, from); if (g !== null) break; }
    if (g === null) continue;
    spots.push([x, g, z, 0.75 + (i * 0.37) % 0.6, i]);
  }
  if (!spots.length) return;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.15, 1.4, 6).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 1 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.85, 1).translate(0, 1.95, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  const GREEN = ['#5d9a45', '#4c8a3e', '#6ea84e', '#3f7d3b'];
  spots.forEach(([x, y, z, k, i], idx) => {
    m.compose(p.set(x, y, z), q.setFromAxisAngle(up, i), s.setScalar(k));
    trunk.setMatrixAt(idx, m); crown.setMatrixAt(idx, m);
    crown.setColorAt(idx, c.set(GREEN[idx % 4]));
  });
  trunk.castShadow = crown.castShadow = true;
  od.group.add(trunk, crown);
  world.choreTrees = [trunk, crown];
}
