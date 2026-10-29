// 알 테마: 진행될수록 금이 늘어나고 점점 자주 꿈틀거림. D-day에 윗껍질이 날아가며 사진이 나옴
//   0.12 ~ 0.97  앞쪽에서 시작한 금이 가지를 치며 퍼짐, 마지막엔 껍질이 갈라질 선이 생김
//   항상         가끔 꿈틀 (D-day에 가까울수록 자주, 크게)
//   클릭         알이 흔들흔들
//   종류         white: 하얀 달걀 / brown: 갈색 달걀 / dino: 점박이 공룡알 / fantasy: 빛나는 판타지 알
import * as THREE from 'three';
import { smooth, lerp, lumpy, canvasTex, fbm, makeShadow, fitSize, makePhotoMesh, applyPhoto, dotTex, expandBounds,
  makeCanvas, toTex, heightToNormal, paintNoise, speckle } from '../util.js';

export const EGG_TYPES = ['white', 'brown', 'dino', 'fantasy'];

const H = 1.4, R = 0.52, CUT = 0.6;          // 알 높이·반지름, 껍질이 갈라지는 높이(비율)
const TW = 1024, TH = 512;                    // 껍질 그림 크기
const SEG = 64;

// 알 옆모습: u(0=바닥, 1=꼭대기) → 높이 y, 반지름 r (아래가 조금 더 통통)
const profile = (u) => {
  const y = H * (1 - Math.cos(Math.PI * u)) / 2;
  const r = Math.max(0.002, R * Math.sin(Math.PI * u) * (1.08 - 0.2 * y / H));
  return { y, r };
};
const cutU = (() => { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (profile(m).y < H * CUT) lo = m; else hi = m; } return lo; })();
const cutY = H * CUT;
// 갈라지는 선의 톱니 모양 (각도 → 높이 차이)
const zig = (phi) => { const k = (phi / (Math.PI * 2)) * 12; return 0.04 * (Math.abs((k % 2) - 1) * 2 - 1); };

function shellGeo(u0, u1, n) {
  const pts = [], us = [];
  for (let j = 0; j <= n; j++) { const u = lerp(u0, u1, j / n); const { y, r } = profile(u); pts.push(new THREE.Vector2(r, y)); us.push(u); }
  const g = new THREE.LatheGeometry(pts, SEG, Math.PI, Math.PI * 2);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= n; j++) {
    const idx = i * (n + 1) + j;
    uv.setY(idx, us[j]);                                        // 위·아래 껍질 그림이 이어지도록
    const y = pos.getY(idx), f = Math.max(0, 1 - Math.abs(y - cutY) / 0.12);
    pos.setY(idx, y + zig((i / SEG) * Math.PI * 2) * f);        // 갈라지는 선 근처를 톱니처럼
  }
  g.computeVertexNormals();
  return g;
}

