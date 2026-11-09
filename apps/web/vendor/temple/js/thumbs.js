// Ảnh nhỏ 3D cho thẻ cửa hàng: dùng một renderer tạm, vẽ lần lượt, lưu ảnh lại, xong việc thì giải phóng WebGL.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeAvatar, animateAvatar, disposeAvatar, setSeated, beadMaterial } from './avatar.js';
import { lotusPad, lotusPadColor, makeLotusPetals } from './lotus.js';
import { cushionGeo, cushionMaterial, setCushionFabric } from './cushion.js';
import { beadTex } from './textures.js';
import { makePet } from './pets.js';

const SIZE = 144;
const cache = new Map();
const beadGeo = new THREE.SphereGeometry(1, 20, 14);

function robeScene(scene, cam, it, appearance) {
  const av = makeAvatar({ appearance, robe: it.data });
  av.meditating = true;
  animateAvatar(av, 0.05, 0, false);
  av.root.rotation.y = 0.45;
  scene.add(av.root);
  cam.position.set(0, 1.05, -3.1); cam.lookAt(0, 0.62, 0);
  return () => disposeAvatar(av);
}
function beadsScene(scene, cam, it) {
  const d = it.data;
  const mat = d.rank ? beadMaterial(d) : new THREE.MeshStandardMaterial({ map: beadTex(d), roughness: d.gloss ? 0.15 : 0.45 });
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 2, b = new THREE.Mesh(beadGeo, mat);
    b.position.set(Math.cos(t) * 0.8, Math.sin(t) * 0.8, 0); b.scale.setScalar(0.17);
    scene.add(b);
  }
  cam.position.set(0, 0, 3.6); cam.lookAt(0, 0, 0);
  return () => { if (!d.rank) mat.dispose(); };
}
function cushionScene(scene, cam, it) {
  const d = it.data, seat = cushionMaterial(d);
  setCushionFabric(seat, !d.lotus);
  scene.add(new THREE.Mesh(d.lotus ? lotusPad() : cushionGeo(), seat));
  let petals = null;
  if (d.lotus) {
    seat.color.copy(lotusPadColor(d));
    petals = makeLotusPetals(d.petal || d.color);
    petals.material.metalness = (d.metal || 0) * 0.4;
    petals.position.y = -0.095;
    scene.add(petals);
  }
  cam.position.set(0, 1.25, 2.1); cam.lookAt(0, 0.08, 0);
  return () => { seat.dispose(); petals?.material.dispose(); };
}
// mũ, pháp khí, mây: nhân vật mang món đồ, khung hình bám theo món đó
function gearScene(scene, cam, it, appearance) {
  // Áo khoác thì bắt buộc vẽ trên một hình KHÔNG có choàng sẵn: gear.js bỏ món trùng
  // phần tướng đã mặc (hai khối cùng transform là z-fighting), nên lấy đúng appearance
  // của người đang chơi là chủ nhân Hiệp Sĩ Dơi sẽ thấy một ô trống. luffy_g5 là hình
  // nền của hồ sơ ngày đầu và không có mảnh lưng nào.
  const ap = it.type === 'cape' ? { ...(appearance || {}), hero: 'luffy_g5' } : appearance;
  const av = makeAvatar({ appearance: ap, robe: { color: '#8f6a3e', sash: '#6b2416' }, [it.type]: it.data });
  setSeated(av, it.type !== 'cloud');
  animateAvatar(av, 0.05, 0, false);
  // Choàng là khối SAU lưng (mặt trước của mọi hình nằm ở -z, xem phù hiệu dơi), nên
  // riêng món này máy ảnh sang +z để quay lưng về phía người xem; nhịp xoay 0,45 giữ
  // nguyên, vì nó chỉ nghiêng hình ra một bên chứ không lật mặt.
  av.root.rotation.y = it.type === 'staff' ? -0.25 : 0.45;
  scene.add(av.root);
  if (it.type === 'hat') { cam.position.set(0, 2.1, -3.6); cam.lookAt(0, 1.42, 0); }
  else if (it.type === 'staff') { cam.position.set(-0.3, 1.5, -5.6); cam.lookAt(0.3, 1.2, 0); }
  // Khung áo khoác: ống kính trục Z ở +3,9, tâm 1,00. Một điểm lọt khung khi
  // |y - 1,00| <= (3,9 - z') * tan(16°) = (3,9 - z') * 0,28675, z' là độ sâu sau nhịp
  // xoay 0,45 (x' = x cos + z sin, z' = -x sin + z cos):
  //   - tai nạ cao nhất 2,045: bản xa máy hơn rơi xuống z' +0,029, sâu 3,871, khung cho
  //     1,110, cần 1,045 (lề 0,065) -> cả người không bị cắt ngang cằm như khung bám sát
  //     tấm vải, mà vẫn là hình MỘT nhân vật, không phải một mảnh vải lạ trong ô;
  //   - vành sáng chân 0,20 ở z' +0,86 (gần máy nhất): sâu 3,04, khung cho 0,872, cần
  //     0,80 (lề 0,072) -> gấu choàng và ngọn chấm cưa 0,19 nằm trọn trong ô;
  //   - bề ngang lớn nhất của vải 0,51 + mũi 0,085 so với 0,872 được phép.
  // Hình chiếm 1,925/2,22 = 87% chiều cao ô, ngang heroScene (82%).
  else if (it.type === 'cape') { cam.position.set(0, 1.0, 3.9); cam.lookAt(0, 1.0, 0); }
  else { cam.position.set(0, 1.2, -3.8); cam.lookAt(0, 0.55, 0); }
  return () => disposeAvatar(av);
}
function petScene(scene, cam, it) {
  const pet = makePet(it.data, true);
  if (!pet) return () => {};
  pet.anim(1.2, false);
  pet.root.rotation.y = 0.75;
  scene.add(pet.root);
  if (pet.fly) { cam.position.set(1.2, 1.5, 3.7); cam.lookAt(-0.3, 0.1, -0.2); } else { cam.position.set(0.6, 1.0, 2.3); cam.lookAt(0, 0.68, 0); }
  return () => pet.dispose();
}
// Ô chọn nhân vật: mười hai hình đầu đã có ô sẵn trong tấm sprite 4x3 của HUD gốc, hình
// thứ 13 trở đi không có ô nào trong tấm đó. Thay vì cắt ghép ảnh khác, vẽ thẳng khối mà
// chánh điện đang dựng, nên ảnh nhỏ và nhân vật thật không bao giờ lệch nhau.
function heroScene(scene, cam, it, appearance) {
  const av = makeAvatar({ appearance: { ...(appearance || {}), hero: it.data.hero }, robe: { color: '#8f6a3e', sash: '#6b2416' } });
  av.meditating = true;
  animateAvatar(av, 0.05, 0, false);
  av.root.rotation.y = 0.45;
  scene.add(av.root);
  // Khung tự tính, KHÔNG mượn robeScene: robeScene cắt từ y 1.05 xuống dưới vì nó lo thân
  // áo, còn nhân vật thì đỉnh sừng ở y 2.386 = 0.17(root ngồi) + 0.30(upper) + 0.98(đầu)
  // + 0.936(chóp cone: tâm 0.6765 + 0.33*sin trục 0.814, trừ nhịp chúc đầu -0.03 của thiền)
  // - nên bản cũ cắt mất nửa trên đầu. Ng thấp nhất là đáy vạt ở y 0.12, vành sáng chân
  // 0.20 (disc 0.03 + root 0.17, bán kính 0.86).
  // Máy ảnh ngang tầm tâm khung (không chúc xuống) ở (0, 1.26, -4.8): một điểm ở độ sâu
  // (4.8 + z) chỉ còn lọt khi |y - 1.26| <= (4.8 + z) * tan(16°) = (4.8 + z) * 0.28675.
  // Đỉnh sừng gần ống kính nhất sau nhịp xoay 0.45 của thân là z = -0.501, cần 1.126,
  // khung cho 1.233 (lệ 0.11); mép vành gần nhất z = -0.86 cần 1.06, khung cho 1.128.
  // Thân hình chiếm 82% chiều cao ô, ngang các ô sprite gốc.
  // CÙNG máy ảnh này cũng vừa leesin_chibi (không sừng nên thấp hơn, và từ vòng này hình
  // đó không còn rồng quanh người - vật rộng nhất của nó lại là mái tóc): ngọn gai cao nhất
  // ở y 2.266, z -0.025 sau nhịp xoay 0.45 của thân, cần 1.006, khung cho 1.369; điểm tóc
  // sát biên nhất vẫn còn lề 0.336. Bề ngang lớn nhất |x| 0.738 so với 1.344 được phép.
  // Giáp tay nằm quanh ngực/bụng ở |x| < 0.5 nên không phải tính. Không có gì bị cắt nên
  // khung không phải tính lại cho từng hình - nó tính theo điểm cao nhất và thấp nhất của
  // hình CAO NHẤT, mọi hình khác tự lọt.
  // batman_chibi nằm trong bất biến đó mà không cần thêm nhánh nào: chóp tai nạ ở thế giới
  // y 2,045 (< 2,266 của Võ Sư Mù), gấu áo choàng ở y 0,30 (> 0,12 đáy vạt), rộng nhất là
  // thân choàng |x| 0,53 (< 0,738). Vải choàng ở SAU lưng nên z dương, tức rơi vào cửa sổ
  // CHIẾU RỘNG nhất của phép phối cảnh chứ không phải cửa hẹp gần ống kính.
  cam.position.set(0, 1.26, -4.8);
  cam.lookAt(0, 1.26, 0);
  return () => disposeAvatar(av);
}
const SCENES = { pet: petScene, robe: robeScene, beads: beadsScene, cushion: cushionScene, hat: gearScene, staff: gearScene, cloud: gearScene, cape: gearScene, hero: heroScene };

