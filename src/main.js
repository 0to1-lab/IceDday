// D-day 위젯 — 공통 장면 (Three.js)
// 앱(Swift)이 window.IceDday.setState / setPhoto / poke / spin 등을 호출해서 상태를 넘겨줍니다.
// 테마(얼음·오븐·알)는 src/themes/ 에 있고, 진행도 p(0→1)를 받아 각자 모습을 바꿉니다.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { canvasTex, dotTex, disposeTree, markShadows } from './util.js';
import { createIce } from './themes/ice.js';
import { createOven } from './themes/oven.js';
import { createEgg } from './themes/egg.js';

let FPS = 30;                                     // 배터리 아끼려고 30fps (가볍게 모드는 20fps)
const THEMES = {
  ice: { make: createIce, variants: ['cube', 'ball', 'chunk'] },
  oven: { make: createOven, variants: ['retro'] },
  egg: { make: createEgg, variants: ['white', 'brown', 'dino', 'fantasy'] },
};

const state = { progress: 0, title: '', daysLabel: '', celebrate: false, theme: 'ice', variant: 'cube', color: 'red' };
let shown = 0;                                    // 화면에 보이는 진행도(부드럽게 따라감)
let preview = null;                               // 미리보기 재생 중이면 시작 시각
let yaw = 0, yawVel = 0, spinning = false, lastSpinT = 0;
let lifted = false, liftK = 0;                    // 길게 눌러 들어 올린 상태

// ───────── 렌더러/카메라 ─────────
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;               // 실제 그림자 (오븐·알이 바닥에 진짜 그림자를 드리움)
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
camera.position.set(0, 1.6, 6.1);
camera.lookAt(0, 0.6, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(2.5, 4, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 2.5, bottom: -1.5, near: 0.5, far: 12 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.02;
sun.target.position.set(0, 0.6, 0);
scene.add(sun, sun.target);
// 그림자만 받는 투명한 바닥
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = 0.0005; ground.receiveShadow = true;
scene.add(ground);

const root = new THREE.Group();                   // 마우스로 돌아가는 무대
scene.add(root);

// 사진 넣기 전 자리표시 (사람 모양)
const placeholderTex = canvasTex(512, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(s / 2, s * 0.3, s * 0.17, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(s / 2, s * 0.86, s * 0.3, s * 0.34, 0, Math.PI, 0); g.fill();
});
let photo = { tex: placeholderTex, aspect: 1, placeholder: true };

// ───────── 테마 ─────────
let theme = null, themeGroup = null, themeWorld = null;
function makeTheme(name, variant) {
  if (theme) {
    root.remove(themeGroup); scene.remove(themeWorld);
    disposeTree(themeGroup, new Set([photo.tex, placeholderTex]));
    disposeTree(themeWorld, new Set([photo.tex, placeholderTex]));
  }
  themeGroup = new THREE.Group(); themeWorld = new THREE.Group();
  root.add(themeGroup); scene.add(themeWorld);
  theme = THEMES[name].make({ group: themeGroup, world: themeWorld, photo, scene });
  theme.setVariant(variant);
  theme.setColor?.(state.color);
  theme.build(shown);
  markShadows(themeGroup);
  lastBuilt = shown;
}

// ───────── 축하 연출 (D-day, 모든 테마 공통) ─────────
const CONFETTI = 140;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.06, 0.1),
  new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONFETTI);
