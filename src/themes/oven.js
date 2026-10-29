// 오븐 테마: 빵이 부풀며 노릇하게 구워짐. 빵 윗면엔 사진이 구운 자국으로 찍힘
//   0.00 ~ 0.60  반죽이 부풀어 오름
//   0.20 ~ 1.00  하얀 반죽 → 노릇 → 갈색 크러스트, 빵 윗면의 사진 자국이 점점 진해짐
//   클릭         문이 열려 안을 보여줌 (몇 초 뒤 닫힘)
//   D-day        "띵" 문이 열리고 빵이 쟁반째 앞으로 나옴, 김이 모락모락
//   D-day 끝     펑! 오븐이 사라지고 빵이 하얀 도자기 접시에 담겨 남음
//   색           빨강·민트·크림·하늘색·검정
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { smooth, lerp, lumpy, makeShadow, fitSize, makePhotoMesh, applyPhoto, makePuffs, expandBounds,
  makeCanvas, toTex, heightToNormal, paintNoise, speckle, silhouette } from '../util.js';

export const OVEN_STYLES = ['retro'];
// 레트로 오븐 법랑 색
export const OVEN_COLORS = { red: 0xc8392a, mint: 0x86cdb9, cream: 0xeadcb8, sky: 0x86b9e0, black: 0x24262a };

const rgb = (c, k = 1) => `rgb(${Math.min(255, c[0] * k) | 0},${Math.min(255, c[1] * k) | 0},${Math.min(255, c[2] * k) | 0})`;

// ───────── 질감 만들기 (한 번만 만들어 재사용) ─────────

