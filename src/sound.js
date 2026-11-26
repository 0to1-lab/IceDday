// 효과음 — 녹음 파일 없이 Web Audio로 직접 합성 (저작권 걱정 없음, 용량 0)
// 사용: Sound.play('clink')   이름 목록은 아래 SOUNDS
import wolfShort from './assets/wolf-howl-short.mp3';   // 옐로스톤 국립공원 녹음 (NPS, 퍼블릭 도메인) — 잡음 제거·편집
import wolfDday from './assets/wolf-howl-dday.mp3';
let ctx = null, master = null, verb = null, enabled = true, unlocked = false;

// 녹음 파일 소리: 처음 쓸 때 한 번 풀어 두고 재생
const SAMPLES = { wolfShort, wolfDday }, decoded = {};
function sample(name, t, gain = 1, wet = 0.15) {
  const play = (buf) => { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; g.gain.value = gain; s.connect(g).connect(out(wet)); s.start(Math.max(t, ctx.currentTime)); };
  if (decoded[name] instanceof AudioBuffer) return play(decoded[name]);
  if (!decoded[name]) decoded[name] = ctx.decodeAudioData(SAMPLES[name].slice().buffer).then(b => (decoded[name] = b));
  decoded[name].then(play).catch(e => console.warn('sample', name, e));
}

function ac() {
  if (ctx && ctx.state === 'closed') ctx = null;   // 닫힌 소리 장치는 버리고 새로 만듦
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  // 잔향 (성당·밤 숲 느낌): 짧게 줄어드는 소음을 울림으로 씀
  verb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  verb.buffer = ir;
  const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg).connect(master);
  return ctx;
}
let noiseBuf = null;
function noise() {
  if (noiseBuf) return noiseBuf;
  const c = ac(), n = c.sampleRate * 2; noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}
// 출력: dry(바로) + wet(잔향)
function out(wet = 0.2) {
  const g = ctx.createGain(), w = ctx.createGain();
  w.gain.value = wet; g.connect(master); g.connect(w); w.connect(verb);
  return g;
}
function env(g, t, a, peak, d, sustain = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
}
function tone(type, f, t, a, peak, d, dest, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  env(g, t, a, peak, d); o.connect(g).connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  return o;
}
function burst(t, dur, peak, filt, f, q, dest) {
  const s = ctx.createBufferSource(); s.buffer = noise(); s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bf = ctx.createBiquadFilter(); bf.type = filt; bf.frequency.value = f; bf.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.003, peak, dur);
  s.connect(bf).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  return { s, bf, g };
}
// 종·방울: 정수배가 아닌 배음들을 겹쳐서 금속 울림을 만듦
function bell(f, t, peak, decay, dest, partials = [[1, 1], [2.756, 0.5], [5.404, 0.25], [8.933, 0.12]]) {
  partials.forEach(([r, a], i) => tone('sine', f * r, t, 0.002, peak * a, decay / (1 + i * 0.6), dest));
}

