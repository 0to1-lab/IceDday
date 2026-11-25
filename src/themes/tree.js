// 🎄 크리스마스 트리 — D-day가 다가올수록 전구가 하나씩 켜지고 장식·선물이 늘어남
// D-day: 꼭대기 별이 환하게 켜지고 모든 전구가 반짝 (사진은 쓰지 않음)
// 종류: warm(따뜻한 흰 전구, 집 안 트리) · multi(알록달록 전구, 광장 트리)
import * as THREE from 'three';
import { smooth, lerp, dotTex, makeShadow, expandBounds, makeCanvas, toTex, heightToNormal } from '../util.js';

let H = 1.58, Y0 = 0.3, R0 = 0.6;                      // 알록달록 트리는 밑동을 짧게, 잎을 크게 (rebuild에서 바꿈)                  // 잎 부분 높이·시작 높이·밑 반지름
const radiusAt = (y) => {                              // 층층이 살짝 퍼지는 원뿔
  const k = (y - Y0) / H;
  return Math.max(0, R0 * (1 - k) * (1 + 0.06 * Math.sin(k * Math.PI * 7)) );
};
const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

export function createTree(ctx) {
  const { group } = ctx;
  let type = null, p = 0;
  let content, sway, lights, lightPos, lightBase, lightOrder, lightPhase, ornaments, ornData = [], beads, beadCount = 0;
  let star, starMat, starGlow, starRays, gifts = [], boxes = [], warmLight, halo, snow, glitter = [], glitterPts;
  let celebT = -1, flash = 0, swayT = -9, nowT = 0;
  const NO = 90;
  let NL = 700, glowPts;

  // 은은한 뒤쪽 불빛 (트리 전체가 빛나는 느낌)
  const haloC = makeCanvas(256), haloTex = toTex(haloC);
  {
    const g = haloC.getContext('2d'), rg = g.createRadialGradient(128, 140, 4, 128, 140, 126);
    rg.addColorStop(0, 'rgba(255,214,150,.85)'); rg.addColorStop(0.5, 'rgba(255,190,110,.25)'); rg.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256); haloTex.needsUpdate = true;
  }

  // 호일의 잔주름 (노멀맵)
  const foilNrm = (() => { const c = makeCanvas(128), g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 90; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)'; g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(rnd() * 128, rnd() * 128); g.lineTo(rnd() * 128, rnd() * 128); g.stroke(); } const t = toTex(heightToNormal(c, 1.5), false); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();

  // 선물 포장지: 색 + 줄무늬/점무늬
  function wrapTex(base, accent, kind) {
    const c = makeCanvas(256), g = c.getContext('2d');
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    g.fillStyle = accent;
    if (kind === 0) for (let x = -256; x < 512; x += 36) { g.save(); g.translate(x, 0); g.rotate(0.6); g.fillRect(0, -40, 10, 400); g.restore(); }
    else if (kind === 1) for (let y = 14; y < 256; y += 32) for (let x = (y / 32 % 2) * 16 + 8; x < 256; x += 32) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
    else for (let i = 0; i < 26; i++) { const x = (i * 97) % 256, y = (i * 53) % 256; g.save(); g.translate(x, y); g.rotate(i); g.fillRect(-7, -1.5, 14, 3); g.fillRect(-1.5, -7, 3, 14); g.restore(); }
    return toTex(c);
  }

  function makeGift(w, h, d, wrap, ribbonColor, withLid, foil = null) {
    const gift = new THREE.Group();
    const paper = foil != null   // 광택 호일 포장 (알록달록 트리): 전구 빛이 비침
      ? new THREE.MeshPhysicalMaterial({ color: foil, metalness: 0.75, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12, normalMap: foilNrm, normalScale: new THREE.Vector2(0.25, 0.25) })
      : new THREE.MeshPhysicalMaterial({ map: wrap, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 });
    const rib = new THREE.MeshPhysicalMaterial({ color: ribbonColor, roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(0xffffff), metalness: 0.2 });
    const lidH = withLid ? h * 0.22 : 0;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - lidH, d), paper); body.position.y = (h - lidH) / 2; gift.add(body);
    const rw = Math.min(w, d) * 0.12;
    const bandA = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, h - lidH + 0.002, rw), rib); bandA.position.y = body.position.y; gift.add(bandA);
    const bandB = new THREE.Mesh(new THREE.BoxGeometry(rw, h - lidH + 0.002, d + 0.004), rib); bandB.position.y = body.position.y; gift.add(bandB);
    const top = new THREE.Group(); top.position.y = h - lidH; gift.add(top);
    if (withLid) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, lidH, d * 1.04), paper); l.position.y = lidH / 2; top.add(l);
      const la = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, lidH * 1.02, rw), rib); la.position.y = lidH / 2; top.add(la);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(rw, lidH * 1.02, d * 1.05), rib); lb.position.y = lidH / 2; top.add(lb);
    }
    // 리본 매듭: 고리 두 개 + 꼬리
    const bowY = withLid ? lidH : 0;
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(rw * 1.3, rw * 0.32, 8, 20), rib);
      loop.scale.set(1, 0.7, 0.5); loop.position.set(s * rw * 1.2, bowY + rw * 0.9, 0); loop.rotation.set(0, 0, s * 0.5); top.add(loop);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(rw * 0.55, 12, 8), rib); knot.position.y = bowY + rw * 0.4; top.add(knot);
    gift.userData = { top, h, lidH };
    return gift;
  }

  // 꼭대기 별: 정이십면체 꼭짓점마다 뾰족한 가시 (광장 트리의 별 모양)
  function makeStar() {
    const g = new THREE.Group();
    starMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe7a8, emissiveIntensity: 0.15, metalness: 0.3, roughness: 0.25 });
    const ico = new THREE.IcosahedronGeometry(1, 1), pos = ico.attributes.position, seen = new Set();
    const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const key = v.toArray().map(x => x.toFixed(2)).join(); if (seen.has(key)) continue; seen.add(key);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.13, 6), starMat);
      spike.quaternion.setFromUnitVectors(up, v); spike.position.copy(v).multiplyScalar(0.065); g.add(spike);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), starMat));
    return g;
  }

  function rebuild() {
    if (content) { group.remove(content); content.traverse(o => o.geometry?.dispose()); ctx.world.remove(halo); }
    content = new THREE.Group(); group.add(content);
    content.add(makeShadow(2.6));
    sway = new THREE.Group(); content.add(sway);
    const multi = type === 'multi';
    NL = multi ? 1250 : 760;
    if (multi) { H = 1.82; Y0 = 0.12; R0 = 0.66; } else { H = 1.58; Y0 = 0.3; R0 = 0.6; }

    // 받침: 줄기 + 금속 트리 칼라
    // 나무 몸통: 어두운 고동색 나무껍질 (세로로 갈라진 결)
    const bc = makeCanvas(128, 256), bgx = bc.getContext('2d');
    bgx.fillStyle = '#2a1a10'; bgx.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i++) { bgx.strokeStyle = rnd() < 0.6 ? 'rgba(12,7,4,.7)' : 'rgba(70,46,30,.5)'; bgx.lineWidth = 1 + rnd() * 3; const x = rnd() * 128; bgx.beginPath(); bgx.moveTo(x, 0); for (let y = 0; y <= 256; y += 16) bgx.lineTo(x + Math.sin(y * 0.05 + i) * 4, y); bgx.stroke(); }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 20), new THREE.MeshStandardMaterial({ map: toTex(bc), color: 0xffffff, roughness: 0.95 }));
    trunk.position.y = 0.2; sway.add(trunk);
    // 트리 스커트 (따뜻한 전구 트리만): 바닥에 깔린 붉은 천, 가장자리가 물결처럼 주름짐
    if (!multi) {
      const sg = new THREE.CircleGeometry(0.85, 96, 0, Math.PI * 2), sp = sg.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i), y = sp.getY(i), r = Math.hypot(x, y), a = Math.atan2(y, x); sp.setZ(i, (r / 0.85) ** 2 * 0.025 * Math.sin(a * 14)); }
      sg.computeVertexNormals();
      const sc2 = makeCanvas(256), sgc = sc2.getContext('2d'); sgc.fillStyle = '#7a1018'; sgc.fillRect(0, 0, 256, 256);
      sgc.strokeStyle = 'rgba(20,0,0,.35)'; sgc.lineWidth = 10; for (let k = 0; k < 256; k += 32) { sgc.beginPath(); sgc.moveTo(k, 0); sgc.lineTo(k, 256); sgc.stroke(); sgc.beginPath(); sgc.moveTo(0, k); sgc.lineTo(256, k); sgc.stroke(); }   // 체크무늬
      const skirt = new THREE.Mesh(sg, new THREE.MeshPhysicalMaterial({ map: toTex(sc2, true, [4, 4]), roughness: 0.9, sheen: 0.4, sheenColor: new THREE.Color(0x802020), side: THREE.DoubleSide }));
      skirt.rotation.x = -Math.PI / 2; skirt.position.y = 0.012; content.add(skirt);
    }

    // 잎: 바깥을 향해 살짝 처진 작은 가지 수천 개 (색을 조금씩 다르게)
    const core = new THREE.Mesh(new THREE.ConeGeometry(R0 * 0.82, H, 24, 1), new THREE.MeshStandardMaterial({ color: 0x0a120f, roughness: 1 }));
    core.position.y = Y0 + H / 2 - 0.02; sway.add(core);
    const N = 5200;
    const sprigGeo = new THREE.ConeGeometry(0.03, 0.17, 4); sprigGeo.translate(0, 0.085, 0);
    const sprigs = new THREE.InstancedMesh(sprigGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, envMapIntensity: 0.5 }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const k = 1 - Math.sqrt(rnd());                      // 아래쪽이 더 넓으니 더 많이
      const y = Y0 + k * H * 0.98, a = rnd() * Math.PI * 2, r = radiusAt(y) * (0.45 + rnd() * 0.5);
      pos.set(Math.cos(a) * r, y, Math.sin(a) * r);
      dir.set(Math.cos(a), -0.35 - rnd() * 0.3, Math.sin(a)).normalize();
      q.setFromUnitVectors(up, dir);
      const s = (0.7 + rnd() * 0.6) * lerp(1.1, 0.6, k);
      sc.set(s, s * (0.8 + rnd() * 0.5), s);
      sprigs.setMatrixAt(i, m.compose(pos, q, sc));
      col.setHSL(0.4 + rnd() * 0.05, 0.14 + rnd() * 0.14, 0.045 + rnd() * 0.05 + (r / R0) * 0.025, THREE.SRGBColorSpace);   // 채도 낮은 짙은 초록 → 전구가 돋보임
      sprigs.setColorAt(i, col);
    }
    sway.add(sprigs);

    // 전구: 잎 표면 근처에 고르게. 켜지는 순서는 섞어 둠
    lightPos = new Float32Array(NL * 3); lightBase = []; lightPhase = []; lightOrder = [];
    const warmC = new THREE.Color(0xffc979);
    const pal = [0xff2a1f, 0x2fd35a, 0x2c6bff, 0xffc21a, 0xff7a00, 0xff3fb0, 0x2ad4ff].map(c => new THREE.Color(c));
    for (let i = 0; i < NL; i++) {
      const k = 1 - Math.sqrt(rnd() * 0.97);
      const y = Y0 + 0.04 + k * H * 0.93, a = rnd() * Math.PI * 2, r = radiusAt(y) * (0.78 + rnd() * 0.32) + 0.03;
      lightPos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      lightBase.push(multi ? pal[i % pal.length] : warmC.clone().offsetHSL((rnd() - 0.5) * 0.02, 0, 0));
      lightPhase.push([rnd() * 6.28, 1.5 + rnd() * 3]);
      lightOrder.push(rnd());
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lightPos, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NL * 3), 3));
    lights = new THREE.Points(lg, new THREE.PointsMaterial({ size: multi ? 0.144 : 0.13, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    lights.userData.noBounds = true; sway.add(lights);
    // 번짐: 같은 전구를 크게 흐리게 한 번 더 (사진에서 빛이 번지는 느낌)
    glowPts = new THREE.Points(lg, new THREE.PointsMaterial({ size: multi ? 0.43 : 0.36, map: dotTex, vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glowPts.userData.noBounds = true; sway.add(glowPts);
    // 전구 알맹이 (꺼져 있어도 작게 보이는 유리알)
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.009, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), NL);
    for (let i = 0; i < NL; i++) { pos.fromArray(lightPos, i * 3); bulbs.setMatrixAt(i, m.compose(pos, q.identity(), sc.set(1, 1, 1))); bulbs.setColorAt(i, col.set(0x333333)); }
    bulbs.userData.noBounds = true; lights.userData.bulbs = bulbs; sway.add(bulbs);

    // 오너먼트: 반짝이는 유리·금속 공 (진행에 따라 하나씩 달림)
    const ornMat = new THREE.MeshPhysicalMaterial({ metalness: 0.75, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.08 });
    ornaments = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 20, 14), ornMat, NO);
    const ornCols = multi ? [0xd42a2a, 0x1f63d6, 0xd8a531, 0x2e9c55, 0xc0c0c8] : [0xa8151b, 0xd2a640, 0xb8b8c0, 0x8b1a1a, 0x9a1018, 0xc8c8d0];
    ornData = [];
    for (let i = 0; i < NO; i++) {
      const k = 1 - Math.sqrt(rnd() * 0.92);
      const y = Y0 + 0.08 + k * H * 0.82, a = rnd() * Math.PI * 2, r = radiusAt(y) * 0.98;
      ornData.push({ p: new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), s: 0.75 + rnd() * 0.7, th: (i / NO) * 0.92 });
      ornaments.setColorAt(i, col.set(ornCols[i % ornCols.length]));
      ornaments.setMatrixAt(i, m.compose(ornData[i].p, q.identity(), sc.set(0.001, 0.001, 0.001)));
    }
    ornaments.visible = !multi; sway.add(ornaments);   // 광장 트리는 전구와 별만

    // 구슬 가랜드: 나선으로 감아 내려옴 (진행에 따라 위에서부터 늘어남)
    const NB = 380;
    beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshStandardMaterial({ color: multi ? 0xe9e3d8 : 0xd8b25a, metalness: 0.9, roughness: 0.25 }), NB);
    for (let i = 0; i < NB; i++) {
      const u = i / NB, y = Y0 + H * 0.88 - u * H * 0.8, a = u * Math.PI * 2 * 4.2, r = radiusAt(y) * 0.97 + 0.01;
      const sag = Math.sin(u * Math.PI * 2 * 4.2 * 3) * 0.015;
      beads.setMatrixAt(i, m.compose(pos.set(Math.cos(a) * r, y - Math.abs(sag), Math.sin(a) * r), q.identity(), sc.set(1, 1, 1)));
    }
    beads.count = 0; beadCount = NB; beads.visible = !multi; sway.add(beads);

    // 꼭대기 별
    star = makeStar(); star.position.y = Y0 + H + 0.07; sway.add(star);
    starGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xfff1c8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    starGlow.scale.set(0.9, 0.9, 1); starGlow.position.copy(star.position); starGlow.userData.noBounds = true; sway.add(starGlow);
    const rayC = makeCanvas(256), rg = rayC.getContext('2d');
    rg.translate(128, 128);
    for (let i = 0; i < 12; i++) { rg.rotate(Math.PI / 6); const gr = rg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,245,210,.9)'); gr.addColorStop(1, 'rgba(255,245,210,0)'); rg.fillStyle = gr; rg.beginPath(); rg.moveTo(-3, 0); rg.lineTo(0, 128 * (i % 2 ? 0.6 : 1)); rg.lineTo(3, 0); rg.fill(); }
    starRays = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTex(rayC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    starRays.scale.set(0.8, 0.8, 1); starRays.position.copy(star.position); starRays.userData.noBounds = true; sway.add(starRays);

    // 바닥: 따뜻한 전구 트리는 붉은 스커트 + 빽빽한 선물, 알록달록 트리는 아무것도 없음
    gifts = []; boxes = [];
    if (!multi) {
      const papers = [['#8a1820', '#d9b45a', 0xd9b45a], ['#e9dcc4', '#b08a3a', 0x8a1820], ['#25452f', '#d9b45a', 0xd9b45a], ['#d9b45a', '#8a1820', 0x8a1820], ['#f3efe6', '#8a1820', 0xb08a3a], ['#5a1a22', '#e9dcc4', 0xe9dcc4]];
      // 트리 둘레에 빽빽하게: 안쪽 줄·바깥 줄 두 겹, 크기·간격·방향 제각각, 군데군데 위에 쌓음
      const papers2 = [...papers, ['#1c1c1c', '#c9a24a', 0xc9a24a], ['#b8a27a', '#7a1018', 0x7a1018], ['#7a1018', '#1c1c1c', 0xe9dcc4]];
      const texCache = {};
      const wrapOf = (i, k) => { const key = i + '_' + k; return texCache[key] || (texCache[key] = wrapTex(papers2[i][0], papers2[i][1], k)); };
      const place = (ang, rad, big, th) => {
        const pi = Math.floor(rnd() * papers2.length), [, , rib] = papers2[pi];
        const w = big ? 0.24 + rnd() * 0.14 : 0.1 + rnd() * 0.12, h = big ? 0.14 + rnd() * 0.14 : 0.07 + rnd() * 0.1, d = w * (0.6 + rnd() * 0.6);
        const g = makeGift(w, h, d, wrapOf(pi, Math.floor(rnd() * 3)), rib, rnd() < 0.5);
        g.position.set(Math.sin(ang) * rad, 0, Math.cos(ang) * rad); g.rotation.y = ang + (rnd() - 0.5) * 1.6; g.rotation.z = (rnd() - 0.5) * 0.06;
        g.userData.th = th; content.add(g); gifts.push(g);
        return { g, w, h, d };
      };
      for (const [r0, gap, bigP] of [[0.5, 0.32, 0.45], [0.8, 0.22, 0.25]]) {
        let ang = rnd() * 0.5;
        while (ang < Math.PI * 2 - 0.15) {
          const big = rnd() < bigP, front = Math.cos(ang) > 0.2;
          const th = rnd() < 0.45 ? -1 : 0.05 + rnd() * 0.85;
          const b = place(ang, r0 + (rnd() - 0.5) * 0.14, big, th);
          if (rnd() < (big ? 0.55 : 0.2)) {                          // 위에 하나 더
            const pi = Math.floor(rnd() * papers2.length), sw = b.w * (0.45 + rnd() * 0.3);
            const top = makeGift(sw, 0.05 + rnd() * 0.08, sw * (0.7 + rnd() * 0.4), wrapOf(pi, Math.floor(rnd() * 3)), papers2[pi][2], false);
            top.position.set(b.g.position.x + (rnd() - 0.5) * 0.06, b.h, b.g.position.z + (rnd() - 0.5) * 0.06); top.rotation.y = b.g.rotation.y + (rnd() - 0.5) * 1.4;
            top.userData.th = th < 0 ? (rnd() < 0.5 ? -1 : 0.3 + rnd() * 0.6) : Math.min(0.95, th + 0.1);
            content.add(top); gifts.push(top);
          }
          ang += gap + rnd() * gap * (front ? 1.2 : 1.0) + (big ? 0.1 : 0);
        }
      }
    }

    // 트리 안쪽 따뜻한 빛 (선물·바닥을 비춤)
    warmLight = new THREE.PointLight(multi ? 0xffe0c0 : 0xffc070, 0, 2.6, 1.6); warmLight.position.set(0, 0.55, 0.45); content.add(warmLight);
    halo = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, opacity: 0, color: multi ? 0xffe8d0 : 0xffffff }));
    halo.position.set(0, 1.0, -0.9); halo.renderOrder = -2; halo.userData.noBounds = true; ctx.world.add(halo);

    // D-day 반짝이 가루: 트리 둘레를 돌며 천천히 휘날림
    const NGL = 600, gp = new Float32Array(NGL * 3), gcl = new Float32Array(NGL * 3);
    glitter = []; for (let i = 0; i < NGL; i++) glitter.push({ a: rnd() * 6.28, r: 0.25 + rnd() * 0.85, y: rnd() * 2.3, v: 0.05 + rnd() * 0.12, w: 0.2 + rnd() * 0.5, f: rnd() * 6.28, s: 4 + rnd() * 8, gold: rnd() < (multi ? 0.4 : 0.75) });
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(gp, 3)); gg.setAttribute('color', new THREE.BufferAttribute(gcl, 3));
    glitterPts = new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.036, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    glitterPts.visible = false; glitterPts.userData.noBounds = true; content.add(glitterPts);

    // 눈송이
    snow = [];
    for (let i = 0; i < 36; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.7 }));
      sp.userData = { x: (rnd() - 0.5) * 2.2, y: rnd() * 2.3, z: (rnd() - 0.5) * 1.4, v: 0.08 + rnd() * 0.1, f: rnd() * 6, s: 0.02 + rnd() * 0.025 };
      sp.userData.noBounds = true; sp.userData.x0 = sp.userData.x;
      content.add(sp); snow.push(sp);
    }

    group.scale.setScalar(1.0);
  }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

  return {
    word: '점등',
    sounds: { click: 'jingle', dday: 'treeDday' },
    confetti: false,
    setVariant(v) { const t = v === 'multi' ? 'multi' : 'warm'; if (t === type) return; type = t; rebuild(); },
    setPhoto() {},                 // 트리는 사진을 쓰지 않음
    build(pp) { p = pp; },
    tick(dt, t, pp, celebrate) {
      nowT = t;
      let a = -1;
      if (celebrate) { if (celebT < 0) celebT = t; a = t - celebT; } else celebT = -1;
      flash = Math.max(0, flash - dt * 1.6);
      const party = a >= 0 ? 1 : 0;

      // 전구: 진행도만큼 켜짐 (D-day엔 전부), 반짝반짝
      const lit = party ? 1 : smooth(0, 0.97, pp);
      const colA = lights.geometry.attributes.color, bulbs = lights.userData.bulbs;
      for (let i = 0; i < NL; i++) {
        const on = lightOrder[i] < lit;
        const [ph, sp] = lightPhase[i];
        const tw = type === 'multi' ? 0.75 + 0.25 * Math.sin(t * sp + ph) : 0.85 + 0.15 * Math.sin(t * sp * 0.6 + ph);
        const k = on ? 1.6 * tw * (1 + flash * (0.5 + 0.5 * Math.sin(t * 30 + ph))) * (1 + party * 0.25) : 0;
        _c.copy(lightBase[i]).multiplyScalar(k);
        colA.setXYZ(i, _c.r, _c.g, _c.b);
        bulbs.setColorAt(i, on ? _c.copy(lightBase[i]).multiplyScalar(1.2) : _c.set(0x2a2a22));
      }
      colA.needsUpdate = true; bulbs.instanceColor.needsUpdate = true;

      // 오너먼트: 차례로 톡 하고 달림
      for (let i = 0; i < NO; i++) {
        const o = ornData[i], k = party ? 1 : smooth(o.th, o.th + 0.025, pp);
        const pop = k * (1 + 0.25 * Math.sin(Math.min(1, k) * Math.PI));
        const s = Math.max(0.001, o.s * pop);
        ornaments.setMatrixAt(i, _m.compose(o.p, _q.identity(), _s.set(s, s, s)));
      }
      ornaments.instanceMatrix.needsUpdate = true;
      beads.count = Math.floor(beadCount * (party ? 1 : smooth(0.05, 0.9, pp)));

      // 선물: 앞 상자는 늘 있고, 나머지는 날이 가까워질수록 하나씩
      gifts.forEach((g) => { const k = g.userData.th < 0 || party ? 1 : smooth(g.userData.th, g.userData.th + 0.04, pp); g.visible = k > 0.01; g.scale.setScalar(Math.max(0.01, k)); });

      // 빛나는 상자 조형물: 날이 가까워질수록 하나씩 켜지고, 전구가 테두리를 따라 흐르듯 반짝임
      boxes.forEach(b => {
        const u = b.userData, on = party ? 1 : smooth(u.th, u.th + 0.08, pp), A = u.geo.attributes.color;
        for (let i = 0; i < u.n; i++) { const k = on * (0.55 + 0.45 * Math.sin(i * 0.9 - t * 5)) * 1.5; A.setXYZ(i, u.c3.r * k, u.c3.g * k, u.c3.b * k); }
        A.needsUpdate = true; b.children[0].material.opacity = 0.06 * on;
      });

      // 별: 평소엔 은은하게, D-day엔 환하게
      const starOn = party ? smooth(0, 0.6, a) : 0;
      starMat.emissiveIntensity = lerp(0.12 + 0.1 * pp, 3.2, starOn);
      starGlow.material.opacity = lerp(0.08 * pp, 0.95, starOn);
      starRays.material.opacity = 0.8 * starOn; starRays.material.rotation = t * 0.15;
      star.rotation.y = t * 0.4;

      // 따뜻한 빛
      warmLight.intensity = lerp(0.05, 1.3, lit) * (1 + flash * 0.4);
      halo.material.opacity = lerp(0.02, 0.55, lit) + starOn * 0.2;

      // 클릭하면 살짝 흔들림
      const sa = t - swayT, sw = sa < 3 ? 0.035 * Math.exp(-2.2 * sa) * Math.sin(sa * 11) : 0;
      sway.rotation.z = sw; sway.rotation.x = sw * 0.4;

      // D-day 반짝이 가루
      glitterPts.visible = party > 0;
      if (party) {
        const gpA = glitterPts.geometry.attributes.position, gcA = glitterPts.geometry.attributes.color, fade = smooth(0.2, 1.5, a);
        glitter.forEach((g, i) => {
          g.y -= g.v * dt; if (g.y < 0) g.y = 2.3;
          const an = g.a + t * g.w;
          gpA.setXYZ(i, Math.cos(an) * g.r, g.y + Math.sin(t * 1.3 + g.f) * 0.03, Math.sin(an) * g.r);
          const tw = fade * Math.max(0, Math.sin(t * g.s + g.f)) ** 3 * 1.6;
          if (g.gold) gcA.setXYZ(i, tw, tw * 0.8, tw * 0.45); else gcA.setXYZ(i, tw, tw, tw);
        });
        gpA.needsUpdate = true; gcA.needsUpdate = true;
      }

      // 눈
      snow.forEach(sp => {
        const u = sp.userData; u.y -= u.v * dt; if (u.y < 0) { u.y = 2.3; }
        sp.position.set(u.x0 + Math.sin(t * 0.7 + u.f) * 0.08, u.y, u.z); sp.scale.set(u.s, u.s, 1);
        sp.material.opacity = 0.55 * Math.min(1, u.y / 0.3);
      });
    },
    poke() { flash = 1; swayT = nowT; return {}; },
    replay() { celebT = nowT; },
    bounds(box) { expandBounds(box, content); },
  };
}
