// ⛪ 고해성사실 — 짙은 호두나무 3칸 부스 (성당 고해실 사진 참고, 새로 만든 모델)
//   가운데: 열리지 않는 장식 칸 — 아치 창살, 조각 장식(카르투슈), 돋을새김 판
//   왼쪽 문: 놋쇠 자물쇠로 잠겨 있음 (클릭하면 덜컹)
//   오른쪽 문: 클릭하면 끼이익 열림/닫힘. 안쪽 사진이 날이 가까울수록 또렷해짐
//   D-day: 종 → 위에서 장미창 빛이 내려옴 → 오른쪽 문이 열려 사진 → 자물쇠가 풀려 떨어짐 → 잠겨 있던 왼쪽 문이 열림
//   마지막 즈음(진행 85%~)엔 장미창 빛이 아주 희미하게 비침
import * as THREE from 'three';
import { smooth, lerp, dotTex, makeShadow, fitSize, expandBounds, makeCanvas, toTex, heightToNormal, paintNoise, speckle } from '../util.js';

const W = 1.9, D = 0.6, FRONT = D / 2;
const BOT = 0.1;                   // 받침 위
const TOP = 1.3;                   // 처마 아래
const SIDE = { x: 0.645, r: 0.2, spring: 0.93 };          // 양쪽 아치 칸 (중심 x, 반지름, 아치 시작 높이)
const MID = { r: 0.15, y0: 0.62, spring: 0.98 };          // 가운데 창살 아치
const rnd = (() => { let s = 3; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ── 호두나무: 채도 낮은 짙은 갈색, 세로결 + 물관 구멍 ──
function walnut(dark) {
  const w = 256, h = 1024, c = makeCanvas(w, h), g = c.getContext('2d'), hc = makeCanvas(w, h), hg = hc.getContext('2d');
  const base = dark ? [36, 23, 15] : [58, 38, 25];
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, w, h);
  paintNoise(g, w, h, { octaves: 4, lo: 0, hi: 255, alpha: 0.07 });
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, w, h);
  for (let i = 0; i < 170; i++) {
    const x0 = rnd() * w, amp = 2 + rnd() * 9, fr = 0.004 + rnd() * 0.01, ph = rnd() * 6, lw = 0.5 + rnd() * 2.4;
    const dk = rnd() < 0.6, a = 0.15 + rnd() * 0.3;
    g.strokeStyle = dk ? `rgba(12,8,5,${a})` : `rgba(110,76,50,${a * 0.4})`; g.lineWidth = lw;
    hg.strokeStyle = dk ? `rgba(30,30,30,${a})` : `rgba(210,210,210,${a * 0.4})`; hg.lineWidth = lw;
    for (const gg of [g, hg]) {
      gg.beginPath();
      for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y * fr + ph) * amp + Math.sin(y * fr * 3.1 + ph * 2) * amp * 0.3; y ? gg.lineTo(x, y) : gg.moveTo(x, y); }
      gg.stroke();
    }
  }
  for (let k = 0; k < 3; k++) {
    const cx = rnd() * w, cy = rnd() * h;
    for (let r = 4; r < 40; r += 3) { g.strokeStyle = `rgba(10,6,3,${0.16 - r * 0.003})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(cx, cy, r * 0.5, r * 1.8, 0, 0, 7); g.stroke(); }
  }
  speckle(g, w, h, 1500, 0.4, 1.1, 'rgba(8,5,3,.55)');
  speckle(hg, w, h, 1500, 0.4, 1.1, 'rgba(0,0,0,.6)');
  const map = toTex(c, true), nrm = toTex(heightToNormal(hc, 2.6), false);
  for (const t of [map, nrm]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, nrm };
}

// ── 몰딩 단면 그리기 도구: 원호를 점으로 ──
const arc = (cx, cy, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const P = Math.PI;
// 아치 테두리 단면 [바깥쪽, 앞쪽]: 깊은 안쪽 면 → 구슬 → 볼록 → 오목 → 바깥
const ARCH_PROFILE = [[0, -0.11], [0, 0], ...arc(0.012, 0, 0.012, P, 0), [0.03, 0], [0.03, 0.012], ...arc(0.03, 0.012, 0.024, P / 2, 0).reverse().map(([a, b]) => [a, b]).reverse(),
  [0.058, 0.012], [0.058, 0.026], ...arc(0.058, 0.062, 0.036, -P / 2, 0), [0.1, 0.062], [0.1, 0.05], [0.115, 0.03], [0.125, 0]];
// 처마 단면 [앞쪽, 위쪽]: 받침 → 볼록(오볼로) → 띠 → 앞면 → 오목 → 윗면
const CORNICE_PROFILE = [[0, 0], [0.02, 0], [0.02, 0.016], ...arc(0.02, 0.046, 0.03, -P / 2, 0), [0.06, 0.046], [0.06, 0.056], [0.1, 0.066], [0.1, 0.104], ...arc(0.135, 0.104, 0.035, P, P / 2), [0.14, 0.139], [0.14, 0.15], [0, 0.15]];
// 받침 단면 [앞쪽, 위쪽]
const PLINTH_PROFILE = [[0, BOT], [0.035, BOT], [0.035, BOT - 0.012], ...arc(0.035, BOT - 0.036, 0.024, P / 2, 0), [0.07, BOT - 0.036], [0.07, 0], [0, 0]].map(([a, b]) => [a, b]);

// 경로를 따라 단면을 밀어 만드는 몰딩 (path: {p, o(바깥), u(앞/위)})
function sweep(path, profile) {
  const n = path.length, m = profile.length, pos = [], uv = [], idx = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    if (i) L += path[i].p.distanceTo(path[i - 1].p);
    let pl = 0;
    for (let j = 0; j < m; j++) {
      const [a, b] = profile[j];
      if (j) pl += Math.hypot(a - profile[j - 1][0], b - profile[j - 1][1]);
      const v = path[i].p.clone().addScaledVector(path[i].o, a).addScaledVector(path[i].u, b);
      pos.push(v.x, v.y, v.z); uv.push(L * 1.4, pl * 3);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < m - 1; j++) {
    const a = i * m + j, b = a + m, c = b + 1, d = a + 1;
    idx.push(a, b, d, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // 면 방향 맞추기: 대부분 바깥/앞을 향해야 함
  const nr = g.attributes.normal; let sgn = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { const k = i * m + j; sgn += nr.getX(k) * (path[i].o.x + path[i].u.x) + nr.getY(k) * (path[i].o.y + path[i].u.y) + nr.getZ(k) * (path[i].o.z + path[i].u.z); }
  if (sgn < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}
// 아치 경로 (앞면 z, 가운데 x, 아래 y0, 아치 시작 높이, 반지름). 바깥 = 구멍에서 멀어지는 쪽
function archPath(x, y0, spring, r, z) {
  const path = [], fwd = V(0, 0, 1);
  path.push({ p: V(x - r, y0, z), o: V(-1, 0, 0), u: fwd });
  for (let i = 0; i <= 24; i++) { const a = P - P * i / 24; path.push({ p: V(x + r * Math.cos(a), spring + r * Math.sin(a), z), o: V(Math.cos(a), Math.sin(a), 0), u: fwd }); }
  path.push({ p: V(x + r, y0, z), o: V(1, 0, 0), u: fwd });
  return path;
}
// 앞면 + 양옆을 도는 경로 (모서리는 45도로 맞춤). 바깥 = 밖, 위 = +y
function wrapPath(y, halfW, back, front) {
  const s2 = Math.SQRT2, L = V(-1, 0, 1).normalize().multiplyScalar(s2), R = V(1, 0, 1).normalize().multiplyScalar(s2), up = V(0, 1, 0);
  return [
    { p: V(-halfW, y, back), o: V(-1, 0, 0), u: up }, { p: V(-halfW, y, front), o: L, u: up }, { p: V(-halfW, y, front), o: L, u: up },
    { p: V(halfW, y, front), o: R, u: up }, { p: V(halfW, y, front), o: R, u: up }, { p: V(halfW, y, back), o: V(1, 0, 0), u: up },
  ];
}
// 네 면을 모두 도는 닫힌 경로 (뒤쪽까지 처마가 이어지도록)
function loopPath(y, halfW, halfD) {
  const up = V(0, 1, 0), c = [[-1, -1], [-1, 1], [1, 1], [1, -1]], out = [];
  for (const [sx, sz] of [...c, c[0]]) { const o = V(sx, 0, sz); const pt = { p: V(sx * halfW, y, sz * halfD), o, u: up }; out.push(pt, { ...pt }); }
  return out.slice(1, -1);
}
// 아치 윗부분이 둥근 모양
function archShape(w, h, r, s = new THREE.Shape()) {
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h); s.absarc(0, h, r, 0, P, false); s.lineTo(-w / 2, 0);
  return s;
}
function rectShape(w, h, x = 0, y = 0) { const s = new THREE.Shape(); s.moveTo(x - w / 2, y); s.lineTo(x + w / 2, y); s.lineTo(x + w / 2, y + h); s.lineTo(x - w / 2, y + h); s.closePath(); return s; }
// 돋을새김 판: 가장자리가 비스듬히 깎여 올라온 판
function fieldedPanel(shape, depth = 0.008, bevel = 0.022) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel * 0.45, bevelSegments: 3, curveSegments: 24 });
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.3, uv.getY(i) * 0.4);
  return g;
}
function extrude(shape, depth, bevel = 0.006) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 28 });
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.3, uv.getY(i) * 0.4);
  return g;
}

// 장미창 그림: 가운데 꽃 → 꽃잎 고리 → 바깥 고리. 납 선(검정) 사이에 빨강·파랑·금색 유리
function roseWindow(blur = 0) {
  // 파리 성당 장미창 색감: 장밋빛·자주·보라가 주인공, 호박색·남색은 군데군데, 초록은 아주 조금
  const S = 512, c = makeCanvas(S), g = c.getContext('2d'), cx = S / 2;
  const pick = (w) => { let r = rnd() * w.reduce((a, [, n]) => a + n, 0); for (const [col, n] of w) { if ((r -= n) < 0) return col; } return w[0][0]; };
  const W = [['#b8306e', 5], ['#7c2a8e', 4], ['#d9789c', 3], ['#5a2a8a', 2], ['#e2a24e', 2], ['#3b3f9e', 1.2], ['#c4473f', 0.8], ['#5f9a6a', 0.4], ['#f1d9c0', 0.6]];
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const lead = (w) => { g.lineWidth = w; g.strokeStyle = '#000'; g.stroke(); };
  // 가운데: 네잎 꽃
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.arc(cx + Math.cos(a) * 18, cx + Math.sin(a) * 18, 20, 0, 7); g.fillStyle = pick(W); g.fill(); lead(4); }
  // 방사형 꽃잎(창살) 24개: 안쪽에서 바깥으로 작은 유리 조각들
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    for (let r = 45; r < 200; r += 22 + (r > 120 ? 6 : 0)) {
      const r2 = Math.min(200, r + 20 + (r > 120 ? 6 : 0));
      g.beginPath(); g.arc(cx, cx, r2, a0 + 0.012, a1 - 0.012); g.arc(cx, cx, r, a1 - 0.012, a0 + 0.012, true); g.closePath(); g.fillStyle = pick(W); g.fill(); lead(3);
    }
    // 꽃잎 끝의 둥근 머리
    const am = (a0 + a1) / 2; g.beginPath(); g.arc(cx + Math.cos(am) * 205, cx + Math.sin(am) * 205, 14, 0, 7); g.fillStyle = pick(W); g.fill(); lead(4);
  }
  // 바깥 고리: 작은 세잎 원들
  for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * 234, cx + Math.sin(a) * 234, 11, 0, 7); g.fillStyle = pick(W); g.fill(); lead(3); }
  // 굵은 돌 틀 (방사선)
  g.strokeStyle = '#000'; g.lineWidth = 6;
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * 45, cx + Math.sin(a) * 45); g.lineTo(cx + Math.cos(a) * 200, cx + Math.sin(a) * 200); g.stroke(); }
  g.lineWidth = 8; for (const r of [44, 201, 250]) { g.beginPath(); g.arc(cx, cx, r, 0, 7); g.stroke(); }
  g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(cx, cx, 249, 0, 7); g.fill();
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
  if (!blur) return c;
  // 빛이 공기를 지나며 번지는 느낌: 흐리게 + 가장자리를 부드럽게 줄임
  const o = makeCanvas(S), og = o.getContext('2d');
  og.fillStyle = '#000'; og.fillRect(0, 0, S, S); og.filter = `blur(${blur}px)`; og.drawImage(c, 0, 0); og.filter = 'none';
  const rg = og.createRadialGradient(cx, cx, S * 0.25, cx, cx, S * 0.5); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,1)');
  og.fillStyle = rg; og.fillRect(0, 0, S, S);
  return o;
}

export function createConfession(ctx) {
  const { group } = ctx;
  let photo = ctx.photo, built = false;
  let content, wood, woodDark, inside, gold, brass;
  let rightDoor, leftDoor, lock, shackle, leftGlow, leftLight, lockBase, rose, roseBeams, roseFloor, photoMesh, photoSize, glowPlane, inLight, priestGlow, beams, motes = [];
  let doorOpen = false, openAt = 0, doorAng = 0, lockT = -9, celebT = -1, nowT = 0;

  function box(w, h, d, mat = wood) {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv, n = geo.attributes.normal, ox = rnd(), oy = rnd();
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      uv.setXY(i, uv.getX(i) * (ax > 0.5 ? d : w) * 1.3 + ox, uv.getY(i) * (ay > 0.5 ? d : h) * 0.4 + oy);   // 상자마다 한 번만 어긋나게 (꼭짓점마다 다르면 결이 지그재그로 깨짐)
    }
    return new THREE.Mesh(geo, mat);
  }
  const lathe = (pts, mat = woodDark, seg = 20) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);

  // 꽈배기 기둥 + 받침대 + 기둥머리
  function column(h) {
    const g = new THREE.Group(), r = 0.032;
    const geo = new THREE.CylinderGeometry(r, r, h, 28, 160), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.3 * Math.sin(2 * a - (y / h) * P * 2 * 4.5);         // 깊게 꼬인 두 가닥
      pos.setX(i, x * k); pos.setZ(i, z * k);
    }
    geo.computeVertexNormals();
    const shaft = new THREE.Mesh(geo, woodDark); shaft.position.y = h / 2; g.add(shaft);
    // 기둥 밑 (토러스 두 겹)
    g.add(lathe([[0, 0], [0.05, 0], [0.05, 0.01], ...arc(0.05, 0.022, 0.012, -P / 2, P / 2, 6).map(([a, b]) => [a, b]), [0.04, 0.034], ...arc(0.04, 0.044, 0.009, -P / 2, P / 2, 5), [0.033, 0.056], [0, 0.056]].map(([a, b]) => [a, b - 0.03])));
    // 기둥머리: 종 모양 + 잎 장식 + 네모 머리판
    const cap = new THREE.Group(); cap.position.y = h; g.add(cap);
    cap.add(lathe([[0, 0], [0.036, 0], [0.034, 0.01], [0.04, 0.03], [0.05, 0.05], [0.058, 0.062], [0, 0.062]]));
    for (let i = 0; i < 8; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8, 0, P * 2, 0, P / 2), woodDark);
      const a = i / 8 * P * 2; lf.scale.set(0.7, 1.6, 0.5); lf.position.set(Math.cos(a) * 0.038, 0.012, Math.sin(a) * 0.038); lf.rotation.set(0, -a + P / 2, Math.cos(a) * 0.4);
      cap.add(lf);
    }
    for (const s of [-1, 1]) { const v = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.005, 8, 16), woodDark); v.position.set(s * 0.05, 0.05, 0.03); cap.add(v); }
    const ab = box(0.13, 0.02, 0.13, woodDark); ab.position.y = 0.072; cap.add(ab);
    return g;
  }
  function pedestal(w, h) {
    const g = new THREE.Group();
    const b = box(w, h, w, woodDark); b.position.y = h / 2; g.add(b);
    const pnl = new THREE.Mesh(fieldedPanel(rectShape(w * 0.55, h * 0.6, 0, -h * 0.3), 0.004, 0.012), wood); pnl.position.set(0, h / 2, w / 2); g.add(pnl);
    for (const [y, s] of [[0.012, 1.18], [h - 0.012, 1.14]]) { const m = box(w * s, 0.024, w * s, woodDark); m.position.y = y; g.add(m); }
    return g;
  }
  // 가운데 양옆 조각 기둥: 아래로 좁아지는 받침 + 둥근 조각들을 쌓은 장식
  function carvedPilaster(h) {
    const g = new THREE.Group();
    const term = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, h * 0.48, 4, 1), woodDark); term.rotation.y = P / 4; term.scale.z = 0.6; term.position.y = h * 0.24; g.add(term);
    const prof = [[0, 0], [0.032, 0], [0.042, 0.02], [0.03, 0.04], [0.026, 0.05], [0.046, 0.09], [0.05, 0.12], [0.04, 0.15], [0.022, 0.17], [0.03, 0.185], [0.03, 0.195], [0.018, 0.2], [0, 0.2]];
    for (let k = 0; k < 3; k++) { const v = lathe(prof); v.position.y = h * 0.48 + k * 0.205; v.scale.set(1, 1, 0.75); g.add(v); }
    for (let k = 0; k < 6; k++) {                                   // 늘어진 꽃줄 조각
      const s = 0.018 - k * 0.002, sp = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), woodDark);
      sp.position.set(0, h * 0.44 - k * 0.04, 0.035); sp.scale.z = 0.7; g.add(sp);
    }
    const vol = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.009, 8, 20, P * 1.6), woodDark); vol.position.set(0, h - 0.01, 0.02); g.add(vol);
    return g;
  }
  // 옆 칸 아치문 (돋을새김 판 두 개 + 경첩)
  function makeDoor(hingeSide) {
    const w = SIDE.r * 2 - 0.016, rr = w / 2, hgt = SIDE.spring - BOT - 0.004, t = 0.03;
    const pivot = new THREE.Group(), door = new THREE.Group(); pivot.add(door);
    door.position.x = -hingeSide * w / 2;            // 경첩 쪽이 pivot
    const slab = new THREE.Mesh(extrude(archShape(w, hgt, rr), t, 0.005), wood); slab.position.z = -t; door.add(slab);
    const low = new THREE.Mesh(fieldedPanel(rectShape(w * 0.66, hgt * 0.36, 0, hgt * 0.1)), woodDark); door.add(low);
    const upS = archShape(w * 0.66, hgt * 0.32, w * 0.33); const up = new THREE.Mesh(fieldedPanel(upS), woodDark); up.position.y = hgt * 0.56; door.add(up);
    // 가운데 십자 조각
    const cr = new THREE.Group(); const c1 = box(0.014, 0.08, 0.008, wood), c2 = box(0.05, 0.014, 0.008, wood); c2.position.y = 0.014; cr.add(c1, c2);
    cr.position.set(0, hgt * 0.56 + hgt * 0.2, 0.04); door.add(cr);
    // 놋쇠 띠 경첩
    for (const y of [0.12, hgt - 0.1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.022, 0.006), brass); strap.position.set(hingeSide * (w / 2 - 0.075), y, 0.006); door.add(strap);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 18), brass); tip.rotation.x = P / 2; tip.position.set(hingeSide * (w / 2 - 0.15), y, 0.006); door.add(tip);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), brass); barrel.position.set(hingeSide * (w / 2 + 0.002), y, 0.004); door.add(barrel);
    }
    pivot.userData = { door, w, hgt };
    return pivot;
  }
  function makeLock() {
    const g = new THREE.Group();
    const hasp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.006), brass); hasp.position.set(-0.03, 0, 0); g.add(hasp);
    const staple = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 8, 16, P), brass); staple.position.set(0.012, 0, 0.012); staple.rotation.set(0, P / 2, P / 2); g.add(staple);
    const pad = new THREE.Group(); pad.position.set(0.012, -0.004, 0.016); g.add(pad);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 28), brass); body.rotation.x = P / 2; body.position.y = -0.045; body.scale.set(1, 1, 1.15); pad.add(body);
    const sq = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.022), brass); sq.position.y = -0.03; pad.add(sq);
    const key = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.003, 10), new THREE.MeshStandardMaterial({ color: 0x1a1208 })); key.rotation.x = P / 2; key.position.set(0, -0.052, 0.013); pad.add(key);
    shackle = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0045, 10, 24, P), new THREE.MeshStandardMaterial({ color: 0xb9b9be, metalness: 1, roughness: 0.25 }));
    shackle.position.y = -0.015; pad.add(shackle);
    for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.012, 8), shackle.material); leg.position.set(s * 0.019, -0.021, 0); pad.add(leg); }
    g.userData.pad = pad;
    return g;
  }

  function build() {
    built = true;
    const wt = walnut(0), wd = walnut(1);
    const common = { roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22, envMapIntensity: 0.55 };
    wood = new THREE.MeshPhysicalMaterial({ map: wt.map, normalMap: wt.nrm, normalScale: new THREE.Vector2(0.6, 0.6), ...common });
    woodDark = new THREE.MeshPhysicalMaterial({ map: wd.map, normalMap: wd.nrm, normalScale: new THREE.Vector2(0.5, 0.5), ...common });
    inside = new THREE.MeshStandardMaterial({ map: wd.map, color: 0x6a6a6a, roughness: 0.8, envMapIntensity: 0.15 });
    gold = new THREE.MeshStandardMaterial({ color: 0xb8964a, metalness: 1, roughness: 0.35 });
    brass = new THREE.MeshStandardMaterial({ color: 0x9c7a3c, metalness: 1, roughness: 0.38 });

    content = new THREE.Group(); group.add(content);
    content.add(makeShadow(2.8));
    const booth = new THREE.Group(); content.add(booth); booth.scale.setScalar(0.92);
    const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); booth.add(m); return m; };

    // 몸통: 받침(몰딩) · 뒷판 · 옆판 · 지붕판
    add(new THREE.Mesh(sweep(loopPath(0, W / 2 + 0.005, D / 2 + 0.005), PLINTH_PROFILE), woodDark));
    add(box(W + 0.01, BOT, D + 0.01, woodDark), 0, BOT / 2, 0);
    add(box(W, TOP - BOT, 0.04), 0, (TOP + BOT) / 2, -D / 2 + 0.02);
    for (const s of [-1, 1]) {
      add(box(0.05, TOP - BOT, D), s * (W / 2 - 0.025), (TOP + BOT) / 2, 0);
      for (const [y, h] of [[0.42, 0.42], [1.0, 0.36]]) add(new THREE.Mesh(fieldedPanel(rectShape(D * 0.6, h, 0, -h / 2), 0.004, 0.018), woodDark), s * (W / 2 + 0.002), BOT + y, 0).rotation.y = s * P / 2;
    }
    add(box(W, 0.03, D, woodDark), 0, TOP - 0.015, 0);
    // 안쪽: 칸막이 + 아주 어두운 내부
    for (const x of [-0.42, 0.42]) add(box(0.03, TOP - BOT, D - 0.06, inside), x, (TOP + BOT) / 2, -0.02);
    add(box(W - 0.1, TOP - BOT - 0.04, 0.01, inside), 0, (TOP + BOT) / 2, -D / 2 + 0.045);

    // 앞면 판: 아치 두 개 + 가운데 창살 자리를 뚫음
    const face = rectShape(W - 0.02, TOP - 0.02, 0, 0.02);
    for (const s of [-1, 1]) { const hole = new THREE.Path(); hole.moveTo(s * SIDE.x - SIDE.r, BOT); hole.lineTo(s * SIDE.x - SIDE.r, SIDE.spring); hole.absarc(s * SIDE.x, SIDE.spring, SIDE.r, P, 0, true); hole.lineTo(s * SIDE.x + SIDE.r, BOT + 0.0001); hole.closePath(); face.holes.push(hole); }
    { const hole = new THREE.Path(); hole.moveTo(-MID.r, MID.y0); hole.lineTo(-MID.r, MID.spring); hole.absarc(0, MID.spring, MID.r, P, 0, true); hole.lineTo(MID.r, MID.y0); hole.closePath(); face.holes.push(hole); }
    add(new THREE.Mesh(extrude(face, 0.03, 0.004), wood), 0, 0, FRONT - 0.035);
    // 아치 테두리 몰딩 (깊은 그림자가 생기도록 안쪽 면 포함)
    for (const s of [-1, 1]) add(new THREE.Mesh(sweep(archPath(s * SIDE.x, BOT, SIDE.spring, SIDE.r, FRONT), ARCH_PROFILE), wood));
    add(new THREE.Mesh(sweep(archPath(0, MID.y0, MID.spring, MID.r, FRONT), ARCH_PROFILE.map(([a, b]) => [a * 0.7, b])), wood));
    // 아치 꼭대기 쐐기돌 조각
    for (const s of [-1, 1]) {
      const ks = lathe([[0, 0], [0.03, 0], [0.026, 0.02], [0.018, 0.035], [0, 0.04]], woodDark, 16); ks.rotation.x = P / 2; add(ks, s * SIDE.x, SIDE.spring + SIDE.r + 0.06, FRONT + 0.01);
    }

    // 기둥: 받침대 + 꽈배기 기둥 (양 끝, 가운데 양옆)
    const pedH = 0.2, colH = TOP - BOT - pedH - 0.11;
    for (const x of [-0.92, -0.37, 0.37, 0.92]) {
      add(pedestal(0.11, pedH), x, BOT, FRONT + 0.035);
      add(column(colH), x, BOT + pedH + 0.03, FRONT + 0.035);
      add(box(0.15, 0.05, 0.14, woodDark), x, TOP - 0.025, FRONT + 0.03);            // 기둥 위 튀어나온 머리
    }
    for (const x of [-0.23, 0.23]) add(carvedPilaster(TOP - BOT - 0.12), x, BOT + 0.04, FRONT + 0.015);

    // 처마: 앞과 옆을 감싸는 몰딩 + 가운데 둥근 박공
    add(new THREE.Mesh(sweep(loopPath(TOP, W / 2 + 0.03, D / 2 + 0.03), CORNICE_PROFILE), wood), 0, 0, 0.0);
    // 뒷면 마감: 칸마다 돋을새김 판 두 개씩
    for (const x of [-SIDE.x, 0, SIDE.x]) for (const [y, h] of [[0.16, 0.42], [0.66, 0.5]]) {
      const pn = add(new THREE.Mesh(fieldedPanel(rectShape(x ? 0.42 : 0.36, h, 0, 0), 0.004, 0.022), woodDark), x, BOT + y, -D / 2 - 0.002); pn.rotation.y = P;
    }
    for (const x of [-0.92, -0.33, 0.33, 0.92]) add(box(0.06, TOP - BOT, 0.02, woodDark), x, (TOP + BOT) / 2, -D / 2 - 0.008);
    const ped = new THREE.Shape(); ped.moveTo(-0.34, 0); ped.absarc(0, 0, 0.34, P, 0, true); ped.lineTo(-0.34, 0);
    add(new THREE.Mesh(extrude(ped, 0.05, 0.005), woodDark), 0, TOP + 0.15, FRONT - 0.04);
    const arcPath = []; for (let i = 0; i <= 28; i++) { const a = P - P * i / 28; arcPath.push({ p: V(0.34 * Math.cos(a), TOP + 0.15 + 0.34 * Math.sin(a), FRONT + 0.015), o: V(Math.cos(a), Math.sin(a), 0), u: V(0, 0, 1) }); }
    add(new THREE.Mesh(sweep(arcPath, ARCH_PROFILE.slice(2).map(([a, b]) => [a * 0.9, b * 0.9 + 0.01])), wood));
    const backArc = arcPath.map(q => ({ p: V(q.p.x, q.p.y, FRONT - 0.105), o: q.o, u: V(0, 0, -1) }));
    add(new THREE.Mesh(sweep(backArc, ARCH_PROFILE.slice(2).map(([a, b]) => [a * 0.6, b * 0.5 + 0.005])), wood));
    // 박공 안 조각: 타원 테두리 + 소용돌이 + 가운데 볼록
    const ov = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.016, 12, 40), woodDark); ov.scale.set(1.25, 0.8, 0.8); add(ov, 0, TOP + 0.3, FRONT + 0.03);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), wood); boss.scale.set(1.25, 0.8, 0.35); add(boss, 0, TOP + 0.3, FRONT + 0.02);
    for (const s of [-1, 1]) { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 10, 24, P * 1.5), woodDark); sc.rotation.z = s > 0 ? -P / 4 : P * 1.25; add(sc, s * 0.2, TOP + 0.21, FRONT + 0.03); }
    for (const x of [-0.88, 0.88]) { add(lathe([[0, 0], [0.04, 0], [0.03, 0.03], [0.045, 0.06], [0.03, 0.1], [0.012, 0.12], [0.02, 0.13], [0, 0.15]], woodDark), x, TOP + 0.15, FRONT - 0.01); }
    const cross = new THREE.Group(); cross.add(box(0.03, 0.2, 0.03, gold)); const arm = box(0.13, 0.03, 0.03, gold); arm.position.y = 0.04; cross.add(arm);
    add(cross, 0, TOP + 0.6, FRONT - 0.015);

    // 가운데 장식 칸 (열리지 않음): 아래 돋을새김 판 + 장미 조각, 위 창살 + 카르투슈
    add(new THREE.Mesh(fieldedPanel(rectShape(0.26, 0.38, 0, 0), 0.008, 0.025), woodDark), 0, BOT + 0.06, FRONT - 0.005);
    const ros = lathe([[0, 0], [0.04, 0], [0.042, 0.006], [0.03, 0.014], [0.014, 0.022], [0, 0.026]], wood, 24); ros.rotation.x = P / 2; add(ros, 0, BOT + 0.25, FRONT + 0.02);
    for (let i = 0; i < 8; i++) { const a = i / 8 * P * 2, pt = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), wood); pt.scale.set(1, 0.5, 0.45); pt.rotation.z = a; add(pt, Math.cos(a) * 0.05, BOT + 0.25 + Math.sin(a) * 0.05, FRONT + 0.012); }
    add(box(0.32, 0.03, 0.06, woodDark), 0, MID.y0 + 0.015, FRONT - 0.01);
    const balH = MID.spring - MID.y0 - 0.03;
    // 선반으로 깎은 난간동자: 아래 받침 → 불룩한 항아리 → 가는 목 → 고리 → 위 받침
    const balPts = [[0, 0], [0.016, 0], [0.016, 0.02], [0.011, 0.03], [0.014, 0.05], [0.02, 0.1], [0.021, 0.13], [0.016, 0.17], [0.009, 0.2], [0.007, 0.23], [0.012, 0.25], [0.012, 0.26], [0.007, 0.27], [0.009, 0.3], [0.014, 0.32], [0.014, 0.34], [0, 0.34]];
    for (let i = 0; i < 5; i++) {
      const b = lathe(balPts.map(([r, y]) => [r, y * balH / 0.34]), woodDark, 16);
      add(b, lerp(-0.1, 0.1, i / 4), MID.y0 + 0.03, FRONT - 0.03);
    }
    const cart = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 10, 32), woodDark); cart.scale.set(1.4, 0.85, 0.7); add(cart, 0, MID.spring + 0.05, FRONT - 0.02);
    for (const s of [-1, 1]) { const sc = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.009, 8, 20, P * 1.5), woodDark); sc.rotation.z = s > 0 ? P : -P / 2; add(sc, s * 0.08, MID.spring - 0.01, FRONT - 0.02); }
    priestGlow = add(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), new THREE.MeshBasicMaterial({ map: dotTex, color: 0xffa64d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })), 0, MID.y0 + 0.25, -0.15);
    priestGlow.userData.noBounds = true;

    // 칸 안 바닥 (어둡게)
    for (const x of [-SIDE.x, 0, SIDE.x]) add(box(x ? 0.4 : 0.36, 0.006, D - 0.1, inside), x, BOT + 0.003, -0.02);
    // 오른쪽 칸 안: 의자, 사진, 따뜻한 불빛
    add(box(0.36, 0.04, 0.16, inside), SIDE.x, BOT + 0.3, -D / 2 + 0.13);
    photoMesh = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: photo.tex, transparent: true, alphaTest: 0.02, depthWrite: false, toneMapped: false })));
    photoMesh.renderOrder = 1;
    glowPlane = add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.95), new THREE.MeshBasicMaterial({ map: dotTex, color: 0xffb25a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })), SIDE.x, BOT + 0.5, -D / 2 + 0.06);
    glowPlane.userData.noBounds = true;
    inLight = add(new THREE.PointLight(0xffb060, 0, 1.4, 1.6), SIDE.x, BOT + 0.85, 0.05);
    applyPhoto();

    // D-day 빛줄기
    const bc = makeCanvas(64, 256), bg = bc.getContext('2d'), gr = bg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,220,160,.9)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); bg.fillStyle = gr; bg.fillRect(0, 0, 64, 256);
    const bt = toTex(bc);
    beams = add(new THREE.Group(), SIDE.x, BOT + 0.55, FRONT);
    for (let i = 0; i < 6; i++) {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.14 + rnd() * 0.14, 1.5), new THREE.MeshBasicMaterial({ map: bt, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      bm.geometry.translate(0, -0.75, 0); bm.rotation.set(P / 2 + 0.15, 0, (i - 2.5) * 0.28); bm.userData.noBounds = true; beams.add(bm);
    }
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffe2b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.userData = { x: SIDE.x + (rnd() - 0.5) * 0.45, y: rnd() * 1.0, z: 0.1 + rnd() * 0.5, f: rnd() * 6, s: 0.012 + rnd() * 0.02, noBounds: true };
      booth.add(m); motes.push(m);
    }

    // 문: 오른쪽(열림, 경첩은 바깥쪽 오른편) · 왼쪽(잠김, 경첩은 바깥쪽 왼편)
    rightDoor = add(makeDoor(1), SIDE.x + SIDE.r - 0.008, BOT + 0.002, FRONT - 0.06);
    rightDoor.traverse(o => { o.userData.part = 'door'; });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.004, 8, 24), brass); ring.position.set(-rightDoor.userData.w / 2 + 0.05, 0.47, 0.03); rightDoor.userData.door.add(ring);
    const ringPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.005, 16), brass); ringPlate.rotation.x = P / 2; ringPlate.position.set(-rightDoor.userData.w / 2 + 0.05, 0.49, 0.01); rightDoor.userData.door.add(ringPlate);
    leftDoor = add(makeDoor(-1), -SIDE.x - SIDE.r + 0.008, BOT + 0.002, FRONT - 0.06);
    leftDoor.traverse(o => { o.userData.part = 'lock'; });
    lock = makeLock(); lock.scale.setScalar(1.6); add(lock, -SIDE.x + SIDE.r - 0.03, BOT + 0.47, FRONT - 0.045);
    lock.traverse(o => { o.userData.part = 'lock'; });
    lockBase = lock.position.clone();
    // 왼쪽 칸 안 (D-day에 자물쇠가 풀리면 보임): 따뜻한 빛
    leftGlow = add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.95), new THREE.MeshBasicMaterial({ map: dotTex, color: 0xffc070, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })), -SIDE.x, BOT + 0.5, -D / 2 + 0.06);
    leftGlow.userData.noBounds = true;
    leftLight = add(new THREE.PointLight(0xffb060, 0, 1.4, 1.6), -SIDE.x, BOT + 0.85, 0.05);

    // 장미창 빛: 위쪽(화면 밖) 둥근 스테인드글라스를 지나온 빛이 고해실과 바닥에 색 무늬로 떨어짐
    const roseTex = toTex(roseWindow(7));
    rose = new THREE.SpotLight(0xfff0e6, 0, 9, 0.46, 0.95, 1.2);
    rose.map = roseTex; rose.castShadow = true; rose.shadow.mapSize.set(512, 512); rose.shadow.bias = -0.0008; rose.shadow.radius = 10; rose.shadow.blurSamples = 16;
    rose.position.set(-1.3, 3.6, 2.4); rose.target.position.set(0.05, 0.55, 0.2);
    content.add(rose, rose.target);
    // 빛기둥: 빛이 지나가는 길에 떠 있는 먼지가 색으로 보이는 느낌
    roseBeams = new THREE.Group(); content.add(roseBeams);
    const dir = rose.target.position.clone().sub(rose.position), len = dir.length(); dir.normalize();
    // 빛기둥: 가운데가 진하고 가장자리·끝으로 갈수록 흐려지는 원뿔 (경계가 보이지 않게)
    const beamMat = (col) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(col) }, opacity: { value: 0 } },
      vertexShader: 'varying vec3 vN, vV; varying float vY; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = uv.y; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 color; uniform float opacity; varying vec3 vN, vV; varying float vY; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); float along = smoothstep(0., .35, vY) * (1. - smoothstep(.75, 1., vY)); float a = edge * along * opacity; gl_FragColor = vec4(color, a); }',
    });
    [[0xffc2d6, 0, 0.42, 1], [0xc9a0ff, -0.12, 0.3, 0.5], [0xffd6a0, 0.14, 0.28, 0.45]].forEach(([c, off, rad, k]) => {
      const bm = new THREE.Mesh(new THREE.CylinderGeometry(rad, 0.06, len, 32, 1, true), beamMat(c));
      bm.position.copy(rose.position).addScaledVector(dir, len / 2); bm.position.x += off; bm.position.z += off * 0.5;
      bm.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); bm.userData.noBounds = true; bm.userData.k = k; roseBeams.add(bm);
    });
    // 바닥에 떨어진 장미 무늬 (그림자만 받는 투명 바닥이라 따로 그림)
    // (위젯 창이 투명해서 검은 부분을 그대로 더하면 검은 판이 보임 → 밝기를 투명도로 바꾼 그림을 따로 씀)
    const fc = roseWindow(10), fg = fc.getContext('2d'), fd = fg.getImageData(0, 0, fc.width, fc.height);
    for (let i = 0; i < fd.data.length; i += 4) { const m = Math.max(fd.data[i], fd.data[i + 1], fd.data[i + 2]); fd.data[i + 3] = m; }
    fg.putImageData(fd, 0, 0);
    roseFloor = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), new THREE.MeshBasicMaterial({ map: toTex(fc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    roseFloor.rotation.x = -Math.PI / 2; roseFloor.position.set(-0.25, 0.004, FRONT * 0.92 + 0.55); roseFloor.scale.set(1, 0.75, 1); roseFloor.userData.noBounds = true; content.add(roseFloor);
  }

  function applyPhoto() {
    photoMesh.material.map = photo.tex; photoMesh.material.color.set(photo.placeholder ? 0xdff2ff : 0xffffff); photoMesh.material.needsUpdate = true;
    photoSize = fitSize(photo.aspect, 0.36, 0.92);
    photoMesh.scale.set(photoSize.w, photoSize.h, 1);
    photoMesh.position.set(SIDE.x, Math.max(BOT + 0.03 + photoSize.h / 2, BOT + 0.5), 0.02);
  }

  return {
    word: '고백',
    sounds: { click: 'knock', dday: 'confessionDday' },
    confetti: false,
    setVariant() { if (!built) build(); },
    setPhoto(ph) { photo = ph; if (built) applyPhoto(); },
    build() {},
    tick(dt, t, pp, celebrate) {
      nowT = t;
      let a = -1;
      if (celebrate) { if (celebT < 0) { celebT = t; doorOpen = true; } a = t - celebT; } else celebT = -1;
      const party = a >= 0;
      if (openAt && t >= openAt) { openAt = 0; doorOpen = true; }      // 똑똑 두드린 뒤에 열림

      // 오른쪽 문 (D-day엔 종이 한 번 울린 뒤 활짝)
      const target = doorOpen && (!party || a > 1.1) ? (party ? 2.55 : 2.35) : 0;
      doorAng += (target - doorAng) * Math.min(1, dt * (party ? 1.4 : 2.6));
      rightDoor.rotation.y = doorAng;
      const open = Math.min(1, doorAng / 1.6);

      // 사진: 날이 가까울수록 또렷 (문이 닫혀 있으면 안 보임)
      const clear = party ? lerp(0.7, 1, smooth(0.7, 2.4, a)) : lerp(0.08, 0.78, smooth(0.02, 0.97, pp));
      photoMesh.material.opacity = clear;
      const warm = party ? 1 : smooth(0, 1, pp);
      inLight.intensity = (0.15 + 0.85 * warm) * open * (party ? 1.8 : 1) * (1 + 0.05 * Math.sin(t * 7));   // 촛불처럼 일렁
      glowPlane.material.opacity = (0.1 + 0.35 * warm) * open * (party ? 1.4 : 1);
      priestGlow.material.opacity = 0.05 + 0.12 * warm;
      photoMesh.position.y = Math.max(BOT + 0.03 + photoSize.h / 2, BOT + 0.5) + (party ? 0.015 * Math.sin(Math.max(0, a - 2.4) * 1.8) : 0);

      const bk = party ? smooth(0.9, 2.2, a) * (0.75 + 0.25 * Math.sin(t * 1.3)) : 0;
      beams.children.forEach((b, i) => { b.material.opacity = bk * (0.15 + 0.06 * Math.sin(t * 0.9 + i)); });
      motes.forEach(m => { const u = m.userData; m.position.set(u.x + Math.sin(t * 0.4 + u.f) * 0.05, BOT + 0.15 + ((u.y + t * 0.04) % 1.0), FRONT + u.z * 0.5); m.scale.set(u.s, u.s, 1); m.material.opacity = (open * 0.3 + bk * 0.6) * (0.5 + 0.5 * Math.sin(t * 2 + u.f)); });

      // 장미창 빛: 마지막 즈음(진행 85%~)부터 아주 희미하게, D-day엔 위에서 내려오듯 환하게
      const roseK = party ? lerp(0.12, 1, smooth(0.3, 1.8, a)) : 0.12 * smooth(0.85, 1, pp);
      rose.intensity = 34 * roseK;
      roseBeams.children.forEach((b, i) => { b.material.uniforms.opacity.value = (party ? 0.22 : 0.06) * b.userData.k * roseK * (0.85 + 0.15 * Math.sin(t * 0.6 + i * 1.7)); });
      roseFloor.material.opacity = 0.4 * roseK;

      // 잠긴 왼쪽 문: 덜컹. D-day엔 자물쇠가 풀려 떨어지고, 한 번도 안 열리던 문이 열림
      const la = t - lockT, lk = la < 0.8 ? Math.sin(la * 50) * (1 - la / 0.8) : 0;
      const fall = party ? smooth(2.25, 2.8, a) : 0, bounce = party && a > 2.8 ? Math.abs(Math.sin((a - 2.8) * 9)) * Math.exp(-(a - 2.8) * 5) * 0.05 : 0;
      lock.position.set(lockBase.x + 0.05 * fall, lerp(lockBase.y, BOT + 0.06, fall * fall) + bounce, lockBase.z + 0.12 * fall);
      lock.rotation.z = fall * 1.4; shackle.rotation.z = party && a > 2.2 ? -0.6 : 0;
      const lOpen = party ? smooth(3.1, 4.4, a) : 0;
      leftDoor.rotation.y = -0.015 * Math.abs(lk) - 2.35 * lOpen;
      leftLight.intensity = 1.6 * lOpen * (1 + 0.05 * Math.sin(t * 6.3));
      leftGlow.material.opacity = 0.45 * lOpen;
      lock.userData.pad.rotation.z = 0.25 * Math.sin(la * 28) * Math.max(0, 1 - la / 0.9);
      shackle.position.y = -0.015 + 0.004 * Math.abs(lk);
    },
    poke(hit) {
      let part = null; for (let o = hit; o && !part; o = o.parent) part = o.userData?.part;
      if (part === 'lock') { if (celebT >= 0) return { sound: null }; lockT = nowT; return { sound: 'lockRattle' }; }
      if (celebT >= 0 || openAt) return { sound: null };
      if (doorOpen) { doorOpen = false; return { sound: 'doorClose' }; }
      openAt = nowT + 0.75;
      return { sound: 'knock' };
    },
    replay() { celebT = nowT; doorOpen = true; openAt = 0; doorAng = 0; },
    bounds(box) { expandBounds(box, content); },
  };
}
