// 🌕 달 테마
//   보름달에서 시작해 날이 갈수록 기울어 사라지고, 처음엔 없던 그림(내 사진, 없으면 늑대)이 점점 또렷해짐
//   D-day: 달은 거의 사라지고 늑대가 완전히 나타나 "아우~" 하울링
import * as THREE from 'three';
import { smooth, lerp, lumpy, dotTex, makeShadow, fitSize, expandBounds, makeCanvas, toTex, paintNoise, heightToNormal } from '../util.js';

const BASE = 0.34;                     // 바위 윗면 높이 (그림이 서는 곳)
const MOON = { x: 0.5, y: 1.62, z: -1.5, r: 0.5 };
const rnd = (() => { let s = 11; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

// ── 달 표면 그림: 구에 감싸는 펼친 지도(가로 2:세로 1) + 높이 그림(크레이터 요철) ──
function moonMaps() {
  const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d'), hc = makeCanvas(W, H), h = hc.getContext('2d');
  g.fillStyle = '#c4c0b8'; g.fillRect(0, 0, W, H);
  paintNoise(g, W, H, { octaves: 6, lo: 150, hi: 235, alpha: 0.5 });
  h.fillStyle = '#808080'; h.fillRect(0, 0, W, H);
  paintNoise(h, W, H, { octaves: 4, lo: 110, hi: 150, alpha: 0.5 });
  const wrap = (x, f) => { f(x); f(x - W); f(x + W); };
  // 바다(어두운 평원): 카메라를 보는 쪽(u≈0.25)에 실제 달 앞면처럼 모아 둠
  const maria = [[0.2, 0.33, 0.06], [0.25, 0.36, 0.04], [0.28, 0.44, 0.05], [0.3, 0.5, 0.035], [0.17, 0.5, 0.08], [0.22, 0.6, 0.04], [0.34, 0.37, 0.03], [0.26, 0.62, 0.03], [0.12, 0.4, 0.04], [0.7, 0.45, 0.03], [0.6, 0.3, 0.02]];
  g.filter = 'blur(9px)'; h.filter = 'blur(9px)';
  for (const [x, y, r] of maria) for (let k = 0; k < 4; k++) {
    const ex = (x + (rnd() - 0.5) * r * 0.8) * W, ey = (y + (rnd() - 0.5) * r * 1.2) * H, rx = r * W * (0.6 + rnd() * 0.5), ry = r * W * 0.9 * (0.5 + rnd() * 0.4), ro = rnd() * 3;
    wrap(ex, X => { g.fillStyle = `rgba(74,72,70,${0.26 + rnd() * 0.12})`; g.beginPath(); g.ellipse(X, ey, rx, ry, ro, 0, 7); g.fill(); h.fillStyle = 'rgba(60,60,60,.18)'; h.beginPath(); h.ellipse(X, ey, rx, ry, ro, 0, 7); h.fill(); });
  }
  g.filter = 'none'; h.filter = 'none';
  // 크레이터: 높이 그림엔 움푹한 그릇 + 솟은 테두리, 색 그림엔 옅은 얼룩
  for (let i = 0; i < 420; i++) {
    const r = 1.5 + Math.pow(rnd(), 3.2) * 26, x = rnd() * W, y = H * (0.08 + rnd() * 0.84), sx = 1 / Math.max(0.35, Math.sin(Math.PI * y / H));
    wrap(x, X => {
      h.save(); h.translate(X, y); h.scale(sx, 1);
      const hg = h.createRadialGradient(0, 0, 0, 0, 0, r * 1.25);
      hg.addColorStop(0, 'rgba(0,0,0,.55)'); hg.addColorStop(0.7, 'rgba(0,0,0,.25)'); hg.addColorStop(0.8, 'rgba(255,255,255,.5)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      h.fillStyle = hg; h.beginPath(); h.arc(0, 0, r * 1.25, 0, 7); h.fill(); h.restore();
      g.save(); g.translate(X, y); g.scale(sx, 1);
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      cg.addColorStop(0, 'rgba(90,88,84,.12)'); cg.addColorStop(0.85, 'rgba(235,232,225,.1)'); cg.addColorStop(1, 'rgba(235,232,225,0)');
      g.fillStyle = cg; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore();
    });
  }
  // 티코 크레이터의 밝은 광조
  const tx = 0.24 * W, ty = 0.78 * H;
  g.strokeStyle = 'rgba(255,255,250,.1)';
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.28, l = 30 + rnd() * 130; g.lineWidth = 1 + rnd() * 2.5; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * l * 0.6, ty + Math.sin(a) * l); g.stroke(); }
  // 높이 그림을 살짝 뭉개서 요철이 부드럽게
  const hb = makeCanvas(W, H), hbg = hb.getContext('2d'); hbg.filter = 'blur(2px)'; hbg.drawImage(hc, 0, 0); hc.getContext('2d').drawImage(hb, 0, 0);
  const map = toTex(c); map.wrapS = THREE.RepeatWrapping;
  const bump = toTex(heightToNormal(hc, 3.0), false); bump.wrapS = THREE.RepeatWrapping;   // 요철 → 노멀맵
  return { map, bump };
}

// ── 기본 그림 A: 달을 향해 우는 늑대 실루엣 (직접 그린 원본) ──
function wolfCanvas() {
  const W = 512, H = 640, c = makeCanvas(W, H), g = c.getContext('2d');
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); };
  const ell = (x, y, rx, ry, r = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, 7); g.fill(); };
  // 앉아서 달을 향해 고개를 든 늑대 (오른쪽을 봄). 도형을 겹쳐 실루엣을 만듦
  function shape(dx = 0, dy = 0) {
    g.save(); g.translate(dx, dy);
    ell(185, 515, 92, 105, -0.2);                                                      // 뒷다리 허벅지
    poly([[110, 520], [150, 420], [215, 345], [280, 292], [330, 262], [366, 300], [360, 380], [340, 450], [300, 520], [230, 600]]); // 몸통
    poly([[288, 305], [300, 222], [330, 166], [372, 150], [396, 200], [382, 262], [362, 312]]); // 목
    ell(370, 160, 48, 38, -0.85);                                                     // 머리
    poly([[372, 132], [432, 78], [448, 86], [452, 98], [414, 160]]);                   // 위 주둥이 (굵게)
    poly([[404, 164], [440, 132], [444, 140], [420, 180]]);                            // 살짝 벌린 아래턱
    poly([[332, 146], [330, 104], [362, 130]]); poly([[350, 136], [358, 102], [376, 132]]); // 귀 (짧게, 뒤로 눕힘)
    poly([[305, 418], [346, 418], [350, 616], [366, 632], [324, 632], [318, 520]]);    // 앞다리
    poly([[284, 430], [318, 430], [320, 618], [306, 632], [282, 632], [292, 520]]);
    ell(242, 622, 48, 12);                                                            // 뒷발
    g.beginPath(); g.moveTo(118, 556); g.quadraticCurveTo(58, 596, 14, 612); g.quadraticCurveTo(44, 634, 128, 628); g.closePath(); g.fill(); // 꼬리
    poly([[300, 300], [318, 340], [296, 352], [312, 380], [290, 392]]);               // 가슴 털
    g.restore();
  }
  g.fillStyle = '#9fb8ee'; shape();                                                   // 달빛 테두리
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(420, 60, 120, 640); gr.addColorStop(0, '#273049'); gr.addColorStop(0.4, '#141927'); gr.addColorStop(1, '#090b12');
  g.fillStyle = gr; shape(-5, 4);
  g.globalCompositeOperation = 'source-over';
  // 털: 가장자리에서 바깥으로 잔털을 그림
  const img = g.getImageData(0, 0, W, H).data, A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : img[(y * W + x) * 4 + 3];
  g.lineWidth = 1.6; g.lineCap = 'round';
  for (let y = 2; y < H - 14; y += 2) for (let x = 2; x < W - 2; x += 2) {
    if (A(x, y) < 128) continue;
    const gx = A(x + 2, y) - A(x - 2, y), gy = A(x, y + 2) - A(x, y - 2), l = Math.hypot(gx, gy);
    if (l < 120 || rnd() > 0.55) continue;
    const i = (y * W + x) * 4, len = 3 + rnd() * 7, nx = -gx / l, ny = -gy / l;
    g.strokeStyle = `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`;
    g.beginPath(); g.moveTo(x - nx * 2, y - ny * 2); g.lineTo(x + nx * len + (rnd() - 0.5) * 3, y + ny * len + (rnd() - 0.5) * 3); g.stroke();
  }
  return { canvas: c, aspect: W / H };
}