// ───────── 껍질 무늬 ─────────
function basePattern(type) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const n = fbm(256, 5);
  const mottle = (alpha, light) => {
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = 256;
    const tg = tmp.getContext('2d'), img = tg.createImageData(256, 256);
    for (let i = 0; i < n.length; i++) { const v = light ? 255 : 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = Math.max(0, n[i] - 0.45) * 2 * alpha * 255; }
    tg.putImageData(img, 0, 0);
    g.drawImage(tmp, 0, 0, TW, TH);
  };
  const dots = (count, rMin, rMax, color) => {
    for (let i = 0; i < count; i++) { g.fillStyle = color(); g.beginPath(); g.ellipse(Math.random() * TW, Math.random() * TH, rMin + Math.random() * (rMax - rMin), (rMin + Math.random() * (rMax - rMin)) * 0.8, Math.random() * 3, 0, 7); g.fill(); }
  };
  if (type === 'white') {
    g.fillStyle = '#f7f1e7'; g.fillRect(0, 0, TW, TH);
    mottle(0.25, false);
    dots(260, 0.6, 1.6, () => `rgba(170,140,100,${0.15 + Math.random() * 0.2})`);
  } else if (type === 'brown') {
    g.fillStyle = '#b57549'; g.fillRect(0, 0, TW, TH);
    mottle(0.35, true); mottle(0.25, false);
    dots(5000, 0.4, 1.3, () => `rgba(${90 + Math.random() * 30},${50 + Math.random() * 20},30,${0.25 + Math.random() * 0.3})`);
    dots(600, 0.5, 1.5, () => `rgba(230,190,150,${0.2 + Math.random() * 0.2})`);
  } else if (type === 'dino') {
    g.fillStyle = '#c6d0a6'; g.fillRect(0, 0, TW, TH);
    mottle(0.3, false);
    for (let i = 0; i < 46; i++) {                             // 큰 얼룩
      const x = Math.random() * TW, y = Math.random() * TH, r = 12 + Math.random() * 30;
      g.fillStyle = `rgba(${100 + Math.random() * 30},${70 + Math.random() * 20},${40},${0.55 + Math.random() * 0.3})`;
      g.beginPath();
      for (let k = 0; k <= 10; k++) { const a = k / 10 * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.5); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) : g.moveTo(x + rr, y); }
      g.fill();
    }
    dots(400, 1, 3, () => `rgba(90,70,40,${0.3 + Math.random() * 0.3})`);
  } else {                                                      // 판타지: 보라→청록 + 금빛 다이아 무늬
    const grd = g.createLinearGradient(0, TH, 0, 0);
    grd.addColorStop(0, '#3b2370'); grd.addColorStop(0.55, '#6b3fa8'); grd.addColorStop(1, '#2fb6c4');
    g.fillStyle = grd; g.fillRect(0, 0, TW, TH);
    mottle(0.25, true);
    g.strokeStyle = 'rgba(255,214,120,.75)'; g.lineWidth = 2.2;
    for (let row = 0; row < 6; row++) {
      const y = TH * (0.18 + row * 0.13);
      for (let k = 0; k < 16; k++) {
        const x = (k + (row % 2) * 0.5) * TW / 16, s = 9;
        g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y); g.lineTo(x, y + s); g.lineTo(x - s * 0.7, y); g.closePath(); g.stroke();
      }
    }
    dots(140, 0.8, 2.2, () => `rgba(255,240,200,${0.4 + Math.random() * 0.5})`);
  }
  return c;
}

// 껍질 요철: 아주 작은 기공과 은은한 굴곡 (빛을 받으면 진짜 달걀 껍질처럼 보임)
function basePores(type) {
  const c = makeCanvas(TW, TH), g = c.getContext('2d');
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, TW, TH);
  paintNoise(g, TW, TH, { octaves: 6, lo: 110, hi: 170, alpha: 0.7 });
  const pores = type === 'dino' ? 2500 : type === 'fantasy' ? 900 : 6000;
  speckle(g, TW, TH, pores, 0.4, type === 'dino' ? 2.2 : 1.1, () => `rgba(40,40,40,${0.25 + Math.random() * 0.35})`);
  speckle(g, TW, TH, pores / 3, 0.5, 1.4, () => `rgba(230,230,230,${0.15 + Math.random() * 0.25})`);
  if (type === 'dino') for (let i = 0; i < 260; i++) {        // 공룡알: 오돌토돌한 돌기
    const x = Math.random() * TW, y = Math.random() * TH, r = 3 + Math.random() * 7;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return c;
}

// 금 그물: 앞쪽에서 시작해 가지 치는 선분들. t(0~1)는 '언제 생기는지'
function makeCrackNet() {
  const segs = [];
  const grow = (x, y, ang, len, w, t0, t1, depth) => {
    const steps = 9; let px = x, py = y;
    for (let k = 0; k < steps; k++) {
      ang += (Math.random() - 0.5) * 0.9;
      const nx = px + Math.cos(ang) * len / steps, ny = py + Math.sin(ang) * len / steps * 0.8;
      const ts = lerp(t0, t1, k / steps), t = lerp(t0, t1, (k + 1) / steps);
      segs.push({ x0: px, y0: py, x1: nx, y1: ny, w, ts, t });
      if (depth < 3 && Math.random() < 0.3) grow(nx, ny, ang + (Math.random() < 0.5 ? 1 : -1) * (0.7 + Math.random() * 0.7), len * 0.55, w * 0.7, t, Math.min(1, t + (t1 - t0) * 0.7), depth + 1);
      px = nx; py = ny;
    }
  };
  const cx = TW * 0.5, cy = TH * (1 - 0.66);                   // 앞쪽 가운데보다 조금 위
  for (let i = 0; i < 5; i++) grow(cx + (Math.random() - 0.5) * 20, cy + (Math.random() - 0.5) * 16, i / 5 * Math.PI * 2 + Math.random() * 0.6, 120 + Math.random() * 90, 3.2, 0.0 + i * 0.06, 0.55 + i * 0.08, 0);
  for (let i = 0; i < 3; i++) grow(TW * (0.2 + Math.random() * 0.6), TH * (0.15 + Math.random() * 0.3), Math.random() * 6.3, 90, 2.2, 0.45 + i * 0.1, 0.95, 1);
  return segs;
}

