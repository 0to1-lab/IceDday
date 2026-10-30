// 윈도우용 자동 누끼
// 1) 배경이 단색에 가까우면 → 가장자리에서부터 그 색을 지움 (캐릭터·물건 사진에 좋음)
// 2) 아니면 → MediaPipe 사람 분리 모델 (기기 안에서 처리, 인터넷 전송 없음)
// 결과는 주인공 부분만 잘라낸 PNG(data URL)
(function () {
  const MAX = 1400;
  const MP_BASE = window.ICE_MP_BASE || '../node_modules/@mediapipe/selfie_segmentation/';   // 소개 페이지에선 다른 위치에서 읽음

  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('사진을 열 수 없어요'));
      img.src = url;
    });
  }

  function toCanvas(img) {
    const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  // ───────── 1. 단색 배경 ─────────
  function borderColor(d, w, h) {
    const px = [];
    const step = Math.max(1, Math.round((w + h) / 400));
    const push = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] > 10) px.push([d[i], d[i + 1], d[i + 2]]); };
    for (let x = 0; x < w; x += step) { push(x, 0); push(x, 1); push(x, h - 1); push(x, h - 2); }
    for (let y = 0; y < h; y += step) { push(0, y); push(1, y); push(w - 1, y); push(w - 2, y); }
    if (px.length < 8) return null;
    const med = [0, 1, 2].map(k => px.map(p => p[k]).sort((a, b) => a - b)[px.length >> 1]);
    const near = px.filter(p => dist(p[0], p[1], p[2], med) < 40).length / px.length;
    return { color: med, uniform: near };
  }
  function dist(r, g, b, c) { const dr = r - c[0], dg = g - c[1], db = b - c[2]; return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7; }

  function keyOut(canvas, bg) {
    const w = canvas.width, h = canvas.height, g = canvas.getContext('2d', { willReadFrequently: true });
    const im = g.getImageData(0, 0, w, h), d = im.data;
    const TOL = 34, HARD = TOL * 0.55, REACH = TOL * 1.5;
    const D = new Float32Array(w * h);
    for (let i = 0, j = 0; i < w * h; i++, j += 4) D[i] = d[j + 3] < 10 ? 0 : dist(d[j], d[j + 1], d[j + 2], bg);
    // 가장자리와 이어진 배경색 영역만 지움 (주인공 안쪽의 같은 색은 남김)
    // 선 그림(흰 캐릭터 + 검은 테두리)은 테두리에 작은 틈이 있으면 안쪽까지 지워지므로,
    // 테두리를 r픽셀 두껍게 한 '벽'을 세워 그 벽을 넘지 못하게 지운 뒤, 벽 두께만큼만 다시 깎아 냄
    const r = Math.max(2, Math.round(Math.max(w, h) / 450));
    const wall = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) wall[i] = D[i] >= TOL ? 1 : 0;
    for (let k = 0; k < r; k++) {                // 벽 두껍게 (한 번에 1픽셀씩)
      const prev = wall.slice();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (prev[i]) continue;
        if ((x > 0 && prev[i - 1]) || (x < w - 1 && prev[i + 1]) || (y > 0 && prev[i - w]) || (y < h - 1 && prev[i + w])) wall[i] = 2;
      }
    }
    const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
    let qh = 0, qt = 0;
    const seed = i => { if (!seen[i] && !wall[i] && D[i] < REACH) { seen[i] = 1; q[qt++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      if (D[i] >= TOL) continue;               // 경계 부근은 퍼뜨리지 않음
      if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1);
      if (y > 0) seed(i - w); if (y < h - 1) seed(i + w);
    }
    // 벽 두께로 덮였던 바깥쪽 배경을 r+1 단계만 더 지움 (틈으로는 r픽셀까지만 들어가서 안쪽은 안전)
    let front = [];
    for (let i = 0; i < w * h; i++) if (seen[i] && D[i] < TOL) front.push(i);
    for (let k = 0; k <= r && front.length; k++) {
      const next = [];
      for (const i of front) {
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j < 0 || j >= w * h || seen[j] || D[j] >= REACH) continue;   // 테두리 옆 흐린 픽셀은 반투명으로
          seen[j] = 1; if (D[j] < TOL) next.push(j);
        }
      }
      front = next;
    }
    let fg = 0;
    for (let i = 0; i < w * h; i++) {
      let a = 255;
      if (seen[i]) a = Math.round(255 * Math.min(1, Math.max(0, (D[i] - HARD) / (REACH - HARD))));
      d[i * 4 + 3] = Math.min(d[i * 4 + 3], a);
      if (d[i * 4 + 3] > 128) fg++;
    }
    g.putImageData(im, 0, 0);
    return fg / (w * h);
  }

  // ───────── 2. 사람 분리 (MediaPipe) ─────────
  let seg = null, segReady = null;
  function getSeg() {
    if (segReady) return segReady;
    segReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = MP_BASE + 'selfie_segmentation.js';
      s.onload = async () => {
        try {
          seg = new window.SelfieSegmentation({ locateFile: f => MP_BASE + ((window.ICE_MP_MAP && window.ICE_MP_MAP[f]) || f) });
          seg.setOptions({ modelSelection: 0, selfieMode: false });
          await seg.initialize();
          res(seg);
        } catch (e) { rej(e); }
      };
      s.onerror = () => rej(new Error('누끼 모델을 불러오지 못했어요'));
      document.head.appendChild(s);
    });
    return segReady;
  }

  async function personMask(canvas) {
    const s = await getSeg();
    const mask = await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('누끼 시간 초과')), 20000);
      s.onResults(r => { clearTimeout(to); res(r.segmentationMask); });
      s.send({ image: canvas }).catch(rej);
    });
    const w = canvas.width, h = canvas.height;
    const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
    const mg = mc.getContext('2d', { willReadFrequently: true });
    mg.imageSmoothingQuality = 'high';
    mg.drawImage(mask, 0, 0, w, h);
    const m = mg.getImageData(0, 0, w, h).data;
    const g = canvas.getContext('2d', { willReadFrequently: true }), im = g.getImageData(0, 0, w, h), d = im.data;
    let fg = 0;
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(m[i * 4], m[i * 4 + 3] < 255 ? m[i * 4 + 3] : 0) / 255;   // 버전마다 빨강 또는 알파에 담김
      const a = Math.min(1, Math.max(0, (v - 0.45) / 0.3));
      const sa = a * a * (3 - 2 * a);
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * sa);
      if (sa > 0.5) fg++;
    }
    fg = keepLargest(d, w, h);
    g.putImageData(im, 0, 0);
    return fg / (w * h);
  }

  // 떨어져 있는 작은 조각(배경 오인식)을 지우고 가장 큰 덩어리만 남김
  function keepLargest(d, w, h) {
    const lab = new Int32Array(w * h), q = new Int32Array(w * h), sizes = [0];
    for (let i = 0; i < w * h; i++) {
      if (lab[i] || d[i * 4 + 3] < 64) continue;
      const id = sizes.length; let qh = 0, qt = 0, n = 0;
      lab[i] = id; q[qt++] = i;
      while (qh < qt) {
        const k = q[qh++], x = k % w; n++;
        const nb = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w];
        for (const j of nb) if (j >= 0 && j < w * h && !lab[j] && d[j * 4 + 3] >= 64) { lab[j] = id; q[qt++] = j; }
      }
      sizes.push(n);
    }
    let best = 0;
    for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;
    if (!best) return 0;
    const keep = id => id === best || sizes[id] > sizes[best] * 0.25;   // 비슷하게 큰 덩어리(두 사람 등)는 남김
    for (let i = 0; i < w * h; i++) {
      const id = lab[i];
      if (id && !keep(id)) d[i * 4 + 3] = 0;
      else if (!id && d[i * 4 + 3] > 0) {      // 반투명 가장자리: 이웃이 남은 덩어리일 때만 유지
        const x = i % w, nbs = [i - 1, i + 1, i - w, i + w].filter(j => j >= 0 && j < w * h && (Math.abs((j % w) - x) <= 1));
        if (!nbs.some(j => lab[j] && keep(lab[j]))) d[i * 4 + 3] = 0;
      }
    }
    let fg = 0;
    for (let i = 0; i < w * h; i++) if (d[i * 4 + 3] > 128) fg++;
    return fg;
  }

  // 투명 부분을 잘라내고 주인공만 남김
  function crop(canvas) {
    const w = canvas.width, h = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { canvas.fill = 0; return canvas; }
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * w + x) * 4 + 3] > 128) n++;
    const pad = 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
    c.getContext('2d', { willReadFrequently: true }).drawImage(canvas, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    c.fill = n / (c.width * c.height);     // 잘라낸 네모 안에서 주인공이 차지하는 비율
    return c;
  }

  // 이미 배경이 투명한 사진(PNG)이면 그대로 씀
  function hasAlpha(canvas) {
    const w = canvas.width, h = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let t = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] < 200) t++;
    return t / (d.length / 16) > 0.05;
  }

  window.IceCutout = async function (url) {
    const img = await loadImage(url);
    const base = toCanvas(img);
    if (hasAlpha(base)) return { url: crop(base).toDataURL('image/png'), method: 'alpha' };
    const copy = () => { const c = document.createElement('canvas'); c.width = base.width; c.height = base.height; c.getContext('2d', { willReadFrequently: true }).drawImage(base, 0, 0); return c; };

    const d = base.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, base.width, base.height).data;
    const bc = borderColor(d, base.width, base.height);
    if (bc && bc.uniform > 0.8) {
      const c = copy();
      const fg = keyOut(c, bc.color);
      if (fg > 0.03 && fg < 0.95) return { url: crop(c).toDataURL('image/png'), method: 'color' };
    }
    try {
      const c = copy();
      const fg = await personMask(c);
      const cc = fg > 0.03 ? crop(c) : null;
      if (cc && cc.fill > 0.18) return { url: cc.toDataURL('image/png'), method: 'person' };
    } catch (e) { console.warn('IceDday: 사람 분리 실패', e); }
    return { url: base.toDataURL('image/png'), method: 'none' };   // 못 찾으면 원본 그대로
  };
})();