// 늑대 목소리: 음높이 [시작, 오름, 버팀, 끝], 모음 필터로 "아→우"
function howlVoice(t, dur, [f0, f1, f2, f3], gain, wet) {
  const o = out(wet), os = ctx.createOscillator(), os2 = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain();
  os.type = 'sawtooth'; os2.type = 'sine';
  for (const f of [os.frequency, os2.frequency]) { f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur * 0.16); f.linearRampToValueAtTime(f2, t + dur * 0.58); f.exponentialRampToValueAtTime(f3, t + dur); }
  vib.frequency.value = 5.2; vg.gain.value = 9; vib.connect(vg); vg.connect(os.frequency); vg.connect(os2.frequency);
  const fa = ctx.createBiquadFilter(), fb = ctx.createBiquadFilter(), mix = ctx.createGain(), g = ctx.createGain();
  fa.type = 'bandpass'; fa.Q.value = 5; fa.frequency.setValueAtTime(700, t); fa.frequency.linearRampToValueAtTime(900, t + dur * 0.17); fa.frequency.linearRampToValueAtTime(450, t + dur);
  fb.type = 'bandpass'; fb.Q.value = 7; fb.frequency.setValueAtTime(1150, t); fb.frequency.linearRampToValueAtTime(800, t + dur);
  os.connect(fa); os.connect(fb); fa.connect(mix); fb.connect(mix);
  const sg = ctx.createGain(); sg.gain.value = 0.6; os2.connect(sg).connect(mix);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.1); g.gain.setValueAtTime(gain, t + dur * 0.66); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  mix.connect(g).connect(o);
  [os, os2, vib].forEach(x => { x.start(t); x.stop(t + dur + 0.1); });
}
// 오래된 나무 문 경첩: 끼이이익 (마찰이 붙었다 미끄러졌다 하는 떨림 + 나무 울림)
function hinge(t, len, vol = 1) {
  const o = out(0.25), os = ctx.createOscillator(), g = ctx.createGain(), stick = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  os.type = 'sawtooth';
  let f = 380 + Math.random() * 120; os.frequency.setValueAtTime(f, t);
  for (let i = 1; i <= 9; i++) { f = Math.min(820, Math.max(260, f + (Math.random() - 0.4) * 180)); os.frequency.linearRampToValueAtTime(f, t + len * i / 9); }
  lfo.type = 'square'; lfo.frequency.setValueAtTime(26 + Math.random() * 10, t); lfo.frequency.linearRampToValueAtTime(40 + Math.random() * 12, t + len);
  stick.gain.value = 0.55; lg.gain.value = 0.45; lfo.connect(lg).connect(stick.gain);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
  const b1 = ctx.createBiquadFilter(), b2 = ctx.createBiquadFilter(), mix = ctx.createGain();
  b1.type = 'bandpass'; b1.frequency.value = 1150; b1.Q.value = 4; b2.type = 'bandpass'; b2.frequency.value = 2500; b2.Q.value = 5;
  os.connect(stick).connect(hp); hp.connect(b1); hp.connect(b2); b1.connect(mix); b2.connect(mix);
  const pk = 0.32 * vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + 0.07); g.gain.linearRampToValueAtTime(pk * 0.7, t + len * 0.5); g.gain.linearRampToValueAtTime(pk, t + len * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  mix.connect(g).connect(o);
  [os, lfo].forEach(x => { x.start(t); x.stop(t + len + 0.05); });
}
// 문 닫히는 쿵 + 걸쇠 딸깍
function thump(t) {
  const o = out(0.3), os = ctx.createOscillator(), g = ctx.createGain();
  os.type = 'sine'; os.frequency.setValueAtTime(95, t); os.frequency.exponentialRampToValueAtTime(48, t + 0.18);
  env(g, t, 0.004, 0.5, 0.22); os.connect(g).connect(o); os.start(t); os.stop(t + 0.3);
  burst(t, 0.12, 0.35, 'lowpass', 500, 1, o); burst(t + 0.03, 0.03, 0.2, 'bandpass', 2600, 4, o);
}

