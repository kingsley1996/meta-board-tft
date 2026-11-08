// Thời tiết của sảnh — một trục *đứng cạnh* trục giờ (AMBIENCES trong engine.ts), không
// thay thế nó: "Đêm hoa đăng + Mưa rào" là màu đêm của preset giờ rửa thêm bằng xám của
// mưa, rồi nhân lên một lần.
//
// Không một dòng nào của world.js · temple.js · exterior.js bị sửa. Module này chỉ đọc
// những gì cảnh đã dựng sẵn:
//   · vòm trời shader `sky` (exterior.js:454-488) — lấy đúng bộ uniform mà makeEnv đã
//     đổ vào đó (màu đỉnh trời/đường chân trời, mây, sương phối cảnh, gió cho lá cây);
//   · hai đèn của chánh điện (temple.js:42 hemi, temple.js:45 sun) — trời mưa thì nắng
//     phải yếu đi, nếu không rêu sàn vẫn sáng như trưa;
//   · footprint của sảnh (world.od = temple.outdoor: hw, hd, H, groundY).
//
// Vì sao mưa không rơi trên đầu người ngồi: vòm trời vẽ với depthTest:false còn tường và
// mái là mesh thật có depth write, nên hạt nằm ngoài khối sảnh bị tường che và hạt nằm
// trong khối bị mái che — người trong sảnh chỉ thấy mưa qua cửa lớn và cửa sổ, đúng như
// ngoài sân thật.
import * as THREE from 'three';
import { softDot } from './textures.js';

// sunK/fogK/cloudK/windK là hệ số nhân trên giá trị gốc của MOODS, exp nhân vào
// toneMappingExposure. `wash` là màu đã có sẵn trong repo, trộn vào trời gốc với tỷ lệ
// washK — không đặt màu mới: xám bão = #0c1022 của preset Đêm hoa đăng (engine.ts:69),
// xám tuyết = #cfdde6 chân trời ao (exterior.js:335), hồng hoa = #d97a95 cánh sen mặc
// định của bồ đoàn (temple.js:567).
export const WEATHERS = [
  { id: 'clear', label: '☀️ Trời quang', exp: 1.0, wash: null, washK: 0, fogK: 1, cloudK: 0, windK: 1, sunK: 1, kind: null, sound: null },
  { id: 'rain', label: '🌧️ Mưa rào', exp: 0.86, wash: '#0c1022', washK: 0.62, fogK: 2.6, cloudK: 0.34, windK: 2.3, sunK: 0.34, kind: 'rain', sound: 'rain' },
  { id: 'snow', label: '❄️ Mưa tuyết', exp: 0.95, wash: '#cfdde6', washK: 0.6, fogK: 3.1, cloudK: 0.26, windK: 1.15, sunK: 0.6, kind: 'snow', sound: 'wind' },
  { id: 'blossom', label: '🌸 Hoa bay', exp: 1.0, wash: '#d97a95', washK: 0.22, fogK: 1.5, cloudK: 0.1, windK: 1.6, sunK: 0.9, kind: 'bloom', sound: 'breeze' },
];

export const weatherOf = (id) => WEATHERS.find((w) => w.id === id) ?? WEATHERS[0];

// Số hạt lấy theo chất lượng cảnh (world.quality), cấp thấp bằng nửa. `box` là nửa cạnh
// của ô hạt, tính từ chân người chơi: phải lớn hơn half-width của sảnh (hw = 14) thêm
// một vạt rộng, nếu không gần như mọi giọt đều rơi đúng khối sảnh — bị mái che và người
// trong sảnh không còn thấy gì qua cửa sổ.
const FIELDS = {
  rain: { n: 2400, low: 700, box: 28, top: 19, speed: 17, len: 0.5, sway: 0 },
  snow: { n: 1500, low: 480, box: 26, top: 17, speed: 1.35, len: 0, sway: 0.55 },
  bloom: { n: 900, low: 280, box: 24, top: 15, speed: 1.0, len: 0, sway: 1.2 },
};

const rand = (a, b) => a + Math.random() * (b - a);

// Vòm trời là mesh tên 'sky' với material tên 'ExtSky'; tìm theo tên để không phải thêm
// một field mới vào buildTemple.
function skyUniforms(scene) {
  let U = null;
  scene.traverse((o) => {
    if (U) return;
    const m = o.material;
    if (m && m.name === 'ExtSky') U = m.uniforms;
  });
  return U;
}

// Một DirectionalLight + một HemisphereLight là toàn bộ ánh sáng trời của sảnh
// (temple.js:42 và :45); đèn bàn thờ là SpotLight nên không bị đụng.
function skyLights(scene) {
  const out = {};
  scene.traverse((o) => {
    if (!o.isDirectionalLight && !o.isHemisphereLight) return;
    const key = o.isDirectionalLight ? 'sun' : 'hemi';
    if (out[key]) return;
    out[key] = o;
    o.userData.baseI = o.intensity;
  });
  return out;
}