confetti.visible = false;
const confData = [];
const palette = [0xff8fab, 0xffd166, 0x8ecae6, 0xb5e48c, 0xcdb4db, 0xffffff];
function resetConf(c, initial) {
  c.x = (Math.random() - 0.5) * 3.2;
  c.y = initial ? Math.random() * 3.2 : 3.2 + Math.random() * 0.5;
  c.z = (Math.random() - 0.5) * 1.6;
  c.vy = 0.35 + Math.random() * 0.4;
  c.rx = Math.random() * 6; c.ry = Math.random() * 6;
  c.sp = 2 + Math.random() * 4; c.sway = Math.random() * 6;
  return c;
}
for (let i = 0; i < CONFETTI; i++) { confetti.setColorAt(i, new THREE.Color(palette[i % palette.length])); confData.push(resetConf({}, true)); }
scene.add(confetti);
const sparkles = [];
for (let i = 0; i < 10; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xfff3c4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sp.visible = false; sp.userData = { a: (i / 10) * Math.PI * 2, r: 0.85 + Math.random() * 0.3, y: 0.3 + Math.random() * 1.1 };
  scene.add(sp); sparkles.push(sp);
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function updateCelebrate(dt, t, on) {
  confetti.visible = on;
  sparkles.forEach(s => { s.visible = on; });
  if (!on) return;
  for (let i = 0; i < CONFETTI; i++) {
    const c = confData[i];
    c.y -= c.vy * dt; c.rx += c.sp * dt; c.ry += c.sp * 0.7 * dt;
    if (c.y < 0.02) resetConf(c, false);
    _p.set(c.x + Math.sin(t * 1.5 + c.sway) * 0.15, c.y, c.z);
    _q.setFromEuler(_e.set(c.rx, c.ry, 0));
    confetti.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  confetti.instanceMatrix.needsUpdate = true;
  sparkles.forEach((s, i) => {
    const u = s.userData, a = u.a + t * 0.6;
    s.position.set(Math.cos(a) * u.r, u.y + Math.sin(t * 2 + i) * 0.1, Math.sin(a) * u.r * 0.6);
    const k = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(t * 4 + i * 1.7));
    s.scale.set(k, k, 1);
  });
}

// ───────── 라벨 ─────────
const titleEl = document.getElementById('title');
const daysEl = document.getElementById('days');
const pctEl = document.getElementById('pct');
const labelEl = document.getElementById('label');
function updateLabel(p, celebrating) {
  titleEl.textContent = state.title || '';
  titleEl.style.display = state.title ? '' : 'none';
  daysEl.textContent = preview ? (celebrating ? 'D-DAY' : '미리보기') : (state.daysLabel || '');
  const hasDate = /^D/.test(state.daysLabel || '');
  pctEl.style.display = (hasDate || preview) && !celebrating ? '' : 'none';
  pctEl.textContent = `${(p * 100).toFixed(1)}% ${theme ? theme.word : ''}`;
  labelEl.classList.toggle('party', celebrating);
  labelEl.classList.toggle('small', (!!preview && !celebrating) || !hasDate);
}

// ───────── 앱과 주고받기 ─────────
const native = window.webkit?.messageHandlers?.ice || window.iceNative;   // 맥(WebKit) 또는 윈도우(Electron)
function post(msg) { try { native?.postMessage(msg); } catch (e) { } }

window.IceDday = {
  setState(s) {
    const prevTheme = state.theme, prevVariant = state.variant, prevColor = state.color;
    Object.assign(state, s);
    if (!THEMES[state.theme]) state.theme = 'ice';
    const vs = THEMES[state.theme].variants;
    if (!vs.includes(state.variant)) state.variant = vs[0];
    state.progress = Math.max(0, Math.min(1, +state.progress || 0));
    if (state.celebrate) state.progress = 1;
    if (state.theme !== prevTheme || !theme) makeTheme(state.theme, state.variant);
    else {
      if (state.variant !== prevVariant) { theme.setVariant(state.variant); theme.setColor?.(state.color); theme.build(shown); lastBuilt = shown; markShadows(themeGroup); }
      if (state.color !== prevColor) theme.setColor?.(state.color);
    }
  },
  setPhoto(url) {
    if (!url) { photo = { tex: placeholderTex, aspect: 1, placeholder: true }; theme?.setPhoto(photo); return; }
    new THREE.TextureLoader().load(url, tex => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const old = photo.tex;
      photo = { tex, aspect: tex.image.width / tex.image.height, placeholder: false };
      theme?.setPhoto(photo);
      if (old !== placeholderTex) old.dispose();
    });
  },
  // 클릭했을 때 테마 반응 (얼음: 한 바퀴, 오븐: 문 열기, 알: 흔들기)
  poke() {
    const r = theme?.poke() || {};
    if (r.spin) yawVel += r.spin;
  },
  // 마우스가 위젯 위에 있는지 (지금은 쓰지 않음, 앱 호환용)
  setHover(on) { document.body.classList.toggle('hover', !!on); },
  // 길게 눌러 옮기는 중: 살짝 커지고 떠오름
  setLifted(on) { lifted = !!on; },
  // 처음부터 끝까지 8초 동안 보여주기
  preview() { preview = performance.now(); },
  // 끌어서 돌리기: 끄는 동안 dx(픽셀)만큼 회전, 놓으면 관성으로 조금 더 돌다 멈춤
  spin(dx) {
    const now = performance.now(), dt = Math.max(8, now - lastSpinT) / 1000;
    yaw += dx * 0.012;
    yawVel = spinning ? yawVel * 0.5 + (dx * 0.012 / dt) * 0.5 : 0;
    spinning = true; lastSpinT = now;
  },
  spinEnd() { spinning = false; if (performance.now() - lastSpinT > 120) yawVel = 0; },
  getShown() { return shown; },
  // 화질: 'auto'(느리면 자동으로 가볍게) · 'high' · 'lite'
  setQuality(q) { quality = ['auto', 'high', 'lite'].includes(q) ? q : 'auto'; applyQuality(); },
  getPerf() { return { lite, quality, fps: perf.fps || null, gpu: gpuName() }; },
  _scene: scene, _camera: camera,
  isPreviewing() { return !!preview; },
  jump(p) { state.progress = p; shown = p; theme.build(p); lastBuilt = p; },
};

