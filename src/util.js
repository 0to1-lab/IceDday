// 여러 테마가 같이 쓰는 도구들
import * as THREE from 'three';

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;

// 캔버스에 그린 그림을 텍스처로
export function canvasTex(size, draw, color = true, h = size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = h;
  draw(c.getContext('2d'), size, h);
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 값 노이즈 (여러 겹)
export function fbm(size, octaves = 5) {
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o, grid = Array.from({ length: (g + 1) * (g + 1) }, Math.random);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * g, fy = y / size * g, ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = grid[iy * (g + 1) + ix], b = grid[iy * (g + 1) + ix + 1];
      const c = grid[(iy + 1) * (g + 1) + ix], d = grid[(iy + 1) * (g + 1) + ix + 1];
      out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// 금 그리기 (갈라지는 선)
export function drawCracks(g, s, count, alpha, color = '255,255,255') {
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    g.strokeStyle = `rgba(${color},${alpha * (0.5 + 0.5 * w / 2.4)})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      ang += (Math.random() - 0.5) * 0.8;
      x += Math.cos(ang) * len / 7; y += Math.sin(ang) * len / 7;
      g.lineTo(x, y);
      if (depth < 3 && Math.random() < 0.25) branch(x, y, ang + (Math.random() < 0.5 ? 1 : -1) * (0.6 + Math.random()), len * 0.5, w * 0.6, depth + 1);
    }
    g.stroke();
  };
  for (let i = 0; i < count; i++) branch(Math.random() * s, Math.random() * s, Math.random() * Math.PI * 2, s * (0.25 + Math.random() * 0.35), 1.2 + Math.random() * 1.6, 0);
}

// 위치마다 일정한 값을 주는 간단한 노이즈
export const lumpy = (x, y, z) => Math.sin(x * 3.7 + y * 1.3 + 0.5) * Math.cos(z * 4.1 - x * 2.2) + Math.sin(y * 5.3 + z * 2.9) * 0.5 + Math.cos(x * 9.1 - z * 7.3) * 0.25;

// 둥근 빛 점 (눈, 반짝이, 불티)
export const dotTex = canvasTex(64, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});

// 바닥 그림자
export const shadowTex = canvasTex(256, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(0,30,60,0.45)');
  grd.addColorStop(0.6, 'rgba(0,30,60,0.15)');
  grd.addColorStop(1, 'rgba(0,30,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
});
export function makeShadow(size = 3) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.001;
  m.userData.noBounds = true;   // 클릭 영역 계산에서 뺌
  return m;
}

// 사진 크기 맞추기 (최대 가로·세로 안에 비율 유지)
export function fitSize(aspect, maxW, maxH) {
  let w = maxW, h = w / aspect;
  if (h > maxH) { h = maxH; w = h * aspect; }
  return { w, h };
}

// 사진 판 (누끼 사진: 투명한 곳은 그리지 않음)
export function makePhotoMesh(photo) {
  const mat = new THREE.MeshBasicMaterial({ map: photo.tex, alphaTest: 0.5, side: THREE.DoubleSide, toneMapped: false });
  if (photo.placeholder) mat.color.set(0xdff2ff);
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
}
export function applyPhoto(mesh, photo) {
  mesh.material.map = photo.tex;
  mesh.material.color.set(photo.placeholder ? 0xdff2ff : 0xffffff);
  mesh.material.needsUpdate = true;
}

// 물체를 통째로 정리 (사진 텍스처는 공유하므로 남김)
export function disposeTree(obj, keep = new Set()) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    mats.forEach(m => {
      for (const k in m) { const v = m[k]; if (v && v.isTexture && !keep.has(v)) v.dispose(); }
      m.dispose();
    });
  });
}

// 떠오르는 입자(김, 연기, 불티)를 관리하는 작은 도구
export function makePuffs(parent, { count = 24, color = 0xffffff, size = 0.25, opacity = 0.5, additive = false } = {}) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTex, color, transparent: true, opacity: 0, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    sp.visible = false; sp.userData = { life: 1, max: 1 };
    parent.add(sp); list.push(sp);
  }
  let timer = 0;
  return {
    // origin: 시작 위치 함수, rate: 초당 개수, rise: 오르는 속도
    tick(dt, rate, origin, { rise = 0.35, spread = 0.12, grow = 1.8, life = 2.2 } = {}) {
      timer += dt * rate;
      while (timer > 1) {
        timer -= 1;
        const sp = list.find(s => !s.visible);
        if (!sp) break;
        const o = origin();
        sp.position.copy(o); sp.visible = true;
        sp.userData = { life: 0, max: life * (0.7 + Math.random() * 0.6), vx: (Math.random() - 0.5) * spread, vz: (Math.random() - 0.5) * spread, rise, grow };
      }
      for (const sp of list) {
        if (!sp.visible) continue;
        const u = sp.userData; u.life += dt;
        const k = u.life / u.max;
        if (k >= 1) { sp.visible = false; continue; }
        sp.position.x += u.vx * dt; sp.position.z += u.vz * dt; sp.position.y += u.rise * dt;
        const s = size * (1 + k * u.grow);
        sp.scale.set(s, s, 1);
        sp.material.opacity = opacity * Math.sin(Math.PI * k);
      }
    },
    hide() { list.forEach(s => { s.visible = false; }); },
  };
}

// 클릭 영역 계산: 그림자 같은 장식은 빼고, 보이는 물체만 범위에 넣음
export function expandBounds(box, obj) {
  obj.traverse(o => {
    if (!o.isMesh || o.userData.noBounds) return;
    let vis = true; for (let q = o; q; q = q.parent) if (!q.visible) { vis = false; break; }
    if (!vis) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    box.union(b);
  });
}

// ───────── 질감 도구 ─────────

// 빈 캔버스
export function makeCanvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function toTex(canvas, color = true, repeat = null) {
  const t = new THREE.CanvasTexture(canvas);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// 높이 그림(밝을수록 높음) → 요철 노멀맵. 빛이 비칠 때 실제처럼 울퉁불퉁해 보이게 함
export function heightToNormal(src, strength = 2, wrap = true) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h);
  const H = (x, y) => {
    if (wrap) { x = (x + w) % w; y = (y + h) % h; } else { x = Math.min(w - 1, Math.max(0, x)); y = Math.min(h - 1, Math.max(0, y)); }
    return d[(y * w + x) * 4] / 255;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    img.data[i] = (dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

// 회색 노이즈를 캔버스에 칠하기 (lo~hi 밝기)
export function paintNoise(g, w, h, { octaves = 5, lo = 0, hi = 255, alpha = 1, size = 256 } = {}) {
  const n = fbm(size, octaves), tmp = makeCanvas(size), tg = tmp.getContext('2d'), img = tg.createImageData(size, size);
  for (let i = 0; i < n.length; i++) { const v = lo + (hi - lo) * n[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  tg.putImageData(img, 0, 0);
  g.save(); g.globalAlpha = alpha; g.drawImage(tmp, 0, 0, w, h); g.restore();
}

// 아주 작은 점들 (기공, 얼룩, 밀가루 등)
export function speckle(g, w, h, count, rMin, rMax, color) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = typeof color === 'function' ? color() : color;
    const r = rMin + Math.random() * (rMax - rMin);
    g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); g.fill();
  }
}

// 그림자: 어떤 물체가 그림자를 드리울지 (불투명하고 빛을 받는 재질만)
export function markShadows(obj) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const solid = m && !m.isMeshBasicMaterial && !m.transparent && !(m.transmission > 0) && m.side !== THREE.BackSide && !o.userData.noShadow;
    o.castShadow = solid;
    o.receiveShadow = solid;
  });
}

// ───────── 누끼 사진 테두리 따기 ─────────
// 사진에서 불투명한 부분(가장 큰 덩어리)의 외곽선을 따서, 가로·세로 중 긴 쪽이 1인 좌표로 돌려줌
// 결과: { points: [Vector2...], w, h, uvOf(x, y) } 또는 실패하면 null
export function silhouette(image, maxSize = 140) {
  try {
    const iw = image.width || image.naturalWidth, ih = image.height || image.naturalHeight;
    if (!iw || !ih) return null;
    const k = Math.min(1, maxSize / Math.max(iw, ih));
    const mw = Math.max(8, Math.round(iw * k)), mh = Math.max(8, Math.round(ih * k));
    const W = mw + 2, H = mh + 2;                                  // 가장자리 1칸 여유
    const c = makeCanvas(W, H), g = c.getContext('2d');
    g.drawImage(image, 1, 1, mw, mh);
    const d = g.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    // 가장 큰 덩어리만 남김
    const label = new Int32Array(W * H); let best = 0, bestSize = 0, id = 0;
    for (let i = 0; i < W * H; i++) {
      if (!mask[i] || label[i]) continue;
      id++; let size = 0; const st = [i]; label[i] = id;
      while (st.length) {
        const q = st.pop(); size++;
        const x = q % W, y = (q / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, n = ny * W + nx;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && mask[n] && !label[n]) { label[n] = id; st.push(n); }
        }
      }
      if (size > bestSize) { bestSize = size; best = id; }
    }
    if (bestSize < 30) return null;
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === best;
    // 외곽선 따라가기 (Moore 이웃 추적)
    let sx = -1, sy = -1;
    for (let i = 0; i < W * H && sx < 0; i++) if (label[i] === best) { sx = i % W; sy = (i / W) | 0; }
    const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const pts = [];
    let px = sx, py = sy, bx = sx - 1, by = sy;
    for (let guard = 0; guard < 40000; guard++) {
      pts.push([px, py]);
      let k0 = D.findIndex(([dx, dy]) => px + dx === bx && py + dy === by);
      let found = false;
      for (let i = 1; i <= 8; i++) {
        const nk = (k0 + i) % 8, qx = px + D[nk][0], qy = py + D[nk][1];
        if (on(qx, qy)) { const pk = (nk + 7) % 8; bx = px + D[pk][0]; by = py + D[pk][1]; px = qx; py = qy; found = true; break; }
      }
      if (!found || (px === sx && py === sy && pts.length > 2)) break;
    }
    if (pts.length < 8) return null;
    // 단순화 (RDP) → 부드럽게 (Chaikin)
    const rdp = (a, eps) => {
      if (a.length < 3) return a;
      const [x1, y1] = a[0], [x2, y2] = a[a.length - 1];
      let dmax = 0, idx = 0; const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      for (let i = 1; i < a.length - 1; i++) { const dd = Math.abs((y2 - y1) * a[i][0] - (x2 - x1) * a[i][1] + x2 * y1 - y2 * x1) / L; if (dd > dmax) { dmax = dd; idx = i; } }
      return dmax > eps ? rdp(a.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(a.slice(idx), eps)) : [a[0], a[a.length - 1]];
    };
    const half = pts.length >> 1;
    let poly = rdp(pts.slice(0, half + 1), 0.9).slice(0, -1).concat(rdp(pts.slice(half).concat([pts[0]]), 0.9).slice(0, -1));
    for (let it = 0; it < 2; it++) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      poly = out;
    }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const S = Math.max(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const points = poly.map(([x, y]) => new THREE.Vector2((x - cx) / S, -(y - cy) / S));
    return {
      points, w: (x1 - x0) / S, h: (y1 - y0) / S,
      // 위 좌표 → 원래 사진의 텍스처 좌표
      uvOf: (X, Y) => new THREE.Vector2((X * S + cx - 1) / mw, 1 - (-Y * S + cy - 1) / mh),
    };
  } catch (e) { return null; }
}