// A 그림용 재질: 투명도 + 빛 가루로 흩어지는 효과
function dissolveMat(map) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { map: { value: map }, opacity: { value: 1 }, dissolve: { value: 0 }, glow: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `
      uniform sampler2D map; uniform float opacity, dissolve, glow; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.03) discard;
        float k = n(vUv*9.)*.55 + n(vUv*31.)*.3 + n(vUv*90.)*.15;
        k = k*.85 + (1.-vUv.y)*.15;                       // 위에서부터 먼저 흩어짐
        if (k < dissolve) discard;
        float edge = dissolve > 0.001 ? smoothstep(dissolve + .07, dissolve, k) : 0.;
        vec3 col = c.rgb + vec3(.55,.75,1.)*(edge*2.2 + glow*.25);
        gl_FragColor = vec4(col, c.a * opacity);
        #include <colorspace_fragment>
      }`,
  });
}

const _up = new THREE.Vector3(0, 1, 0);
export function createMoon(ctx) {
  const { group, world } = ctx;
  let photo = ctx.photo, built = false;
  let content, moon, moonMat, halo, stars, starTw = [], rock, aMesh, aMat, aSize, bMesh, bSize, mist = [], dust = [], rim;
  let celebT = -1, nowT = 0, shiverT = -9;
  const wolf = wolfCanvas(), wolfTex = toTex(wolf.canvas);
  const moonMap = moonMaps();

  function build() {
    built = true;
    content = new THREE.Group(); group.add(content);
    content.add(makeShadow(2.2));

    // 달: 진짜 구. 빛 방향(위상)에 따라 밝은 쪽이 정해지고, 크레이터 요철이 경계선에서 그림자를 만듦
    moonMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: moonMap.map }, bump: { value: moonMap.bump }, Lw: { value: new THREE.Vector3(0, 0, 1) }, nightA: { value: 0.5 } },
      vertexShader: `varying vec2 vUv; varying vec3 vO;
        void main(){ vUv = uv; vO = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `
        uniform sampler2D map, bump; uniform vec3 Lw; uniform float nightA; varying vec2 vUv; varying vec3 vO;
        void main(){
          vec3 o = normalize(vO);                                   // 달 자체 좌표의 표면 방향
          vec3 T = normalize(vec3(o.z, 0., -o.x) + vec3(1e-5)), B = cross(o, T);
          vec2 d = texture2D(bump, vUv).xy * 2. - 1.;
          vec3 nb = normalize(o + 0.9 * (d.x * T + d.y * B));
          float lit = smoothstep(-.03, .12, dot(o, Lw));
          vec3 tex = texture2D(map, vUv).rgb;
          vec3 day = tex * (.16 + 1.05 * max(dot(nb, Lw), 0.));
          vec3 night = tex * vec3(.05, .06, .085);              // 지구 반사광
          gl_FragColor = vec4(mix(night, day, lit), mix(nightA, 1., lit));
          #include <colorspace_fragment>
        }`,
    });
    moon = new THREE.Mesh(new THREE.SphereGeometry(MOON.r, 96, 64), moonMat);
    moon.position.set(MOON.x, MOON.y, MOON.z); moon.renderOrder = -3; world.add(moon);
    halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xbcd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.1 }));
    halo.position.set(MOON.x, MOON.y, MOON.z - 0.05); halo.scale.set(1.45, 1.45, 1); halo.renderOrder = -4; halo.userData.noBounds = true; world.add(halo);

    // 별
    const NS = 140, sp = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) {
      let x, y; do { x = (rnd() - 0.5) * 6; y = -0.2 + rnd() * 3.4; } while (Math.hypot(x - MOON.x, y - MOON.y) < MOON.r * 1.15);
      sp.set([x, y, -3 - rnd()], i * 3); starTw.push([rnd() * 6.28, 0.6 + rnd() * 2.5, 0.25 + rnd() * 0.75]);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.045, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    stars.renderOrder = -5; world.add(stars);

    // 달빛 (뒤에서 비추는 푸른 테두리 빛)
    rim = new THREE.DirectionalLight(0xa8c0ff, 0.6); rim.position.set(MOON.x, MOON.y + 0.5, -3); world.add(rim);

    // 바위 언덕
    const rg = new THREE.IcosahedronGeometry(1, 5), pos = rg.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = 1 + 0.12 * lumpy(v.x * 1.6, v.y * 1.6, v.z * 1.6) + 0.04 * lumpy(v.x * 6, v.y * 6, v.z * 6);
      v.multiplyScalar(d); v.y = Math.max(v.y, -0.1);
      if (v.y > 0.55) v.y = 0.55 + (v.y - 0.55) * 0.25;           // 윗면은 평평하게 (그림이 설 자리)
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    rg.computeVertexNormals();
    const rc = makeCanvas(256), rgc = rc.getContext('2d'); rgc.fillStyle = '#3a3f4a'; rgc.fillRect(0, 0, 256, 256); paintNoise(rgc, 256, 256, { octaves: 6, lo: 30, hi: 110, alpha: 0.7 });
    const rockMat = new THREE.MeshStandardMaterial({ map: toTex(rc), color: 0x8a92a6, roughness: 0.95, flatShading: true });
    rock = new THREE.Mesh(rg, rockMat); rock.scale.set(0.78, BASE / 0.62, 0.5); rock.position.y = 0.03; content.add(rock);
    for (const [x, z, s] of [[-0.85, 0.25, 0.14], [0.8, 0.3, 0.1], [0.62, -0.2, 0.17], [-0.6, -0.25, 0.12]]) {
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockMat); pebble.position.set(x, s * 0.45, z); pebble.rotation.set(rnd() * 3, rnd() * 3, 0); pebble.scale.y = 0.6; content.add(pebble);
    }
    // 풀
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.008, 0.12, 3), new THREE.MeshStandardMaterial({ color: 0x1f2b2a, roughness: 1 }), 160);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (let i = 0; i < 160; i++) {
      const a = rnd() * 6.28, r = 0.55 + rnd() * 0.55;
      p3.set(Math.cos(a) * r, 0.05, Math.sin(a) * r * 0.6); q.setFromEuler(e.set((rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6));
      grass.setMatrixAt(i, m.compose(p3, q, s3.set(1, 0.6 + rnd() * 1.2, 1)));
    }
    content.add(grass);

    // 그림 A (흐려짐) / 사진 B (또렷해짐) — 같은 자리
    aMat = dissolveMat(wolfTex);
    aMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), aMat); aMesh.renderOrder = 1; content.add(aMesh);
    bMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: photo.tex, transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    bMesh.renderOrder = 2; bMesh.visible = false; content.add(bMesh);   // 달 테마는 사진을 쓰지 않음
    applyExtra(); applyB();

    // 바닥 안개
    for (let i = 0; i < 9; i++) {
      const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x9db0d6, transparent: true, depthWrite: false, opacity: 0.1 }));
      sp2.userData = { x: (rnd() - 0.5) * 2.2, z: 0.1 + rnd() * 0.5, s: 0.7 + rnd() * 0.6, f: rnd() * 6, noBounds: true };
      content.add(sp2); mist.push(sp2);
    }
    // D-day 빛 가루
    for (let i = 0; i < 90; i++) {
      const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xcfe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      d.visible = false; d.userData = { u: rnd(), v: rnd(), d: rnd() * 0.8, vx: (rnd() - 0.2) * 0.35, vy: 0.25 + rnd() * 0.5, s: 0.02 + rnd() * 0.04, noBounds: true };
      content.add(d); dust.push(d);
    }
  }

  // 점점 또렷해지는 그림: 사용자가 넣은 사진(누끼). 사진이 없으면 기본 늑대 실루엣
  function applyExtra() {
    const own = photo && !photo.placeholder, tex = own ? photo.tex : wolfTex, aspect = own ? photo.aspect : wolf.aspect;
    aMat.uniforms.map.value = tex;
    aSize = fitSize(aspect, 1.15, 1.3);
    aMesh.scale.set(aSize.w, aSize.h, 1); aMesh.position.set(0, BASE + aSize.h / 2, 0.02);
  }
  function applyB() {
    bMesh.material.map = photo.tex; bMesh.material.color.set(photo.placeholder ? 0xdff2ff : 0xffffff); bMesh.material.needsUpdate = true;
    bSize = fitSize(photo.aspect, 1.0, 1.25);
    bMesh.scale.set(bSize.w, bSize.h, 1); bMesh.position.set(0, BASE + bSize.h / 2, 0.035);
  }

  return {
    word: '기울어짐',
    sounds: { click: 'wolfClick', dday: 'wolfDday' },   // 옐로스톤 국립공원 늑대 녹음 (NPS, 퍼블릭 도메인)
    setVariant() { if (!built) build(); },
    setPhoto(ph) { photo = ph; if (built) applyExtra(); },
    confetti: false,
    build() {},
    tick(dt, t, pp, celebrate) {
      nowT = t;
      let a = -1;
      if (celebrate) { if (celebT < 0) celebT = t; a = t - celebT; } else celebT = -1;
      const k = a >= 0 ? 1 : smooth(0.0, 0.97, pp);

      // 달: 보름달 → 점점 기울어 사라짐 (D-day엔 그믐, 거의 안 보임)
      const ph = lerp(0.05, Math.PI, k);
      moon.rotation.y = t * 0.02;
      moonMat.uniforms.Lw.value.set(Math.sin(ph), 0.15 * Math.sin(ph), Math.cos(ph)).normalize().applyAxisAngle(_up, -moon.rotation.y);   // 빛 방향을 달 자체 좌표로
      moonMat.uniforms.nightA.value = lerp(0.5, 0.08, k);
      halo.material.opacity = 0.04 + 0.26 * (1 - k) * (1 - k);
      rim.intensity = 0.3 + 1.0 * (1 - k);

      // 별: 달빛이 줄수록 더 많이·밝게
      const sc = stars.geometry.attributes.color;
      for (let i = 0; i < starTw.length; i++) { const [ph, sp, b] = starTw[i]; const v = b * (0.6 + 0.4 * Math.sin(t * sp + ph)) * (0.55 + 0.6 * k); sc.setXYZ(i, v, v, v * 1.08); }
      sc.needsUpdate = true;

      // 늑대: 처음엔 없다가 점점 또렷해짐. D-day엔 완전히 나타나 달빛 테두리가 한 번 빛남
      aMat.uniforms.opacity.value = a >= 0 ? 1 : smooth(0.02, 0.97, pp);
      aMat.uniforms.dissolve.value = 0;
      aMat.uniforms.glow.value = a >= 0 ? 0.6 * Math.exp(-0.8 * a) : 0;
      // 클릭: 늑대가 움찔
      const sa = t - shiverT;
      aMesh.position.x = sa < 0.8 ? Math.sin(sa * 70) * 0.012 * (1 - sa / 0.8) : 0;

      mist.forEach(m => { const u = m.userData; m.position.set(u.x + Math.sin(t * 0.15 + u.f) * 0.25, 0.12, u.z); m.scale.set(u.s * 1.6, u.s * 0.5, 1); m.material.opacity = 0.08 + 0.05 * Math.sin(t * 0.3 + u.f); });
    },
    poke() { if (celebT < 0) shiverT = nowT; return {}; },
    replay() { celebT = nowT; },
    bounds(box) { expandBounds(box, content); moon.updateMatrixWorld(); expandBounds(box, moon); },
  };
}