const SOUNDS = {
  // ❄️ 얼음
  clink(t) { const o = out(0.25); [2400, 3650, 5200].forEach((f, i) => bell(f * (0.97 + Math.random() * 0.06), t + i * 0.012, 0.16 / (i + 1), 0.5, o, [[1, 1], [2.3, 0.3]])); burst(t, 0.03, 0.08, 'highpass', 4000, 0.7, o); },
  shatter(t) {
    const o = out(0.3);
    burst(t, 0.35, 0.5, 'highpass', 2500, 0.5, o); burst(t + 0.02, 0.6, 0.25, 'bandpass', 5000, 1.5, o);
    for (let i = 0; i < 14; i++) { const tt = t + 0.02 + Math.random() * 0.7; bell(2000 + Math.random() * 4500, tt, 0.07 * Math.random() + 0.02, 0.35, o, [[1, 1], [2.4, 0.4]]); }
    // 물방울
    for (let i = 0; i < 5; i++) { const tt = t + 0.9 + i * 0.28 + Math.random() * 0.1, os = ctx.createOscillator(), g = ctx.createGain(); os.type = 'sine'; os.frequency.setValueAtTime(700 + Math.random() * 300, tt); os.frequency.exponentialRampToValueAtTime(1600 + Math.random() * 500, tt + 0.06); env(g, tt, 0.004, 0.12, 0.08); os.connect(g).connect(o); os.start(tt); os.stop(tt + 0.15); }
  },
  // 🍞 오븐
  creak(t, len = 0.7) {
    const o = out(0.15), os = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    os.type = 'sawtooth'; bp.type = 'bandpass'; bp.Q.value = 6;
    for (let i = 0; i <= 10; i++) { const tt = t + i * len / 10; os.frequency.setValueAtTime(55 + Math.random() * 40, tt); bp.frequency.setValueAtTime(700 + Math.random() * 900, tt); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.05); g.gain.setValueAtTime(0.18, t + len * 0.8); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    os.connect(bp).connect(g).connect(o); os.start(t); os.stop(t + len + 0.05);
  },
  // 장작불 타닥타닥: 아주 짧은 '탁' 소리들이 불규칙하게 + 낮게 웅웅거리는 불꽃
  crackle(t) {
    const o = out(0.15), len = 1.4;
    const roar = burst(t, len, 0.12, 'lowpass', 380, 0.8, o); roar.g.gain.setValueAtTime(0.12, t + len * 0.6); roar.g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    let tt = t + 0.02;
    while (tt < t + len - 0.1) {
      const big = Math.random() < 0.3;
      burst(tt, big ? 0.018 : 0.007, big ? 0.5 : 0.18 + Math.random() * 0.2, 'bandpass', 1200 + Math.random() * 3500, 1.5 + Math.random() * 3, o);
      if (big) burst(tt + 0.004, 0.03, 0.12, 'lowpass', 900, 1, o);
      tt += 0.025 + Math.random() * (Math.random() < 0.2 ? 0.25 : 0.08);
    }
  },
  ding(t) { bell(1568, t, 0.32, 2.4, out(0.3), [[1, 1], [2.01, 0.35], [3.0, 0.15], [4.2, 0.08]]); },
  poof(t) { const o = out(0.35); const b = burst(t, 0.9, 0.55, 'lowpass', 1800, 0.7, o); b.bf.frequency.exponentialRampToValueAtTime(200, t + 0.8); },
  ovenDday(t) { SOUNDS.ding(t); SOUNDS.poof(t + 2.0); },
  // 🥚 알
  // 껍질에 금 가는 소리: 짧고 날카로운 '쩍' + 잔금 '틱틱'
  crackSmall(t) {
    const o = out(0.12);
    burst(t, 0.03, 0.55, 'bandpass', 3000, 2.5, o); burst(t, 0.012, 0.3, 'highpass', 5000, 0.7, o);
    for (let i = 0; i < 5; i++) burst(t + 0.04 + i * (0.03 + Math.random() * 0.05), 0.006, 0.12 + Math.random() * 0.12, 'bandpass', 3500 + Math.random() * 3000, 4, o);
  },
  tap(t) { const o = out(0.1); [0, 0.11].forEach(d => { burst(t + d, 0.04, 0.35, 'bandpass', 1800, 4, o); tone('sine', 900, t + d, 0.001, 0.12, 0.05, o); }); },
  crack(t) {
    const o = out(0.2);
    burst(t, 0.08, 0.7, 'bandpass', 2600, 2, o); burst(t + 0.05, 0.25, 0.3, 'highpass', 3000, 0.7, o);
    for (let i = 0; i < 8; i++) burst(t + 0.1 + Math.random() * 0.4, 0.03, 0.15, 'bandpass', 2000 + Math.random() * 3000, 5, o);
    // 짹짹
    [0.8, 1.05].forEach(d => { const tt = t + d, os = ctx.createOscillator(), g = ctx.createGain(); os.type = 'sine'; os.frequency.setValueAtTime(3200, tt); os.frequency.exponentialRampToValueAtTime(4600, tt + 0.07); os.frequency.exponentialRampToValueAtTime(3400, tt + 0.12); env(g, tt, 0.01, 0.12, 0.12); os.connect(g).connect(o); os.start(tt); os.stop(tt + 0.2); });
  },
  // 🎄 트리
  jingle(t) {
    const o = out(0.25);
    for (let i = 0; i < 9; i++) { const tt = t + i * 0.035 + Math.random() * 0.03; bell(3000 + Math.random() * 2600, tt, 0.07, 0.4, o, [[1, 1], [2.1, 0.4], [3.3, 0.2]]); }
    burst(t, 0.35, 0.12, 'highpass', 6000, 0.7, o);
  },
  // D-day: 썰매 방울 + 글로켄슈필로 "징글벨" 후렴 (1857년 곡, 저작권 만료)
  sleigh(t, v = 1) {
    const o = out(0.25);
    for (let i = 0; i < 6; i++) { const tt = t + Math.random() * 0.05; bell(4200 + Math.random() * 2400, tt, 0.035 * v, 0.18, o, [[1, 1], [1.5, 0.4], [2.2, 0.2]]); }
    burst(t, 0.12, 0.1 * v, 'highpass', 7000, 0.7, o);
  },
  treeDday(t) {
    const o = out(0.4), q = 0.27;
    const E = 659.3, G = 784, C = 523.3, D = 587.3;
    const mel = [[E, 0, 1], [E, 1, 1], [E, 2, 2], [E, 4, 1], [E, 5, 1], [E, 6, 2], [E, 8, 1], [G, 9, 1], [C, 10, 1.5], [D, 11.5, 0.5], [E, 12, 4]];
    mel.forEach(([f, at, len]) => {
      const tt = t + at * q;
      bell(f * 2, tt, 0.2, 0.5 + len * 0.45, o, [[1, 1], [2, 0.25], [3.01, 0.12], [4.17, 0.05]]);   // 글로켄슈필
      tone('triangle', f, tt, 0.004, 0.07, len * q * 1.1, o);                                         // 아래 받쳐 주는 소리
    });
    // 베이스 (도·솔)
    [[C / 4, 0], [G / 4, 2], [C / 4, 4], [G / 4, 6], [C / 4, 8], [G / 4, 10], [C / 4, 12]].forEach(([f, at]) => tone('sine', f, t + at * q, 0.01, 0.16, q * 1.8, o));
    for (let i = 0; i <= 16; i++) SOUNDS.sleigh(t + i * q, i % 2 ? 0.6 : 1);
    SOUNDS.jingle(t + 16 * q);
  },

  // 🌕 달
  // 짧은 울음 (클릭용): "아우" 한 번
  howlShort(t) { howlVoice(t, 1.5, [300, 470, 500, 380], 0.22, 0.45); burst(t, 1.4, 0.02, 'bandpass', 900, 1, out(0.4)); },
  wolfClick(t) { sample('wolfShort', t, 1.0, 0.12); },
  wolfDday(t) { sample('wolfDday', t, 1.0, 0.2); },
  howl(t) {
    // 늑대 울음: 낮게 시작해 미끄러지듯 올라갔다가 길게 끌며 내려옴. 멀리서 다른 늑대가 한 번 더
    howlVoice(t, 3.6, [260, 520, 560, 330], 0.3, 0.7); howlVoice(t, 3.6, [262, 524, 566, 334], 0.1, 0.7);
    howlVoice(t + 1.9, 2.6, [340, 600, 610, 420], 0.07, 0.95);
    burst(t, 3.6, 0.03, 'bandpass', 900, 1, out(0.6));
  },
  // ⛪ 고해실
  lockRattle(t) { const o = out(0.15); for (let i = 0; i < 3; i++) { burst(t + i * 0.07, 0.05, 0.45, 'bandpass', 1500, 3, o); tone('square', 620 + i * 45, t + i * 0.07, 0.001, 0.05, 0.05, o); burst(t + i * 0.07, 0.06, 0.25, 'lowpass', 500, 1, o); } },
  // 나무 문 두드리기: 똑, 똑 (손가락 마디로 두꺼운 나무를 치는 소리)
  knock(t) {
    const o = out(0.3);
    [0, 0.19, 0.45].forEach((d, i) => {
      const tt = t + d, v = i === 2 ? 0.8 : 1;
      const os = ctx.createOscillator(), g = ctx.createGain(); os.type = 'sine';
      os.frequency.setValueAtTime(190, tt); os.frequency.exponentialRampToValueAtTime(120, tt + 0.07);
      env(g, tt, 0.002, 0.5 * v, 0.09); os.connect(g).connect(o); os.start(tt); os.stop(tt + 0.15);
      burst(tt, 0.05, 0.6 * v, 'bandpass', 850, 2.2, o);       // 나무 판 울림
      burst(tt, 0.015, 0.25 * v, 'bandpass', 2600, 3, o);      // 마디가 닿는 딱
    });
  },
  doorClose(t) { thump(t); },
  // D-day: 자물쇠가 철컥 풀리고 바닥에 떨어져 데구르르
  unlock(t) {
    const o = out(0.2);
    burst(t, 0.03, 0.5, 'bandpass', 1300, 3, o); tone('square', 500, t, 0.001, 0.06, 0.04, o);
    burst(t + 0.09, 0.02, 0.35, 'bandpass', 1800, 4, o);
    [0.55, 0.78, 0.92, 1.0].forEach((d, i) => { bell(900 - i * 40, t + d, 0.08 / (i + 1), 0.25, o, [[1, 1], [2.3, 0.5], [3.9, 0.25]]); burst(t + d, 0.02, 0.2 / (i + 1), 'lowpass', 700, 1, o); });
  },
  confessionDday(t) { SOUNDS.churchBell(t); SOUNDS.unlock(t + 2.2); },
  churchBell(t) {
    const o = out(0.9);
    // 실제 종의 배음 비율 (hum, prime, tierce, quint, nominal ...)
    const P = [[0.5, 0.6], [1, 1], [1.183, 0.5], [1.506, 0.3], [2, 0.45], [2.514, 0.15], [2.662, 0.12], [3.011, 0.1], [4.166, 0.05]];
    [0, 1.6, 3.2].forEach(d => bell(196, t + d, 0.38, 5.5, o, P));
  },
};