let T = null;
function textures() {
  if (T) return T;
  // 빵 크러스트: 기포 자국, 밀가루, 잔금 (색은 재질 색과 곱해짐)
  const crustC = makeCanvas(512), crustH = makeCanvas(512);
  {
    const g = crustC.getContext('2d'), h = crustH.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 512, 512);
    g.globalCompositeOperation = 'multiply'; paintNoise(g, 512, 512, { octaves: 6, lo: 185, hi: 255 }); g.globalCompositeOperation = 'source-over';
    h.fillStyle = '#808080'; h.fillRect(0, 0, 512, 512);
    paintNoise(h, 512, 512, { octaves: 6, lo: 90, hi: 170, alpha: 0.6 });
    for (let i = 0; i < 520; i++) {                         // 기포 (부풀어 오른 작은 혹)
      const x = Math.random() * 512, y = Math.random() * 512, r = 1.5 + Math.random() * 5;
      const gr = h.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = gr; h.fillRect(x - r, y - r, r * 2, r * 2);
      g.fillStyle = `rgba(110,60,20,${0.06 + Math.random() * 0.12})`; g.beginPath(); g.arc(x + r * 0.3, y + r * 0.3, r * 0.8, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(90,45,15,.25)'; h.strokeStyle = 'rgba(0,0,0,.6)';   // 잔금
    for (let i = 0; i < 40; i++) {
      let x = Math.random() * 512, y = Math.random() * 512, a = Math.random() * 6.3;
      g.lineWidth = h.lineWidth = 0.6 + Math.random() * 1.2;
      g.beginPath(); h.beginPath(); g.moveTo(x, y); h.moveTo(x, y);
      for (let k = 0; k < 5; k++) { a += (Math.random() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); h.lineTo(x, y); }
      g.stroke(); h.stroke();
    }
    speckle(g, 512, 512, 900, 0.5, 1.8, () => `rgba(255,255,255,${0.18 + Math.random() * 0.3})`);   // 밀가루
  }
  const crust = toTex(crustC, true, [1, 1]), crustN = toTex(heightToNormal(crustH, 2.2), false, [1, 1]);

  // 법랑 표면의 아주 미세한 물결 (오렌지 껍질 같은 광택 결)
  const peelH = makeCanvas(256); paintNoise(peelH.getContext('2d'), 256, 256, { octaves: 7, lo: 60, hi: 200 });
  const peel = toTex(heightToNormal(peelH, 1.5), false, [4, 4]);

  // 오븐 속 반점 법랑 (짙은 남색에 흰 점)
  const spC = makeCanvas(256); {
    const g = spC.getContext('2d'); g.fillStyle = '#1e2433'; g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 1400, 0.4, 1.3, () => Math.random() < 0.7 ? `rgba(220,225,235,${0.3 + Math.random() * 0.5})` : `rgba(90,110,150,.6)`);
  }
  const speckEnamel = toTex(spC, true, [3, 3]);

  // 오븐 유리 반사 띠, 환기구, 뒷벽 불빛, 앞판 이름표
  const streak = toTex((() => { const c = makeCanvas(256), g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 256, 256); grd.addColorStop(0.25, 'rgba(255,255,255,0)'); grd.addColorStop(0.36, 'rgba(255,255,255,.22)'); grd.addColorStop(0.42, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(255,255,255,.08)'); grd.addColorStop(0.55, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); return c; })());
  const vent = toTex((() => { const c = makeCanvas(256, 64), g = c.getContext('2d'); g.fillStyle = '#d9dade'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#2c2d31'; for (let x = 8; x < 250; x += 12) g.fillRect(x, 10, 6, 44); return c; })());
  const glow = toTex((() => { const c = makeCanvas(256), g = c.getContext('2d'); const grd = g.createRadialGradient(128, 140, 0, 128, 140, 150); grd.addColorStop(0, 'rgba(255,170,80,1)'); grd.addColorStop(0.5, 'rgba(255,110,40,.45)'); grd.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = grd; g.fillRect(0, 0, 256, 256); return c; })());
  const badge = toTex((() => { const c = makeCanvas(256, 64), g = c.getContext('2d'); g.fillStyle = '#e9e9ee'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#5a5c62'; g.font = 'italic 700 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D-day Bakery', 128, 34); return c; })());
  const parchC = makeCanvas(256); paintNoise(parchC.getContext('2d'), 256, 256, { octaves: 4, lo: 40, hi: 220 });
  const parch = toTex(heightToNormal(parchC, 3), false);

  T = {
    crust, crustN, peel, speckEnamel, streak, vent, glow, badge, parch,
  };
  return T;
}

// ───────── 재질 ─────────
const M = {
  enamel: (peel) => new THREE.MeshPhysicalMaterial({ color: OVEN_COLORS.red, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, clearcoatNormalMap: peel, clearcoatNormalScale: new THREE.Vector2(0.18, 0.18) }),
  chrome: () => new THREE.MeshStandardMaterial({ color: 0xf2f3f6, metalness: 1, roughness: 0.12 }),
  blackGlass: () => new THREE.MeshPhysicalMaterial({ color: 0x0e0e10, roughness: 0.05, metalness: 0.1, clearcoat: 1 }),
  darkMetal: () => new THREE.MeshStandardMaterial({ color: 0x38383c, roughness: 0.5, metalness: 0.7 }),
};

// ───────── 빵 ─────────
// loaf: 식빵 모양 / boule: 둥근 시골빵 (지금은 식빵만 사용)
function makeBread(photo, kind) {
  const { crust, crustN } = textures();
  let geo, topAt, size;
  if (kind === 'boule') {
    const R = 0.21, Hh = 0.15;
    geo = new THREE.SphereGeometry(R, 48, 24);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) / R;
      y = y > 0 ? y * Hh : y * 0.02 * R / R - 0.0;            // 바닥은 납작
      pos.setY(i, Math.max(y, -0.004) + 0.004);
    }
    topAt = (x, z) => Hh * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (R * R))) + 0.004;
    size = { w: R * 1.3, d: R * 1.3 };
  } else {
    const L = 0.5, Hh = 0.2, D = 0.33, dome = 0.075;
    geo = new RoundedBoxGeometry(L, Hh, D, 6, 0.075);
    const da = (x, z) => dome * Math.max(0, 1 - (2 * x / L) ** 2) * Math.max(0, 1 - (2 * z / D) ** 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > 0) pos.setY(i, y + da(pos.getX(i), pos.getZ(i)) * smooth(0, Hh / 2, y));
    }
    geo.translate(0, Hh / 2, 0);
    topAt = (x, z) => Hh + da(x, z);
    size = { w: L * 0.78, d: D * 0.8 };
  }
  // 위쪽일수록 진하게 구워진 색 (꼭짓점 색)
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3);
  let maxY = 0; for (let i = 0; i < pos.count; i++) maxY = Math.max(maxY, pos.getY(i));
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / maxY, top = smooth(0.45, 1, t), bottom = smooth(0.15, 0, t);
    const k = 1 - 0.24 * top - 0.18 * bottom;
    colors[i * 3] = k; colors[i * 3 + 1] = k * (1 - 0.06 * top); colors[i * 3 + 2] = k * (1 - 0.12 * top);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xefe2c6, vertexColors: true, map: crust, normalMap: crustN, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.8, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe6c0),
  });
  const bread = new THREE.Mesh(geo, mat);

  // 윗면 사진 자국: 빵 곡면을 따라 휜 판, 사진을 갈색으로 물들여 '구운 무늬'처럼
  const imprintMat = new THREE.MeshBasicMaterial({ map: photo.tex, color: 0x4a2408, transparent: true, opacity: 0, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const imprint = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), imprintMat);
  imprint.userData.noShadow = true;
  bread.add(imprint);
  const fitImprint = (aspect) => {
    const { w, h } = fitSize(aspect, size.w, size.d);
    const g = new THREE.PlaneGeometry(w, h, 16, 16);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, topAt(p.getX(i), p.getZ(i)) + 0.004);
    imprint.geometry.dispose(); imprint.geometry = g;
  };
  fitImprint(photo.aspect);
  return {
    mesh: bread,
    setPhoto(ph) { imprintMat.map = ph.tex; imprintMat.needsUpdate = true; fitImprint(ph.aspect); },
    bake(p) {
      const rise = smooth(0, 0.6, p), brown = smooth(0.2, 1, p);
      bread.scale.set(lerp(0.86, 1, rise), lerp(0.5, 1.05, rise), lerp(0.88, 1, rise));
      const c = new THREE.Color(0xf1e6cf);
      c.lerp(new THREE.Color(0xe8c283), smooth(0.2, 0.55, p));
      c.lerp(new THREE.Color(0xcf8f48), smooth(0.5, 0.85, p));
      c.lerp(new THREE.Color(0xa86430), smooth(0.85, 1, p));
      mat.color.copy(c);
      mat.roughness = lerp(0.88, 0.5, brown);              // 구워질수록 살짝 윤기
      mat.sheen = lerp(0.2, 0.8, brown);
      mat.normalScale.setScalar(lerp(0.35, 1, brown));      // 반죽은 매끈, 구워지면 기포·잔금이 도드라짐
      imprintMat.opacity = 0.92 * smooth(0.3, 0.9, p);
    },
  };
}