let queue = [], running = false;
async function drain(appearance) {
  running = true;
  let renderer = null, pmrem, env;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    pmrem = new THREE.PMREMGenerator(renderer);
    env = pmrem.fromScene(new RoomEnvironment(), 0.04);
    while (queue.length) {
      const { it, res } = queue.shift();
      if (!cache.has(it.id)) {
        const scene = new THREE.Scene();
        scene.environment = env.texture; scene.environmentIntensity = 0.55;
        scene.add(new THREE.HemisphereLight('#fff1d8', '#4a2a14', 0.9));
        const key = new THREE.DirectionalLight('#ffe9c8', 2.2); key.position.set(2, 4, -3); scene.add(key);
        const fill = new THREE.DirectionalLight('#ffe9c8', 1.4); fill.position.set(-2, 3, 4); scene.add(fill);
        const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
        const done = SCENES[it.type](scene, cam, it, appearance);
        renderer.render(scene, cam);
        cache.set(it.id, renderer.domElement.toDataURL('image/png'));
        done();
      }
      res(cache.get(it.id) ?? null);
      await new Promise((r) => setTimeout(r)); // nhường khung hình giữa các món
    }
  } catch {
    // Không có WebGL (hoặc trình duyệt từ chối context): trả null để thẻ tự giữ biểu
    // tượng phẳng, không để lời hứa nào treo.
    for (const { res } of queue) res(null);
    queue = [];
  }
  env?.dispose(); pmrem?.dispose();
  renderer?.dispose(); renderer?.forceContextLoss?.();
  running = false;
}

// Cửa vào cho HUD React. Bản gốc quét DOM lấy [data-thumb] rồi tự gán <img>
// (paintThumbs); React không có gốc DOM để quét, nên mỗi lời xin ảnh là một chỗ trong
// hàng đợi và drain giao ảnh đúng một lần cho từng món, cache theo id cả phiên.
export function itemThumb(it, appearance) {
  if (!it || !SCENES[it.type]) return Promise.resolve(null);
  if (cache.has(it.id)) return Promise.resolve(cache.get(it.id));
  return new Promise((res) => {
    queue.push({ it, res });
    if (!running) drain(appearance);
  });
}

// Cùng hàng đợi nói trên, chỉ khác chỗ khoá cache là "hero:<id>" để ảnh nhân vật không
// bao giờ đụng vào ô của một món đồ cùng tên.
export function heroThumb(heroId, appearance) {
  return itemThumb({ id: `hero:${heroId}`, type: 'hero', data: { hero: heroId } }, appearance);
}