// 소리 장치 깨우기: 맥이 잠들었다 깨거나 이어폰·스피커가 바뀌면 소리 장치가 '멈춤'이나 '끊김'(interrupted) 상태가 됨.
// 다시 켜 보고, 잠깐 안에 안 켜지면 장치를 새로 만들어서라도 소리가 나게 함
function wake(c) {
  if (c.state === 'running') return Promise.resolve(c);
  const resumed = c.resume().then(() => c).catch(() => null);
  const timeout = new Promise(r => setTimeout(() => r(null), 400));
  return Promise.race([resumed, timeout]).then(ok => {
    if (ok && ok.state === 'running') return ok;
    try { c.close(); } catch (e) {}
    ctx = null; const n = ac(); if (n.state !== 'running') n.resume().catch(() => {});
    return n;
  });
}

export const Sound = {
  get enabled() { return enabled; },
  setEnabled(on) { enabled = !!on; },
  /** 사용자가 한 번 누른 뒤에야 소리가 나는 브라우저가 있어서, 클릭 때마다 깨워 둠 */
  unlock() { const c = ac(); if (!c) return; wake(c); unlocked = true; },
  get unlocked() { return unlocked && ctx && ctx.state === 'running'; },
  play(name, delay = 0) {
    if (!enabled || !SOUNDS[name]) return;
    const c = ac(); if (!c) return;
    const go = (cc) => { try { SOUNDS[name](cc.currentTime + 0.02 + delay); } catch (e) { console.warn('sound', name, e); } };
    if (c.state === 'running') return go(c);
    wake(c).then(go);
  },
  names: Object.keys(SOUNDS),
};