// 홈이 파인 다이얼
function knobGeo() {
  const g = new THREE.CylinderGeometry(0.044, 0.048, 0.04, 48, 1);
  const pos = g.attributes.position, sideCount = 49 * 2;
  for (let i = 0; i < sideCount; i++) {
    const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.08 * Math.pow(Math.max(0, Math.cos(a * 12)), 6);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ───────── 레트로 오븐 ─────────
function buildRetro(g) {
  const W = 1.15, D = 0.9, y0 = 0.24, y1 = 0.92, ch = y1 - y0;
  const tx = textures();
  const enamel = M.enamel(tx.peel), chrome = M.chrome();
  const inside = new THREE.MeshStandardMaterial({ map: tx.speckEnamel, roughness: 0.35, metalness: 0.1, side: THREE.BackSide });
  const add = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  add(new RoundedBoxGeometry(W, y0 - 0.03, D, 4, 0.03), enamel, 0, (y0 - 0.03) / 2 + 0.03, 0);       // 아래 서랍 칸
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])                                          // 발
    add(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 }), x * (W / 2 - 0.08), 0.015, z * (D / 2 - 0.08));
  add(new RoundedBoxGeometry(W, 0.3, D, 4, 0.03), enamel, 0, y1 + 0.15, 0);                           // 조절판 칸
  add(new THREE.BoxGeometry(0.07, ch, D), enamel, -W / 2 + 0.035, (y0 + y1) / 2, 0);                  // 옆벽
  add(new THREE.BoxGeometry(0.07, ch, D), enamel, W / 2 - 0.035, (y0 + y1) / 2, 0);
  add(new THREE.BoxGeometry(W - 0.14, ch, 0.05), enamel, 0, (y0 + y1) / 2, -D / 2 + 0.025);           // 뒷벽
  add(new THREE.BoxGeometry(W - 0.14, ch, D - 0.05), inside, 0, (y0 + y1) / 2, 0.025);                // 오븐 속 (반점 법랑)
  add(new THREE.BoxGeometry(W - 0.04, 0.025, D - 0.06), M.blackGlass(), 0, y1 + 0.3125, 0.01);       // 유리 상판
  add(new RoundedBoxGeometry(W, 0.2, 0.06, 4, 0.025), enamel, 0, y1 + 0.42, -D / 2 + 0.03);           // 뒤 가림판
  for (const yy of [y0, y1]) {                                                                        // 크롬 띠 (둥근 막대)
    const front = add(new THREE.CylinderGeometry(0.012, 0.012, W + 0.02, 12), chrome, 0, yy, D / 2 + 0.008); front.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { const side = add(new THREE.CylinderGeometry(0.012, 0.012, D, 12), chrome, s * (W / 2 + 0.008), yy, 0); side.rotation.x = Math.PI / 2; }
  }
  // 서랍 손잡이 · 이름표
  const dh = add(new THREE.CylinderGeometry(0.01, 0.01, 0.36, 12), chrome, 0, 0.13, D / 2 + 0.03); dh.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const st = add(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 8), chrome, s * 0.16, 0.13, D / 2 + 0.015); st.rotation.x = Math.PI / 2; }
  add(new THREE.BoxGeometry(0.26, 0.05, 0.006), new THREE.MeshStandardMaterial({ map: tx.badge, metalness: 0.8, roughness: 0.25 }), 0, 0.2, D / 2 + 0.003);
  // 화구 (유리 상판 위 링)
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x5c5c62, roughness: 0.35, metalness: 0.6 });
  for (const [x, z] of [[-0.26, -0.17], [0.26, -0.17], [-0.26, 0.17], [0.26, 0.17]]) {
    for (const r of [0.1, 0.06]) { const m = add(new THREE.TorusGeometry(r, 0.005, 6, 48), ringMat, x, y1 + 0.327, z); m.rotation.x = -Math.PI / 2; m.userData.noShadow = true; }
  }
  // 다이얼 5개 (홈 파인 손잡이 + 흰 눈금선) · 환기구 · 예열 램프
  const kg = knobGeo(), capMat = M.darkMetal(), tickMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let i = 0; i < 5; i++) {
    const x = -0.36 + i * 0.18;
    const k = add(kg, chrome, x, y1 + 0.13, D / 2 + 0.02); k.rotation.x = Math.PI / 2;
    const cap = add(new THREE.SphereGeometry(0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), capMat, x, y1 + 0.13, D / 2 + 0.04); cap.rotation.x = Math.PI / 2; cap.scale.y = 0.4;
    const tick = add(new THREE.BoxGeometry(0.006, 0.026, 0.004), tickMat, x, y1 + 0.13, D / 2 + 0.053);
    tick.geometry.translate(0, 0.012, 0); tick.rotation.z = (i - 2) * 0.55;
  }
  add(new THREE.BoxGeometry(0.82, 0.05, 0.01), new THREE.MeshStandardMaterial({ map: tx.vent, metalness: 0.85, roughness: 0.25 }), 0, y1 + 0.24, D / 2 + 0.006);
  const pilotMat = new THREE.MeshStandardMaterial({ color: 0x401000, emissive: 0xff6a1a, emissiveIntensity: 2, roughness: 0.2 });
  add(new THREE.SphereGeometry(0.016, 16, 10), pilotMat, 0.5, y1 + 0.13, D / 2 + 0.012);

  // 오븐 속: 뒷벽 불빛, 열선, 전구, 선반, 쟁반, 종이 호일
  const glowMat = new THREE.MeshBasicMaterial({ map: tx.glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
  add(new THREE.PlaneGeometry(W - 0.18, ch - 0.04), glowMat, 0, (y0 + y1) / 2, -D / 2 + 0.056);
  const coilMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, emissive: 0xff3b10, emissiveIntensity: 1, roughness: 0.6 });
  for (const yy of [y1 - 0.035, y0 + 0.035]) for (const zz of [-0.25, 0.05]) {
    const c = add(new THREE.CylinderGeometry(0.007, 0.007, W - 0.24, 8), coilMat, 0, yy, zz); c.rotation.z = Math.PI / 2;
  }
  add(new THREE.SphereGeometry(0.022, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffe3a8 }), -W / 2 + 0.1, y1 - 0.05, -D / 2 + 0.1);
  for (let i = 0; i < 9; i++) { const r = add(new THREE.CylinderGeometry(0.004, 0.004, D - 0.12, 6), chrome, -0.44 + i * 0.11, y0 + 0.2, 0.02); r.rotation.x = Math.PI / 2; }
  for (const zz of [-D / 2 + 0.1, D / 2 - 0.06]) { const r = add(new THREE.CylinderGeometry(0.005, 0.005, W - 0.16, 6), chrome, 0, y0 + 0.2, zz); r.rotation.z = Math.PI / 2; }
  const tray = new THREE.Group(); tray.position.set(0, y0 + 0.205, 0.02); g.add(tray);
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.45, metalness: 0.6 });
  add(new THREE.BoxGeometry(0.72, 0.01, 0.56), trayMat, 0, 0.005, 0, tray);
  for (const [w, d, x, z] of [[0.72, 0.012, 0, 0.274], [0.72, 0.012, 0, -0.274], [0.012, 0.56, 0.354, 0], [0.012, 0.56, -0.354, 0]])
    add(new THREE.BoxGeometry(w, 0.025, d), trayMat, x, 0.0125, z, tray);
  const paper = add(new THREE.PlaneGeometry(0.62, 0.46), new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.9, normalMap: tx.parch, normalScale: new THREE.Vector2(0.6, 0.6) }), 0, 0.012, 0, tray);
  paper.rotation.x = -Math.PI / 2;
  const light = new THREE.PointLight(0xff9a4a, 2, 1.6, 1.5); light.position.set(0, y1 - 0.12, 0.15); g.add(light);

  // 문: 아래 모서리를 축으로 앞으로 젖혀지며 열림
  const door = new THREE.Group(); door.position.set(0, y0, D / 2); g.add(door);
  const dW = W - 0.02, dd = 0.05, gw = dW - 0.26, gh = ch - 0.22;
  const dAdd = (geo, mat, x, y, z) => add(geo, mat, x, y, z, door);
  dAdd(new RoundedBoxGeometry(dW, 0.1, dd, 3, 0.012), enamel, 0, 0.05, dd / 2);
  dAdd(new RoundedBoxGeometry(dW, 0.12, dd, 3, 0.012), enamel, 0, ch - 0.06, dd / 2);
  dAdd(new THREE.BoxGeometry(0.13, gh, dd), enamel, -dW / 2 + 0.065, 0.1 + gh / 2, dd / 2);
  dAdd(new THREE.BoxGeometry(0.13, gh, dd), enamel, dW / 2 - 0.065, 0.1 + gh / 2, dd / 2);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1b1410, transparent: true, opacity: 0.3, roughness: 0.03, clearcoat: 1, depthWrite: false });
  dAdd(new THREE.PlaneGeometry(gw, gh), glass, 0, 0.1 + gh / 2, dd * 0.6);
  const sm = new THREE.MeshBasicMaterial({ map: tx.streak, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  dAdd(new THREE.PlaneGeometry(gw, gh), sm, 0, 0.1 + gh / 2, dd * 0.62);
  for (const [w, h, x, y] of [[gw + 0.03, 0.014, 0, 0.1], [gw + 0.03, 0.014, 0, 0.1 + gh], [0.014, gh, -gw / 2, 0.1 + gh / 2], [0.014, gh, gw / 2, 0.1 + gh / 2]])
    dAdd(new THREE.BoxGeometry(w, h, 0.012), chrome, x, y, dd + 0.004);
  const handle = dAdd(new THREE.CylinderGeometry(0.017, 0.017, dW - 0.26, 24), chrome, 0, ch - 0.05, dd + 0.07); handle.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { const st = dAdd(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 12), chrome, s * (dW - 0.32) / 2, ch - 0.05, dd + 0.035); st.rotation.x = Math.PI / 2; }

  return {
    door, tray, light, pilotMat, coilMat, glowMat, enamel,
    openDoor(k) { door.rotation.x = k * 1.42; },
    trayZ: 0.02, trayOut: 0.62, breadScale: 1, bread: 'loaf',
    size: { left: -W / 2, right: W / 2, top: y1 + 0.52 },
    back: { z: -D / 2, w: W, h: y1 + 0.52 },
  };
}