export function createEgg(ctx) {
  const { group } = ctx;
  let type = null, photo = ctx.photo, p = 0;
  let content, egg, wobbler, bottom, topPivot, topMesh, shellMat, innerMat, nest, glow, lastDrawn = -1;
  let base = null, emCanvas = null, emTex = null, mapTex = null, mapCanvas = null, net = null;
  let poreBase = null, bumpCanvas = null, bumpTex = null;
  let photoMesh, photoSize, celebT = -1;
  const wobbles = []; let nextTwitch = 2, nowT = 0;
  let crackCanvas = null;
  let crackShown = -1, crackTarget = 0, lastDrawReveal = -1, crackFast = 0;
  let props = null, crumbs = [], crumbGroup = null, wob = 0;
  // 알 뒤로 은은하게 퍼지는 빛 — 화면을 따라 돌지 않게 world에 둠
  const backC = makeCanvas(512), backTex = toTex(backC);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: backTex, transparent: true, depthWrite: false, opacity: 0 }));
  back.position.set(0, 0.95, -0.9); back.renderOrder = -2; back.userData.noBounds = true;
  ctx.world.add(back);
  const GLOW = { white: [0xffd9a6, 1.0], brown: [0xffc690, 0.8], dino: [0xf3e2a8, 0.85], fantasy: [0xe0b8ff, 1.0] };

  const nestTop = { white: 0, brown: 0, dino: 0, fantasy: 0.16 };

  function drawShell() {
    const g = mapCanvas.getContext('2d');
    g.drawImage(base, 0, 0);
    const bg = bumpCanvas.getContext('2d');
    bg.drawImage(poreBase, 0, 0);
    bg.lineCap = 'round';
    const reveal = crackShown;
    const eg = crackCanvas.getContext('2d');
    eg.clearRect(0, 0, TW, TH); eg.lineCap = 'round';
    const dark = type === 'fantasy' ? 'rgba(40,10,60,.9)' : type === 'brown' ? 'rgba(60,30,15,.85)' : 'rgba(80,65,50,.8)';
    g.lineCap = 'round';
    for (const s0 of net) {
      if (s0.ts >= reveal) continue;
      // 지금 자라는 중인 선분은 일부만 그림 → 금이 뻗어 나가는 모습
      const f = Math.min(1, (reveal - s0.ts) / Math.max(1e-4, s0.t - s0.ts));
      const s = { ...s0, x1: s0.x0 + (s0.x1 - s0.x0) * f, y1: s0.y0 + (s0.y1 - s0.y0) * f };
      g.strokeStyle = dark; g.lineWidth = s.w * 1.7;
      g.beginPath(); g.moveTo(s.x0, s.y0); g.lineTo(s.x1, s.y1); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = s.w * 0.6;
      g.beginPath(); g.moveTo(s.x0 + 1, s.y0 + 1.5); g.lineTo(s.x1 + 1, s.y1 + 1.5); g.stroke();
      eg.strokeStyle = '#ffe2a0'; eg.lineWidth = s.w * 1.3; eg.beginPath(); eg.moveTo(s.x0, s.y0); eg.lineTo(s.x1, s.y1); eg.stroke();
      // 요철: 금 양옆은 살짝 들리고 가운데는 깊게 패임
      bg.strokeStyle = 'rgba(235,235,235,.8)'; bg.lineWidth = s.w * 3.2;
      bg.beginPath(); bg.moveTo(s.x0, s.y0); bg.lineTo(s.x1, s.y1); bg.stroke();
      bg.strokeStyle = '#000'; bg.lineWidth = s.w * 1.4;
      bg.beginPath(); bg.moveTo(s.x0, s.y0); bg.lineTo(s.x1, s.y1); bg.stroke();
    }
    // 마지막: 갈라질 톱니 선
    const cutLine = smooth(0.9, 1, crackShown);
    if (cutLine > 0) {
      // 껍질 그림은 정점을 따라 휘므로, 그림에선 곧은 선이 실제로는 톱니 모양으로 보임
      const y = TH * (1 - cutU), n = TW * cutLine;
      g.strokeStyle = dark; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(TW / 2 - n / 2, y); g.lineTo(TW / 2 + n / 2, y); g.stroke();
      eg.strokeStyle = '#ffe2a0'; eg.lineWidth = 3; eg.beginPath(); eg.moveTo(TW / 2 - n / 2, y); eg.lineTo(TW / 2 + n / 2, y); eg.stroke();
      bg.strokeStyle = '#000'; bg.lineWidth = 3; bg.beginPath(); bg.moveTo(TW / 2 - n / 2, y); bg.lineTo(TW / 2 + n / 2, y); bg.stroke();
    }
    mapTex.needsUpdate = true;
    bumpTex.needsUpdate = true;
    composeGlow();
  }

  // 안에서 켜진 불빛: 껍질 전체가 은은하게 밝고, 금 사이로는 빛이 더 새어 나옴
  function composeGlow() {
    const g = emCanvas.getContext('2d');
    const grd = g.createLinearGradient(0, TH, 0, 0);
    grd.addColorStop(0, '#2a1d12'); grd.addColorStop(0.25, '#9a7a58'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(0.75, '#d8c0a0'); grd.addColorStop(1, '#3a2a1c');
    g.globalCompositeOperation = 'source-over'; g.fillStyle = grd; g.fillRect(0, 0, TW, TH);
    // 금 사이로 새는 빛
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = type === 'fantasy' ? 1 : 0.75; g.drawImage(crackCanvas, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    emTex.needsUpdate = true;
  }

  // 알 뒤의 둥근 빛 무리 (무드등처럼)
  function makeBackGlow() {
    const g = backC.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    const rg = g.createRadialGradient(256, 300, 10, 256, 300, 250);
    rg.addColorStop(0, 'rgba(255,226,170,.75)'); rg.addColorStop(0.45, 'rgba(255,210,150,.28)'); rg.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
    backTex.needsUpdate = true;
  }

  function buildNest() {
    const n = new THREE.Group();
    if (type !== 'fantasy') return n;                     // 달걀·공룡알: 받침 없이 알만
    {
      const velvet = new THREE.MeshPhysicalMaterial({ color: 0x4a2a7a, roughness: 0.8, sheen: 1, sheenColor: new THREE.Color(0xb48cff) });
      const engC = makeCanvas(512, 64), eg2 = engC.getContext('2d');
      eg2.fillStyle = '#888'; eg2.fillRect(0, 0, 512, 64);
      eg2.strokeStyle = '#fff'; eg2.lineWidth = 3;
      for (let x = 0; x < 512; x += 32) { eg2.beginPath(); eg2.arc(x + 16, 32, 11, 0, Math.PI * 2); eg2.stroke(); eg2.beginPath(); eg2.moveTo(x, 32); eg2.lineTo(x + 5, 32); eg2.stroke(); }
      eg2.fillStyle = '#fff'; eg2.fillRect(0, 4, 512, 3); eg2.fillRect(0, 57, 512, 3);
      const gold = new THREE.MeshStandardMaterial({ color: 0xe0b552, metalness: 1, roughness: 0.22, normalMap: toTex(heightToNormal(engC, 3), false, [3, 1]) });
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 48), gold); ped.position.y = 0.06; n.add(ped);
      const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.4, 40, 16), velvet); cushion.scale.set(1, 0.16, 1); cushion.position.y = 0.13; n.add(cushion);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 64), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.12; n.add(rim);
    }
    return n;
  }

  function rebuild() {
    if (content) { group.remove(content); content.traverse(o => o.geometry?.dispose()); }
    content = new THREE.Group(); group.add(content);
    content.add(makeShadow(2.4));
    nest = buildNest(); content.add(nest);

    base = basePattern(type);
    mapCanvas = document.createElement('canvas'); mapCanvas.width = TW; mapCanvas.height = TH;
    mapTex = new THREE.CanvasTexture(mapCanvas); mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = 4;
    net = makeCrackNet();
    emCanvas = makeCanvas(TW, TH); emTex = new THREE.CanvasTexture(emCanvas); emTex.colorSpace = THREE.SRGBColorSpace;
    crackCanvas = makeCanvas(TW, TH);
    makeBackGlow();

    poreBase = basePores(type);
    bumpCanvas = makeCanvas(TW, TH);
    bumpTex = new THREE.CanvasTexture(bumpCanvas);
    const common = { map: mapTex, bumpMap: bumpTex, side: THREE.FrontSide, emissive: GLOW[type][0], emissiveMap: emTex, emissiveIntensity: 0 };
    if (type === 'fantasy') shellMat = new THREE.MeshPhysicalMaterial({ ...common, bumpScale: 1.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 1, iridescenceIOR: 1.5 });
    else if (type === 'dino') shellMat = new THREE.MeshPhysicalMaterial({ ...common, bumpScale: 4, roughness: 0.82, sheen: 0.3, sheenColor: new THREE.Color(0xe8f0d0) });
    else shellMat = new THREE.MeshPhysicalMaterial({ ...common, bumpScale: 1.6, roughness: type === 'brown' ? 0.62 : 0.55, sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color(type === 'brown' ? 0xf4c9a4 : 0xffffff), clearcoat: 0.12, clearcoatRoughness: 0.6 });
    innerMat = new THREE.MeshStandardMaterial({ color: type === 'fantasy' ? 0xf3e7ff : 0xfbf8f2, roughness: 0.7, side: THREE.BackSide });

    // 알: 흔들리는 축(바닥점) 아래에 아래껍질 + 윗껍질(따로 날아갈 수 있게)
    const sit = nestTop[type];
    wobbler = new THREE.Group(); wobbler.position.y = sit; content.add(wobbler);
    egg = new THREE.Group(); wobbler.add(egg);
    const bg = shellGeo(0, cutU, 28), tg = shellGeo(cutU, 1, 22);
    bottom = new THREE.Group();
    bottom.add(new THREE.Mesh(bg, shellMat), new THREE.Mesh(bg, innerMat));
    egg.add(bottom);
    topPivot = new THREE.Group(); topPivot.position.y = cutY; egg.add(topPivot);
    tg.translate(0, -cutY, 0);
    topMesh = new THREE.Group(); topMesh.add(new THREE.Mesh(tg, shellMat), new THREE.Mesh(tg, innerMat));
    topPivot.add(topMesh);

    // 알 속 사진 (D-day에 나옴)
    photoMesh = makePhotoMesh(photo); photoMesh.visible = false; egg.add(photoMesh);
    photoSize = fitSize(photo.aspect, 0.72, 0.9);

    back.material.color.setHex(type === 'fantasy' ? 0xe6ccff : 0xffffff);
    // 알 주변 소품
    props = new THREE.Group(); content.add(props);
    if (type === 'fantasy') {
      for (let i = 0; i < 16; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: i % 3 ? 0xd9b8ff : 0xffe6a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.userData = { a: Math.random() * 6.3, r: 0.55 + Math.random() * 0.35, y: 0.2 + Math.random() * 1.3, s: 0.2 + Math.random() * 0.5, f: Math.random() * 6 };
        props.add(sp);
      }
    }
    crumbs = []; crumbGroup = new THREE.Group(); content.add(crumbGroup);
    glow = new THREE.PointLight(type === 'fantasy' ? 0xd9a8ff : 0xffe2a8, 0, 2.2, 1.5); glow.position.set(0, sit + cutY, 0.6); content.add(glow);

    group.scale.setScalar(Math.min(1, 1.95 / (H + sit + 0.1)));
    lastDrawn = -1; lastDrawReveal = -1; if (crackShown < 0) crackShown = crackTarget; drawShell();
    if (glowLevel) glowLevel(p);
  }

  // 금이 늘어날 때마다 작은 껍질 조각이 둥지로 톡 떨어짐
  const CRUMB = { white: 0xf3eee6, brown: 0xb9784c, dino: 0xc6d0a6, fantasy: 0x7a4fc0 };
  const landY = { white: 0.004, brown: 0.004, dino: 0.004, fantasy: 0.16 };
  function updateCrumbs(dt, pp) {
    const want = Math.floor(smooth(0.03, 1, crackShown) * 26);
    while (crumbs.length > want) { const c = crumbs.pop(); crumbGroup.remove(c); c.geometry.dispose(); }
    if (crumbs.length < want && !crumbs.some(c => c.userData.falling)) {
      const sh = new THREE.Shape(), n = 3 + (Math.random() * 2 | 0), r = 0.012 + Math.random() * 0.018;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.random() * 0.8, rr = r * (0.6 + Math.random() * 0.6); i ? sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      const c = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: CRUMB[type], roughness: 0.6, side: THREE.DoubleSide }));
      const ang = (Math.random() - 0.5) * 1.2, h = nestTop[type] + H * (0.55 + Math.random() * 0.2);
      c.position.set(Math.sin(ang) * 0.46, h, Math.cos(ang) * 0.46);
      const fall = crumbs.length < want - 1;                         // 한꺼번에 많이 생기면 바로 바닥에
      c.userData = { falling: !fall, vy: 0, vx: Math.sin(ang) * 0.15, vz: Math.cos(ang) * 0.25, land: landY[type] + Math.random() * 0.02, spin: (Math.random() - 0.5) * 8 };
      if (fall) { c.position.set(Math.sin(ang) * (0.45 + Math.random() * 0.12), c.userData.land, Math.cos(ang) * (0.45 + Math.random() * 0.12)); c.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, Math.random() * 6); }
      crumbGroup.add(c); crumbs.push(c);
    }
    for (const c of crumbs) {
      const u = c.userData; if (!u.falling) continue;
      u.vy -= 3.2 * dt; c.position.y += u.vy * dt; c.position.x += u.vx * dt; c.position.z += u.vz * dt;
      c.rotation.x += u.spin * dt; c.rotation.z += u.spin * 0.6 * dt;
      if (c.position.y <= u.land) { c.position.y = u.land; c.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4; u.falling = false; }
    }
  }

  // 안쪽 불빛 세기 (진행될수록 밝게)
  function glowLevel(pp) {
    const k = GLOW[type][1];
    shellMat.emissiveIntensity = k * lerp(0.12, 0.95, smooth(0, 1, pp));
    back.material.opacity = lerp(0.05, 0.6, smooth(0.05, 1, pp));
  }

  function layoutPhoto(rise) {
    photoMesh.scale.set(photoSize.w, photoSize.h, 1);
    photoMesh.position.set(0, lerp(0.12, cutY - 0.12, rise) + photoSize.h / 2, 0.02);
  }

  return {
    word: '부화',
    setVariant(v) {
      const t = EGG_TYPES.includes(v) ? v : 'white';
      if (t === type) return;
      type = t; rebuild();
    },
    setPhoto(ph) { photo = ph; applyPhoto(photoMesh, ph); photoSize = fitSize(ph.aspect, 0.72, 0.9); },
    build(pp) {
      p = pp;
      crackTarget = smooth(0.12, 0.97, p);
      if (crackShown < 0) { crackShown = crackTarget; lastDrawReveal = -1; }      // 처음 켤 땐 지금 상태 그대로
      if (crackShown > crackTarget) crackShown = crackTarget;                    // 날짜를 새로 정하면 바로 줄어듦
      if (lastDrawReveal < 0) { lastDrawReveal = crackShown; drawShell(); }
      glowLevel(p);
    },
    tick(dt, t, pp, celebrate) {
      nowT = t;
      // 꿈틀: D-day에 가까울수록 자주, 크게
      nextTwitch -= dt;
      if (!celebrate && nextTwitch < 0) {
        wobbles.push({ t0: t, amp: lerp(0.04, 0.12, pp), dir: Math.random() < 0.5 ? 1 : -1 });
        nextTwitch = lerp(7, 1.6, pp) * (0.7 + Math.random() * 0.6);
      }
      let wz = 0, wx = 0;
      for (let i = wobbles.length - 1; i >= 0; i--) {
        const w = wobbles[i], a = t - w.t0;
        if (a > 2.5) { wobbles.splice(i, 1); continue; }
        const v = w.amp * Math.exp(-2.6 * a) * Math.sin(16 * a);
        wz += v * w.dir; wx += v * 0.35;
      }
      // D-day: 세게 흔들 → 윗껍질 날아감 → 사진이 쏙 올라와 통통
      let a = -1;
      if (celebrate) { if (celebT < 0) celebT = t; a = t - celebT; } else celebT = -1;
      if (a >= 0 && a < 0.5) wz += Math.sin(a * 60) * 0.08 * (1 - a / 0.5);
      // 금이 자라는 중: 일정한 속도로 뻗어 나가고, 그동안 알이 바르르 떨림
      if (crackShown < crackTarget) {
        const speed = crackFast > 0 ? 0.11 : Math.max(0.05, (crackTarget - crackShown) * 2.5);
        crackShown = Math.min(crackTarget, crackShown + speed * dt);
        if (crackFast > 0) crackFast -= dt;
        const tr = 0.012 * Math.min(1, (crackTarget - crackShown) * 20 + 0.3);
        wz += Math.sin(t * 70) * tr; wx += Math.cos(t * 53) * tr * 0.5;
      }
      if (Math.abs(crackShown - lastDrawReveal) > 0.0025 || (crackShown === crackTarget && lastDrawReveal !== crackShown)) { lastDrawReveal = crackShown; drawShell(); }
      wobbler.rotation.set(wx, 0, wz);
      // 숨 쉬듯 아주 살짝 커졌다 작아짐
      const br = Math.sin(t * 1.7) * (a < 0 ? 1 : 0);
      egg.scale.set(1 - 0.004 * br, 1 + 0.008 * br, 1 - 0.004 * br);
      updateCrumbs(dt, pp);
      if (type === 'fantasy') props.children.forEach(sp => {
        const u = sp.userData, ang = u.a + t * u.s * 0.6;
        sp.position.set(Math.cos(ang) * u.r, u.y + Math.sin(t * 0.8 + u.f) * 0.08, Math.sin(ang) * u.r * 0.8);
        const k2 = 0.05 + 0.03 * Math.sin(t * 3 + u.f); sp.scale.set(k2, k2, 1);
        sp.material.opacity = 0.4 + 0.5 * smooth(0, 1, pp);
      });

      const k = a < 0 ? 0 : smooth(0.4, 1.4, a);
      topPivot.position.set(0.66 * k, cutY + 0.6 * Math.sin(Math.PI * k) - (cutY - 0.16) * k, 0.12 * k);
      topPivot.rotation.set(0, 0, -2.4 * k);
      const rise = a < 0 ? 0 : smooth(0.5, 1.3, a);
      photoMesh.visible = a > 0.45;
      if (photoMesh.visible) {
        layoutPhoto(rise);
        if (a > 1.3) { photoMesh.position.y += Math.abs(Math.sin((a - 1.3) * 2.6)) * 0.1; photoMesh.rotation.z = Math.sin((a - 1.3) * 2.6) * 0.06; }
      }
      // 빛: 판타지는 금 사이로 빛이 새고, 다른 알도 깨질 때 반짝
      const burst = a < 0 ? 0 : Math.exp(-1.5 * Math.max(0, a - 0.4)) * smooth(0.3, 0.5, a);
      glow.intensity = 0.6 * smooth(0.3, 1, pp) * (a < 0 ? 1 : 0) + burst * 3;
      // 불빛이 살짝 일렁이고, 깨진 뒤엔 천천히 꺼짐
      const fade = a < 0 ? 1 : Math.max(0, 1 - Math.max(0, a - 0.8) * 0.6);
      const flick = 0.94 + 0.06 * Math.sin(t * 2.3) * Math.sin(t * 3.7);
      const lit = smooth(0, 1, pp) * fade;
      shellMat.emissiveIntensity = GLOW[type][1] * lerp(0.12, 1.25, lit) * flick;
      shellMat.color.setScalar(lerp(1, 0.7, smooth(0.15, 1, pp) * fade));
      back.material.opacity = lerp(0.05, 0.6, smooth(0.05, 1, pp)) * fade;
    },
    poke() {
      wobbles.push({ t0: nowT, amp: 0.22, dir: Math.random() < 0.5 ? 1 : -1 });
      if (crackTarget > 0.02) { crackShown = Math.max(0, crackTarget - 0.12); crackFast = 1.2; }
      return {};
    },
    bounds(box) { expandBounds(box, content); },
  };
}