// 앱이 클릭 통과 영역을 알 수 있도록, 실제로 그려진 부분의 화면 범위를 보냄
// ───────── 화질: 느린 컴퓨터면 자동으로 가볍게 ─────────
// 가볍게 = 해상도 1배, 그림자 끔, 얼음 굴절 해상도 절반, 20fps
// 기본은 '높게'. 윈도우 앱만 'auto'를 보내서 느린 컴퓨터일 때 자동으로 가볍게 바꿈 (맥은 늘 선명하게)
let quality = 'high', lite = false, perf = { t0: 0, n: 0, done: false };
function setLite(on) {
  if (on === lite) return;
  lite = on;
  // 가볍게 모드도 모습은 최대한 지킴: 그림자는 유지(해상도만 낮춤), 얼음 굴절은 75%, 초당 24장
  FPS = lite ? 24 : 30;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 2));
  const ms = lite ? 512 : 1024;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  renderer.transmissionResolutionScale = lite ? 0.75 : 1;
  scene.traverse(o => { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { if (m) m.needsUpdate = true; }); });
  resize();
  post({ type: 'lite', on: lite });
}
function applyQuality() { setLite(quality === 'lite' || (quality === 'auto' && perf.slow === true)); }
// 시작 후 몇 초 동안 실제로 그려진 장수를 세서, 목표의 60%도 못 그리면 느린 컴퓨터로 판단
// 켠 직후 3초는 준비 작업(셰이더 준비 등)으로 원래 버벅이니 빼고, 그다음 5초를 잼
function measure(now) {
  if (perf.done || quality !== 'auto') return;
  if (!perf.warm) { perf.warm = now; return; }
  if (now - perf.warm < 3000) return;
  if (!perf.t0) { perf.t0 = now; perf.n = 0; return; }
  perf.n++;
  const sec = (now - perf.t0) / 1000;
  if (sec > 5) { perf.done = true; perf.fps = perf.n / sec; perf.slow = perf.fps < 15; applyQuality(); }
}

const box = new THREE.Box3(), corner = new THREE.Vector3();
let lastHit = '';
function reportHit() {
  root.updateMatrixWorld(true);
  box.makeEmpty();
  theme.bounds(box);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!box.isEmpty()) for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    corner.project(camera);
    const sx = (corner.x * 0.5 + 0.5) * W, sy = (-corner.y * 0.5 + 0.5) * H;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  for (const el of [titleEl, daysEl, pctEl]) {          // 글자가 실제로 있는 곳만 (라벨 줄 전체가 아니라)
    if (el.style.display === 'none' || !el.textContent) continue;
    const r = document.createRange(); r.selectNodeContents(el);
    const lr = r.getBoundingClientRect();
    if (lr.width) { x0 = Math.min(x0, lr.left); x1 = Math.max(x1, lr.right); y0 = Math.min(y0, lr.top); y1 = Math.max(y1, lr.bottom); }
  }
  const r = {
    type: 'hit',
    x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(W, x1) - Math.max(0, x0), h: Math.min(H, y1) - Math.max(0, y0),
  };
  const key = [r.x, r.y, r.w, r.h].map(Math.round).join(',');
  if (key !== lastHit) { lastHit = key; post(r); }
}

// ───────── 루프 ─────────
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  lastHit = '';
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
resize();