// 사진 누끼 모양 그대로 부푼 캐릭터빵: 외곽선을 따서 두툼하게 뽑고 가장자리를 둥글게, 윗면엔 사진이 구운 자국으로
function makeShapedBread(photo) {
  if (photo.placeholder) return null;
  const sil = silhouette(photo.tex.image);
  if (!sil) return null;
  const { crust, crustN } = textures();
  const s = Math.min(0.5 / sil.w, 0.38 / sil.h);
  const minDim = Math.min(sil.w, sil.h) * s;
  const bt = 0.05, bs = Math.min(0.035, minDim * 0.14), depth = 0.04;
  const shape = new THREE.Shape(sil.points.map(v => v.clone().multiplyScalar(s)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: 6, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bt, 0);
  // 가운데가 더 부푼 빵: 가장자리에서 먼 윗면일수록 살짝 올림
  const pos = geo.attributes.position, top = depth + 2 * bt;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > top * 0.55) {
      const x = pos.getX(i), z = pos.getZ(i);
      const r = Math.hypot(x / (sil.w * s / 2 + 1e-6), z / (sil.h * s / 2 + 1e-6));
      pos.setY(i, y + 0.035 * Math.max(0, 1 - r * r) * smooth(top * 0.55, top, y));
    }
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / (top + 0.035), tp = smooth(0.55, 1, t), bt2 = smooth(0.25, 0, t);
    const k = 1 - 0.24 * tp - 0.18 * bt2;
    colors[i * 3] = k; colors[i * 3 + 1] = k * (1 - 0.06 * tp); colors[i * 3 + 2] = k * (1 - 0.12 * tp);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const cr = crust.clone(); cr.repeat.set(3, 3); cr.needsUpdate = true;
  const crn = crustN.clone(); crn.repeat.set(3, 3); crn.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xefe2c6, vertexColors: true, map: cr, normalMap: crn, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.8, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffe6c0),
  });
  const bread = new THREE.Mesh(geo, mat);

  // 윗면 자국: 같은 모양의 판에 원래 사진을 갈색으로 물들여 얹음 (조금 안쪽으로)
  const dg = new THREE.ShapeGeometry(shape, 6);
  const dp = dg.attributes.position, duv = dg.attributes.uv;
  for (let i = 0; i < dp.count; i++) {
    const uv = sil.uvOf(dp.getX(i) / s, dp.getY(i) / s); duv.setXY(i, uv.x, uv.y);
    dp.setXY(i, dp.getX(i) * 0.93, dp.getY(i) * 0.93);
  }
  dg.rotateX(-Math.PI / 2);
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), z = dp.getZ(i), r = Math.hypot(x / (sil.w * s / 2), z / (sil.h * s / 2));
    dp.setY(i, top + 0.035 * Math.max(0, 1 - r * r) + 0.004);
  }
  const imprintMat = new THREE.MeshBasicMaterial({ map: photo.tex, color: 0x9a6230, transparent: true, opacity: 0, alphaTest: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const imprint = new THREE.Mesh(dg, imprintMat); imprint.userData.noShadow = true;
  bread.add(imprint);
  return {
    mesh: bread,
    bake(p) {
      const rise = smooth(0, 0.6, p), brown = smooth(0.2, 1, p);
      bread.scale.set(lerp(0.88, 1, rise), lerp(0.5, 1.05, rise), lerp(0.88, 1, rise));
      const c = new THREE.Color(0xf1e6cf);
      c.lerp(new THREE.Color(0xe8c283), smooth(0.2, 0.55, p));
      c.lerp(new THREE.Color(0xcf8f48), smooth(0.5, 0.85, p));
      c.lerp(new THREE.Color(0xa86430), smooth(0.85, 1, p));
      mat.color.copy(c);
      mat.roughness = lerp(0.88, 0.5, brown);
      mat.sheen = lerp(0.2, 0.8, brown);
      mat.normalScale.setScalar(lerp(0.35, 1, brown));
      imprintMat.opacity = 0.8 * smooth(0.3, 0.9, p);
    },
  };
}
// 사진이 있으면 누끼 모양 빵, 없으면 식빵
function breadFor(photo) { return makeShapedBread(photo) || makeBread(photo, 'loaf'); }

// 하얀 도자기 접시 (D-day에 빵이 담겨 나옴)
function makePlate() {
  const pts = [[0, 0.004], [0.2, 0.004], [0.23, 0.012], [0.25, 0.03], [0.3, 0.05], [0.31, 0.056], [0.302, 0.06], [0.24, 0.04], [0.21, 0.022], [0, 0.02]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const plate = new THREE.Group();
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xfbfaf7, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.3, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide });
  plate.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 64), porcelain));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.296, 0.003, 6, 96), new THREE.MeshStandardMaterial({ color: 0x3f6db3, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.057; plate.add(rim);
  return plate;
}

export function createOven(ctx) {
  const { group } = ctx;
  let parts = null, content = null, ovenGroup = null, serve = null, plate = null, holder = null, color = 'red';
  let bread = null, poof = null, steam = null;
  let p = 0, doorK = 0, doorTimer = 0, slide = 0, celebT = -1, poofed = false;
  let photo = ctx.photo;

  function build() {
    content = new THREE.Group(); group.add(content);
    content.add(makeShadow(3.2));
    ovenGroup = new THREE.Group(); content.add(ovenGroup);
    parts = buildRetro(ovenGroup);
    applyColor();


    // 빵 + (D-day에 나타나는) 접시: 평소엔 쟁반을 따라다님
    serve = new THREE.Group(); content.add(serve);
    plate = makePlate(); plate.scale.setScalar(0.001); plate.visible = false; serve.add(plate);
    bread = breadFor(photo);
    holder = new THREE.Group(); holder.position.y = 0.014; holder.add(bread.mesh); serve.add(holder);
    steam = makePuffs(serve, { count: 24, color: 0xffffff, size: 0.1, opacity: 0.55 });
    poof = makePuffs(content, { count: 40, color: 0xffffff, size: 0.35, opacity: 0.85 });

    group.scale.setScalar(Math.min(1, 1.95 / parts.size.top, 1.8 / (parts.size.right - parts.size.left)));
    bread.bake(p);
  }
  function applyColor() { if (parts?.enamel) parts.enamel.color.setHex(OVEN_COLORS[color] ?? OVEN_COLORS.red); }

  build();
  const ease = (x) => x * x * (3 - 2 * x);

  return {
    word: '구움',
    setVariant() {},                                  // 레트로 오븐 한 종류 (색만 고름)
    setColor(c) { color = OVEN_COLORS[c] !== undefined ? c : 'red'; applyColor(); },
    setPhoto(ph) {
      photo = ph;
      // 사진이 바뀌면 빵 모양도 새로
      holder.remove(bread.mesh); bread.mesh.traverse(o => o.geometry?.dispose());
      bread = breadFor(ph); holder.add(bread.mesh); bread.bake(p);
    },
    build(pp) { p = pp; bread.bake(p); },
    tick(dt, t, pp, celebrate) {
      if (celebrate) { if (celebT < 0) celebT = t; } else { celebT = -1; poofed = false; }
      const a = celebT < 0 ? -1 : t - celebT;

      // 문: 클릭하면 몇 초 열렸다 닫힘, D-day엔 열림
      if (doorTimer > 0) doorTimer -= dt;
      const want = celebrate || doorTimer > 0 ? 1 : 0;
      doorK += (want - doorK) * Math.min(1, dt * (want ? 3.5 : 2.5));
      parts.openDoor(ease(doorK));
      // D-day ① 쟁반이 앞으로 나옴
      const slideWant = celebrate && doorK > 0.85 ? 1 : 0;
      slide += (slideWant - slide) * Math.min(1, dt * 2.2);
      const trayPos = new THREE.Vector3(0, parts.tray.position.y, parts.trayZ + parts.trayOut * slide);
      parts.tray.position.z = trayPos.z;

      // D-day ② 펑! 오븐이 사라지고 ③ 빵이 하얀 접시에 담겨 가운데로
      const vanish = a < 0 ? 0 : ease(smooth(2.0, 2.7, a));
      const plateIn = a < 0 ? 0 : ease(smooth(2.25, 2.9, a));
      const toCenter = a < 0 ? 0 : ease(smooth(2.4, 3.4, a));
      if (a >= 2.0 && !poofed) {
        poofed = true;
        for (let i = 0; i < 1; i++) poof.tick(0.0001, 400000, () => new THREE.Vector3((Math.random() - 0.5) * 1.1, 0.2 + Math.random() * 1.1, (Math.random() - 0.5) * 0.8), { rise: 0.25, spread: 0.6, grow: 1.4, life: 1.3 });
      }
      poof.tick(dt, 0, () => new THREE.Vector3(), {});
      const k = 1 - vanish;
      ovenGroup.scale.set(k, k, k);
      ovenGroup.visible = k > 0.01;
      plate.visible = plateIn > 0.001;
      plate.scale.setScalar(Math.max(0.001, plateIn));
      const centerPos = new THREE.Vector3(0, 0, 0);
      serve.position.lerpVectors(trayPos, centerPos, toCenter);
      serve.scale.setScalar(lerp(1, 1.9, toCenter));
      // 접시 위에선 캐릭터빵이 앞으로 살짝 기대 서서 얼굴이 보이게
      holder.position.y = lerp(0.014, 0.03, plateIn) + 0.07 * toCenter;
      holder.position.z = -0.05 * toCenter;
      holder.rotation.x = 0.6 * toCenter;

      // 불·열기
      const heat = celebrate ? Math.max(0, 1 - a * 0.5) : 1;
      const flick = 0.97 + 0.03 * Math.sin(t * 0.9);      // 깜빡임 없이 아주 천천히 숨 쉬듯
      parts.light.intensity = 2.0 * heat * flick;
      parts.glowMat.opacity = 0.85 * heat * flick;
      parts.coilMat.emissiveIntensity = 1.2 * heat;
      parts.pilotMat.emissiveIntensity = 2 * heat;
      // 김: 다 구워질 무렵 문 열면 + D-day엔 계속
      const steamRate = celebrate ? 5 : (doorK > 0.5 ? 3 : 0) * smooth(0.5, 1, pp);
      steam.tick(dt, steamRate, () => new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.25, (Math.random() - 0.5) * 0.15), { rise: 0.3, spread: 0.08, grow: 2.5, life: 1.6 });
    },
    poke() { doorTimer = 3.5; return {}; },
    bounds(box) { expandBounds(box, content); },
  };
}
