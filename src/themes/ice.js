// 얼음 테마: 성에가 걷히며 사진이 또렷해지고, 마지막엔 위에서부터 녹아 사진이 밖으로 나옴
//   0.00 ~ 0.72  해동: 두꺼운 성에가 가운데부터 걷힘, 속의 금이 보임
//   0.45 ~       물방울이 흘러내리고 물웅덩이가 생김
//   0.60 ~ 1.00  위에서부터 차례로 녹아 내려감, 다 녹으면 사진이 바닥에 내려앉음
//   클릭         한 바퀴 휙 돌기
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { smooth, canvasTex, fbm, drawCracks, lumpy, dotTex, makeShadow, fitSize, makePhotoMesh, applyPhoto } from '../util.js';

const PHOTO_MAX = { w: 0.95, h: 1.35 };
const MARGIN = { side: 0.34, top: 0.26, bottom: 0.14, depth: 0.8 };
const THAW_END = 0.72;
const MELT_START = 0.6;
export const ICE_SHAPES = ['cube', 'ball', 'chunk'];   // 각얼음, 얼음 공, 수정 모양 얼음

// 수정 결정 모양: 육각기둥 + 비스듬히 깎인 뾰족한 끝. 녹을 때 위에서부터 잘리도록 세로로 촘촘히 나눔
// R: 모서리까지 반지름, H: 전체 높이, hbFrac: 기둥 부분 비율, jit: 끝 면마다 높낮이, apex: 꼭짓점 치우침
function crystalGeo(R, H, hbFrac, jit, apex) {
  const S = 6, bodySeg = 16, tipSeg = 10, hb = H * hbFrac, ht = H - hb;
  const rings = [];
  for (let i = 0; i <= bodySeg; i++) rings.push({ y: hb * i / bodySeg, r: R, cx: 0, cz: 0, f: 0 });
  for (let k = 1; k <= tipSeg; k++) { const f = k / tipSeg; rings.push({ y: hb + ht * f, r: R * (1 - f), cx: apex.x * R * f, cz: apex.z * R * f, f }); }
  const pos = [], uv = [], idx = [];
  rings.forEach(rg => {
    for (let j = 0; j <= S; j++) {
      const a = j / S * Math.PI * 2;
      const y = rg.y + jit[j % S] * 0.2 * ht * Math.sin(Math.PI * rg.f);
      pos.push(rg.cx + Math.cos(a) * rg.r, y, rg.cz + Math.sin(a) * rg.r);
      uv.push(j / S, y / H);
    }
  });
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < S; j++) {
    const a = r * (S + 1) + j, b = a + S + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const c = pos.length / 3; pos.push(0, 0, 0); uv.push(0.5, 0);            // 바닥 뚜껑
  for (let j = 0; j < S; j++) idx.push(c, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// 텍스처는 처음 한 번만 만들어 두고 재사용
let T = null;
function textures() {
  if (T) return T;
  const frostTex = canvasTex(512, (g, s) => {
    const n = fbm(s, 6), img = g.createImageData(s, s);
    for (let i = 0; i < n.length; i++) {
      const k = Math.pow(n[i], 1.4);
      img.data[i * 4] = 95 + k * 160; img.data[i * 4 + 1] = 150 + k * 105; img.data[i * 4 + 2] = 205 + k * 50;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    drawCracks(g, s, 14, 0.85);
  });
  frostTex.wrapS = frostTex.wrapT = THREE.RepeatWrapping;
  // 해동 순서 지도: 값이 작은 곳부터 성에가 걷힘 (가운데 먼저, 가장자리는 오래 남음)
  const thawNoise = fbm(256, 5);
  const makeThaw = (sides) => canvasTex(256, (g, s) => {
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const ex = sides ? Math.min(x, s - 1 - x) / (s / 2) : 1, ey = Math.min(y, s - 1 - y) / (s / 2);
      const edge = 1 - Math.min(ex, ey);
      const v = Math.min(1, thawNoise[y * s + x] * 0.62 + Math.pow(edge, 1.6) * 0.5);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  const crackTex = canvasTex(1024, (g, s) => { g.clearRect(0, 0, s, s); drawCracks(g, s, 22, 1); });
  T = { frostTex, thawTex: makeThaw(true), thawTexBall: makeThaw(false), crackTex };
  return T;
}

export function createIce(ctx) {
  const { group, world } = ctx;
  const { frostTex, thawTex, thawTexBall, crackTex } = textures();
  let shape = 'cube';

  // ── 재질 ──
  const iceMat = new THREE.MeshPhysicalMaterial({
    color: 0xf2faff, transmission: 1, thickness: 0.9, ior: 1.31,
    roughness: 0.12, metalness: 0,
    attenuationColor: new THREE.Color(0x9fd3ff), attenuationDistance: 1.8,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.0,
    bumpMap: frostTex, bumpScale: 3, roughnessMap: frostTex,
  });
  const thaw = { value: -0.2 };
  const frostMat = new THREE.MeshBasicMaterial({ map: frostTex, alphaMap: thawTex, transparent: true, depthWrite: false, color: 0xeef7ff });
  frostMat.onBeforeCompile = (sh) => {
    sh.uniforms.uThaw = thaw;
    sh.fragmentShader = 'uniform float uThaw;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', `
      #ifdef USE_ALPHAMAP
        float th = texture2D( alphaMap, vAlphaMapUv ).g;
        diffuseColor.a *= smoothstep( uThaw - 0.12, uThaw + 0.12, th ) * 0.96;
      #endif`);
  };
  frostMat.customProgramCacheKey = () => 'frost-thaw';
  const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false, opacity: 0 });
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x9fd4ff, transparent: true, opacity: 0.55, roughness: 0.03,
    metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false,
  });

  // ── 물체 ──
  const shadow = makeShadow(); group.add(shadow);
  const puddle = new THREE.Mesh(new THREE.BufferGeometry(), waterMat); puddle.position.y = 0.004; group.add(puddle);
  const photo = makePhotoMesh(ctx.photo); group.add(photo);
  const ice = new THREE.Mesh(new THREE.BufferGeometry(), iceMat);
  const cracks = new THREE.Mesh(new THREE.BufferGeometry(), crackMat);
  const frost = new THREE.Mesh(new THREE.BufferGeometry(), frostMat);
  cracks.renderOrder = 1; frost.renderOrder = 2;
  group.add(ice, cracks, frost);

  let photoSize = fitSize(ctx.photo.aspect, PHOTO_MAX.w, PHOTO_MAX.h);
  let base = { w: 1, h: 1, d: 1 }, iceDims = { ...base };
  let photoY = MARGIN.bottom, curPhotoY = photoY;
  let lastP = 0;
  const crystalJit = [1.0, -0.4, 0.5, -0.9, 0.2, -0.6];   // 수정 끝 면의 높낮이 (모양 고정)

  function updateBase() {
    const pw = photoSize.w, ph = photoSize.h;
    if (shape === 'ball') {
      const rx = pw / 2 * 1.42 + 0.08, ry = ph / 2 * 1.42 + 0.08;
      base = { w: rx * 2, h: ry * 2, d: rx * 2 };              // 위에서 보면 동그랗게 (앞·옆 너비 같음)
      photoY = ry - ph / 2;
    } else if (shape === 'chunk') {
      // 사진이 육각기둥 안에 들어가고, 위쪽 뾰족한 끝은 사진 머리 위로 솟음
      const R0 = pw / 2 + 0.17, hb = MARGIN.bottom + ph * 0.92 + 0.04, ht = R0 * 1.1;
      base = { w: 2 * R0, h: hb + ht, d: Math.sqrt(3) * R0, hbFrac: hb / (hb + ht) };
      photoY = MARGIN.bottom;
    } else {
      base = { w: pw + MARGIN.side, h: ph + MARGIN.top + MARGIN.bottom, d: pw + MARGIN.side };   // 앞·옆 너비 같게
      photoY = MARGIN.bottom;
    }
    frostMat.alphaMap = shape === 'ball' ? thawTexBall : thawTex;
    frostMat.needsUpdate = true;
    group.scale.setScalar(Math.min(1, (shape === 'chunk' ? 1.75 : 1.95) / base.h, 1.8 / base.w));
  }

  function shell(geo, k) {
    const g = geo.clone();
    const lift = g.boundingBox.min.y, midY = (g.boundingBox.max.y + lift) / 2;
    g.translate(0, -midY, 0); g.scale(k, k, k); g.translate(0, midY, 0);
    return g;
  }
  const meltOf = (p) => Math.pow(Math.min(1, Math.max(0, (p - MELT_START) / (1 - MELT_START))), 1.1);

  function layoutPhoto() {
    photo.scale.set(photoSize.w, photoSize.h, 1);
    photo.position.set(0, curPhotoY + photoSize.h / 2, 0);
  }

  function build(p) {
    lastP = p;
    const m = meltOf(p);
    const late = smooth(0.8, 1, m);
    const w = base.w * (1 - 0.08 * m - 0.4 * late);
    const d = base.d * (1 - 0.1 * m - 0.4 * late);
    const h = base.h;
    const top = Math.max(0.04, base.h * (1 - 0.95 * m));
    const radius = Math.min(0.045, Math.min(w, h, d) / 2 - 0.002);
    iceDims = { w, h: top, d };
    curPhotoY = photoY + (0.015 - photoY) * smooth(0.7, 1, m);
    layoutPhoto();

    let geo;
    if (shape === 'ball') { geo = new THREE.SphereGeometry(0.5, 64, 48); geo.scale(w, h, d); }
    else if (shape === 'chunk') {
      geo = crystalGeo(w / 2, h, base.hbFrac, crystalJit, { x: 0.32, z: -0.15 });
      geo.scale(1, 1, d / (Math.sqrt(3) * w / 2));
      geo.translate(0, -h / 2, 0);
    }
    else geo = new RoundedBoxGeometry(w, h, d, 8, radius);
    geo.translate(0, h / 2, 0);
    const pos = geo.attributes.position, v = new THREE.Vector3();
    const chunk = shape === 'chunk';
    const band = Math.min(0.09, top * 0.5);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ny = v.y / h;
      if (m > 0) {
        const ripple = Math.sin(v.x * 7.3 + v.z * 3.1) * Math.cos(v.z * 6.7 - v.x * 2.3) * 0.018 * Math.min(1, m * 4);
        if (v.y > top) v.y = top + ripple;
        const t = smooth(top - band, top, v.y);
        const pull = 1 - 0.07 * t * t * Math.min(1, m * 5);
        v.x *= pull; v.z *= pull;
        const foot = 1 + 0.05 * m * (1 - smooth(0, 0.12, v.y));
        v.x *= foot; v.z *= foot;
        v.x += Math.sign(v.x) * Math.max(0, Math.sin(v.z * 23 + 1.3)) * 0.012 * m * (1 - ny);
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    if (chunk) { geo = geo.toNonIndexed(); geo.computeVertexNormals(); }   // 면마다 각진 결정 느낌
    else if (m > 0) geo.computeVertexNormals();
    geo.computeBoundingBox();

    ice.geometry.dispose(); ice.geometry = geo;
    frost.geometry.dispose(); frost.geometry = shell(geo, 1.012);
    cracks.geometry.dispose(); cracks.geometry = shell(geo, 1.005);

    const f = smooth(0, THAW_END, p);
    thaw.value = -0.1 + 0.98 * f;
    frostMat.opacity = 1 - m * 0.9;
    crackMat.opacity = smooth(0.05, 0.45, p) * (1 - m);
    iceMat.roughness = 0.12 - f * 0.05 + m * 0.06;
    ice.visible = frost.visible = cracks.visible = m < 0.99;
    buildPuddle(p);
    // 녹을수록 그림자는 얼음과 함께 작아지고 옅어짐 (커지면 화면 밖까지 번져 네모나게 보였음)
    shadow.scale.setScalar((0.62 - m * 0.22) * (base.w / 1.2 + 0.3));
    shadow.material.opacity = 1 - m * 0.65;
  }

  const puddleSeed = Array.from({ length: 7 }, () => Math.random() * Math.PI * 2);
  function buildPuddle(p) {
    const wet = smooth(0.45, 1, p);
    puddle.visible = wet > 0.02;
    if (!puddle.visible) return;
    const R = base.w * (0.42 + 0.75 * Math.pow(wet, 0.8));
    const s = new THREE.Shape(), N = 72;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      let r = R;
      puddleSeed.forEach((sd, k) => { r += Math.sin(a * (k + 2) + sd) * R * 0.045; });
      const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
      i === 0 ? s.moveTo(x, z) : s.lineTo(x, z);
    }
    const g = new THREE.ShapeGeometry(s, 1);
    g.rotateX(Math.PI / 2);
    puddle.geometry.dispose(); puddle.geometry = g;
    waterMat.opacity = 0.4 + 0.35 * wet;
  }

  // ── 물방울 ──
  const dropGeo = new THREE.SphereGeometry(0.03, 12, 10); dropGeo.scale(1, 1.4, 1);
  const ringGeo = new THREE.RingGeometry(0.06, 0.075, 32); ringGeo.rotateX(-Math.PI / 2);
  const drops = [], rings = [];
  let dropTimer = 0;
  function spawnDrop() {
    const { w, h, d } = iceDims;
    const side = Math.floor(Math.random() * 4), t = (Math.random() - 0.5) * 0.8;
    const x = side < 2 ? (side ? 1 : -1) * w / 2 * 1.03 : t * w;
    const z = side < 2 ? t * d : (side === 2 ? 1 : -1) * d / 2 * 1.04;
    const m = new THREE.Mesh(dropGeo, waterMat.clone());
    m.material.opacity = 0.85;
    m.position.set(x, h * (0.35 + Math.random() * 0.5), z);
    m.userData = { v: 0, hold: Math.random() * 1.5 };
    group.add(m); drops.push(m);
  }
  function spawnRing(x, z) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    m.position.set(x * 1.12, 0.008, z * 1.12);
    m.userData = { life: 0 };
    group.add(m); rings.push(m);
  }

  // ── 날리는 눈 (회전하지 않는 world에 둠) ──
  const SNOW = 90;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3), snowVel = [];
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 3; snowPos[i * 3 + 1] = Math.random() * 3; snowPos[i * 3 + 2] = (Math.random() - 0.5) * 1.6;
    snowVel.push({ v: 0.06 + Math.random() * 0.12, s: Math.random() * 6 });
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowMat = new THREE.PointsMaterial({ map: dotTex, size: 0.045, transparent: true, depthWrite: false, opacity: 0.85 });
  const snow = new THREE.Points(snowGeo, snowMat);
  world.add(snow);

  updateBase(); build(0);

  return {
    word: '해동',
    setVariant(v) {
      const s = ICE_SHAPES.includes(v) ? v : 'cube';
      if (s === shape) return;
      shape = s; updateBase(); build(lastP);
    },
    setPhoto(ph) {
      applyPhoto(photo, ph);
      photoSize = fitSize(ph.aspect, PHOTO_MAX.w, PHOTO_MAX.h);
      updateBase(); build(lastP);
    },
    build,
    tick(dt, t, p, celebrate) {
      // 물방울
      const m = meltOf(p);
      if (!celebrate && p > 0.45 && m < 0.985) {
        dropTimer += dt * (0.15 + (p - 0.45) * 0.8 + 1.8 * m);
        while (dropTimer > 1) { dropTimer -= 1; spawnDrop(); }
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (d.userData.hold > 0) { d.userData.hold -= dt; continue; }
        d.userData.v += dt * 0.9;
        d.position.y -= d.userData.v * dt;
        if (d.position.y <= 0.03) { spawnRing(d.position.x, d.position.z); group.remove(d); d.material.dispose(); drops.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.userData.life += dt;
        const k = r.userData.life / 1.1;
        r.scale.setScalar(1 + k * 4);
        r.material.opacity = 0.6 * (1 - k);
        if (k >= 1) { group.remove(r); r.material.dispose(); rings.splice(i, 1); }
      }
      // 눈
      snowMat.opacity = 0.85 * (1 - smooth(0.6, 0.95, p));
      snow.visible = snowMat.opacity > 0.02 && !celebrate;
      if (snow.visible) {
        for (let i = 0; i < SNOW; i++) {
          const s = snowVel[i];
          snowPos[i * 3 + 1] -= s.v * dt;
          snowPos[i * 3] += Math.sin(t * 0.8 + s.s) * 0.04 * dt;
          if (snowPos[i * 3 + 1] < 0) { snowPos[i * 3 + 1] = 3; snowPos[i * 3] = (Math.random() - 0.5) * 3; }
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
      // D-day: 사진이 통통
      if (celebrate) {
        photo.position.y = curPhotoY + photoSize.h / 2 + Math.abs(Math.sin(t * 2.6)) * 0.12;
        photo.rotation.z = Math.sin(t * 2.6) * 0.06;
      } else { photo.rotation.z = 0; layoutPhoto(); }
    },
    // 클릭: 한 바퀴 휙 (회전은 공통 쪽에서 처리)
    poke() { return { spin: 20.2 }; },
    bounds(box) {
      box.expandByObject(photo);
      if (ice.visible) box.expandByObject(ice);
    },
  };
}