let lastBuilt = -1, last = performance.now(), acc = 0, hitTimer = 0;
const clock0 = performance.now();
window.IceDday.setState({});

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  if (acc < 1 / FPS) return;
  const step = Math.min(0.1, acc); acc = 0;
  measure(now);
  const t = (now - clock0) / 1000;

  // 목표 진행도: 평소엔 앱이 준 값, 미리보기 중엔 0→1 재생 후 원래대로
  // 미리보기: 7초 동안 0→1, 잠깐 멈췄다가 D-day 장면(얼음 풀림·빵 나옴·알 깨짐)까지 보여 주고 원래대로
  let target = state.progress, rate = 1.5, previewParty = false;
  if (preview) {
    const pt = (now - preview) / 1000;
    if (pt < 7) { target = pt / 7; rate = 30; }
    else if (pt < 7.6) { target = 1; rate = 30; }
    else if (pt < 14.5) { target = 1; rate = 30; previewParty = true; }
    else { preview = null; }
  }
  shown += (target - shown) * Math.min(1, step * rate);
  if (Math.abs(shown - target) < 0.0005) shown = target;
  if (Math.abs(shown - lastBuilt) > 0.003 || (shown === target && shown !== lastBuilt)) {
    theme.build(shown); lastBuilt = shown;
  }

  const celebrating = preview ? previewParty : !!state.celebrate;
  if (!spinning) { yaw += yawVel * step; yawVel *= Math.pow(0.04, step); }
  root.rotation.y = 0.45 + yaw + Math.sin(t * 0.35) * 0.25;   // 살랑살랑 + 마우스 회전
  liftK += ((lifted ? 1 : 0) - liftK) * Math.min(1, step * 12);
  root.scale.setScalar(1 + 0.05 * liftK); root.position.y = 0.06 * liftK;
  theme.tick(step, t, shown, celebrating);
  updateCelebrate(step, t, celebrating);
  updateLabel(shown, celebrating);
  renderer.render(scene, camera);

  hitTimer += step;
  if (hitTimer > 0.4) { hitTimer = 0; reportHit(); markShadows(themeGroup); }
}
function gpuName() {
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) { return ''; }
}
// 그래픽 카드 없이 CPU로 그리는 경우(SwiftShader 등)는 바로 가볍게
if (/swiftshader|llvmpipe|software|basic render/i.test(gpuName())) { perf.done = true; perf.slow = true; }   // 그래픽 카드 없이 CPU로 그리는 경우: 'auto'면 가볍게
requestAnimationFrame(frame);
post({ type: 'ready' });

// ───────── 브라우저에서 열었을 때 (앱이 아닐 때) ─────────
if (!native) {
  // 끌면 돌리고, 그냥 클릭하면 테마 반응
  let px = null, moved = 0;
  canvas.style.cursor = 'grab'; canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', e => { px = e.clientX; moved = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => {
    if (px === null) return;
    const dx = e.clientX - px; moved += Math.abs(dx);
    if (moved > 4) IceDday.spin(dx);
    px = e.clientX;
  });
  const end = () => {
    if (px === null) return;
    px = null; canvas.style.cursor = 'grab';
    if (moved > 4) IceDday.spinEnd(); else IceDday.poke();
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  document.addEventListener('pointerenter', () => IceDday.setHover(true));
  document.addEventListener('pointerleave', () => IceDday.setHover(false));
}

// web/index.html 을 브라우저로 직접 열면: 진행도 슬라이더 + 테마 선택이 생겨서 바로 확인 가능
if (!native && !window.ICE_EXTERNAL_UI) {
  document.body.style.background = 'linear-gradient(#4f8fd6, #9cc7ef)';
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;font:12px -apple-system,sans-serif;color:#fff;z-index:9';
  const opts = [['ice', 'cube', '얼음 · 각얼음'], ['ice', 'ball', '얼음 · 공'], ['ice', 'chunk', '얼음 · 수정 모양'],
    ['oven', 'retro', '오븐'],
    ['egg', 'white', '알 · 하얀 달걀'], ['egg', 'brown', '알 · 갈색 달걀'], ['egg', 'dino', '알 · 공룡알'], ['egg', 'fantasy', '알 · 판타지']];
  bar.innerHTML = '<input type="range" min="0" max="1000" value="0" style="flex:1;min-width:120px"><select>' +
    opts.map((o, i) => `<option value="${i}">${o[2]}</option>`).join('') + '</select><select id="dev-color"><option value="red">빨강</option><option value="mint">민트</option><option value="cream">크림</option><option value="sky">하늘색</option><option value="black">검정</option></select><label><input type="checkbox"> D-day</label><button>▶</button>';
  document.body.appendChild(bar);
  const range = bar.querySelector('input[type=range]'), cel = bar.querySelector('input[type=checkbox]');
  const sel = bar.querySelector('select'), colorSel = bar.querySelector('#dev-color'), play = bar.querySelector('button');
  const apply = () => {
    const p = range.value / 1000, o = opts[+sel.value];
    IceDday.setState({ progress: p, title: '테스트', daysLabel: cel.checked ? 'D-DAY' : `D-${Math.round((1 - p) * 30)}`, celebrate: cel.checked, theme: o[0], variant: o[1], color: colorSel.value });
  };
  range.oninput = cel.onchange = sel.onchange = colorSel.onchange = apply;
  play.onclick = () => IceDday.preview();
  apply();
}