export function createWeather(scene, opts = {}) {
  const od = opts.od;
  if (!od) return null; // chùa hang (theme.wall === 'rock') không có sân ngoài
  const hw = od.hw + 0.5, hd = od.hd + 0.5;
  const roofY = (od.H ?? 9) + 1.1;
  const groundY = od.groundY ?? 0;
  const U = skyUniforms(scene);
  const lights = skyLights(scene);
  const base = U
    ? {
        zen: U.uZenith.value.clone(),
        hor: U.uHorizon.value.clone(),
        gnd: U.uGround.value.clone(),
        sun: U.uSunCol.value.clone(),
        amb: U.uAmb.value.clone(),
        cloud: U.uCloud.value,
        fogDen: U.uFogDen.value,
      }
    : null;

  const g = new THREE.Group();
  g.name = 'weather';
  g.frustumCulled = false;
  scene.add(g);

  const dotTex = softDot();
  // ba trường dựng lười: người chơi bấm tới kiểu nào mới dựng kiểu đó, boot không phải
  // chịu thêm một buffer nào.
  const fields = {};

  // Màu tạm dùng chung, để mỗi khung hình không cấp phát Color mới.
  const cZen = new THREE.Color(), cHor = new THREE.Color(), cTmp = new THREE.Color(), cWash = new THREE.Color();
  let time = null; // preset giờ đang bật: { bg, fog, exp }
  let fogBase = null; // màu sương nội thất mà preset giờ đã chọn, để thời tiết rửa đè lên
  let wx = weatherOf('clear');
  let flash = 0, boltIn = rand(9, 20);
  let running = false, raf = 0, last = 0, t = 0;

  function build(kind) {
    const F = FIELDS[kind];
    const n = opts.quality === 'low' ? F.low : F.n;
    if (kind === 'rain') {
      // Mỗi giọt là một đoạn thẳng đứng: LineSegments = 1 lượt vẽ cho cả cơn mưa.
      const pos = new Float32Array(n * 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({ color: '#b9c8d8', transparent: true, opacity: 0.34, depthWrite: false });
      const seg = new THREE.LineSegments(geo, mat);
      seg.frustumCulled = false;
      const p = [];
      for (let i = 0; i < n; i++) p.push(drop(F));
      g.add(seg);
      return { kind, F, n, mesh: seg, pos: p };
    }
    const pos = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: dotTex,
      color: kind === 'bloom' ? '#eaa9bf' : '#f2f6ff',
      size: kind === 'bloom' ? 0.2 : 0.12,
      transparent: true,
      opacity: kind === 'bloom' ? 0.9 : 0.82,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    const p = [];
    for (let i = 0; i < n; i++) p.push(drop(F, true));
    g.add(pts);
    return { kind, F, n, mesh: pts, pos: p };
  }

  // Vị trí khởi sinh: trong khối box quanh máy quay, và nếu cột rơi rơi trúng footprint
  // sảnh thì chết ở mái thay vì đi xuyên trần.
  function drop(F, phase = false) {
    const d = {
      x: rand(-F.box, F.box),
      y: rand(0, F.top),
      z: rand(-F.box, F.box),
      v: F.speed * rand(0.86, 1.16),
      ph: phase ? rand(0, 6.28) : 0,
      s: rand(0.7, 1.3),
    };
    return d;
  }

  // Mái che: giọt nào rơi đúng khối sảnh thì chết ở nóc mái chứ không xuyên trần. Hạt
  // sinh lại ở ngay trên đỉnh ô nên mưa là một tấm rèm đều, không phải cột thưa.
  function killY(field) {
    const inside = Math.abs(field.x + g.position.x) < hw && Math.abs(field.z + g.position.z) < hd;
    return inside ? roofY : groundY;
  }

  function step(dt) {
    t += dt;
    for (const kind in fields) {
      if (!fields[kind].mesh.visible) continue;
      const f = fields[kind], F = f.F, arr = f.mesh.geometry.getAttribute('position');
      for (let i = 0; i < f.n; i++) {
        const d = f.pos[i];
        d.y -= d.v * dt;
        if (F.sway) d.x += (Math.sin(t * 0.9 + d.ph) * F.sway + (wx.windK - 1) * 0.5) * dt;
        const k = killY(d);
        if (d.y < k || Math.abs(d.x) > F.box + 4 || Math.abs(d.z) > F.box + 4) {
          d.x = rand(-F.box, F.box);
          d.z = rand(-F.box, F.box);
          d.y = F.top + rand(0, 1.5);
          d.v = F.speed * rand(0.86, 1.16);
          d.ph = rand(0, 6.28);
          d.s = rand(0.7, 1.3);
        }
        if (kind === 'rain') {
          const lean = 0.26 * wx.windK * F.len;
          arr.array[i * 6] = d.x;
          arr.array[i * 6 + 1] = d.y;
          arr.array[i * 6 + 2] = d.z;
          arr.array[i * 6 + 3] = d.x + lean;
          arr.array[i * 6 + 4] = d.y + F.len * d.s;
          arr.array[i * 6 + 5] = d.z;
        } else {
          arr.array[i * 3] = d.x;
          arr.array[i * 3 + 1] = d.y;
          arr.array[i * 3 + 2] = d.z;
        }
      }
      arr.needsUpdate = true;
    }
  }

  // Một lần tính cho cả hai trục: giờ rửa nền, thời tiết rửa đè, sét nhấp nháy cuối cùng.
  function applyAtmosphere() {
    const expW = (time ? time.exp : 1) * wx.exp;
    if (opts.renderer) opts.renderer.toneMappingExposure = expW;
    const sunK = (time ? THREE.MathUtils.clamp(time.exp, 0.6, 1.2) : 1) * wx.sunK;
    const bolt = flash > 0 ? flash * flash * 2.4 : 0;
    if (U) {
      const ta = time && time.fog ? 0.8 : 0;
      cZen.copy(base.zen);
      cHor.copy(base.hor);
      if (ta) {
        cTmp.set(time.fog);
        cZen.lerp(cTmp, ta);
        cHor.lerp(cTmp, ta * 0.94);
      }
      if (wx.washK) {
        cTmp.set(wx.wash);
        cZen.lerp(cTmp, wx.washK);
        cHor.lerp(cTmp, wx.washK);
      }
      const lift = 1 + bolt;
      U.uZenith.value.copy(cZen).multiplyScalar(sunK * 0.55 + 0.45).multiplyScalar(lift);
      U.uHorizon.value.copy(cHor).multiplyScalar(sunK * 0.4 + 0.6).multiplyScalar(lift);
      U.uGround.value.copy(base.gnd).multiplyScalar(0.35 + 0.65 * sunK).multiplyScalar(1 + bolt * 0.5);
      U.uSunCol.value.copy(base.sun).multiplyScalar(sunK).multiplyScalar(1 + bolt * 1.6);
      U.uAmb.value.copy(base.amb).multiplyScalar(0.45 + 0.55 * sunK);
      U.uCloud.value = Math.min(1, base.cloud + wx.cloudK);
      U.uFogDen.value = base.fogDen * wx.fogK;
      U.uWind.value = wx.windK;
    }
    if (lights.sun) lights.sun.intensity = lights.sun.userData.baseI * (0.3 + 0.7 * sunK) * (1 + bolt);
    if (lights.hemi) lights.hemi.intensity = lights.hemi.userData.baseI * (0.45 + 0.55 * sunK) * (1 + bolt * 0.6);
    // Nội thất không có hạt (mái che kín) nên cơn mưa phải hiện ở chính sương trong sảnh:
    // engine đưa màu fog của preset giờ, thời tiết rửa nó về wash của mình.
    if (scene.fog && fogBase) {
      scene.fog.color.set(fogBase);
      if (wx.washK) scene.fog.color.lerp(cWash, wx.washK * 0.55);
    }
    for (const kind in fields) {
      const f = fields[kind];
      if (!f.mesh.visible) continue;
      const dim = THREE.MathUtils.clamp(expW, 0.55, 1.1);
      if (kind === 'rain') f.mesh.material.opacity = 0.34 * dim;
      else f.mesh.material.opacity = (kind === 'bloom' ? 0.9 : 0.82) * dim;
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
    last = now;
    const at = opts.where ? opts.where() : null;
    if (at) {
      // Ô hạt bám theo người chơi, làm tròn về nửa đơn vị để nhảy bậc không bị lòi hạt.
      const nx = Math.round(at.x * 2) / 2, nz = Math.round(at.z * 2) / 2;
      if (nx !== g.position.x || nz !== g.position.z) g.position.set(nx, 0, nz);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (wx.kind === 'rain' && opts.onBolt) {
      boltIn -= dt;
      if (boltIn <= 0) {
        boltIn = rand(14, 38);
        flash = 1;
        opts.onBolt(rand(0.5, 1.8)); // tiếng vọng đến sau ánh chớp: mưa xa hay gần là ở số này
      }
    }
    step(dt);
    applyAtmosphere();
    raf = requestAnimationFrame(loop);
  }

  const api = {
    // preset giờ (AMBIENCES) đi qua đây để trời của vòm sky theo luôn, không chỉ fog.
    setTime(a, fog) {
      time = a;
      fogBase = fog ?? null;
      applyAtmosphere();
    },
    set(id) {
      wx = weatherOf(id);
      if (wx.wash) cWash.set(wx.wash);
      if (wx.kind && !fields[wx.kind]) fields[wx.kind] = build(wx.kind);
      for (const kind in fields) fields[kind].mesh.visible = kind === wx.kind;
      if (wx.kind !== 'rain') {
        flash = 0;
        boltIn = rand(14, 38);
      }
      applyAtmosphere();
      return wx;
    },
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    dispose() {
      api.stop();
      for (const kind in fields) {
        const f = fields[kind];
        g.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
      }
      scene.remove(g);
      // trả đèn về cường độ dựng cảnh, thời tiết không còn giữ cảnh nữa
      for (const k of ['sun', 'hemi']) if (lights[k]) lights[k].intensity = lights[k].userData.baseI;
    },
  };
  return api;
}
