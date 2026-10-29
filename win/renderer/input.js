// 윈도우 위젯의 마우스 처리 (맥의 DragView와 같은 동작)
// 클릭 = 테마 반응, 바로 끌기 = 돌리기, 0.35초 길게 누르거나 Ctrl+끌기 = 위치 옮기기,
// Alt/Ctrl+휠 또는 터치패드 핀치 = 크기, 오른쪽 클릭 = 메뉴
(function () {
  const api = window.iceNative;
  if (!api) return;
  const cv = document.getElementById('scene');
  let down = false, moved = false, moveMode = false, sx = 0, sy = 0, lx = 0, timer = null, pid = null, downAt = 0;

  function startMove(e) {
    moveMode = true;
    api.postMessage({ type: 'move-start', x: e.screenX, y: e.screenY });
    IceDday.setLifted(true);
    document.body.style.cursor = 'grabbing';
  }

  cv.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    down = true; moved = false; moveMode = false; pid = e.pointerId; downAt = e.timeStamp;
    sx = lx = e.screenX; sy = e.screenY;
    cv.setPointerCapture(e.pointerId);
    api.postMessage({ type: 'drag', on: true });
    if (e.ctrlKey) startMove(e);
    else {
      const at = { screenX: e.screenX, screenY: e.screenY };
      timer = setTimeout(() => { if (down && !moved && !moveMode) startMove(last || at); }, 350);
    }
  });
  let last = null;
  cv.addEventListener('pointermove', e => {
    if (!down || e.pointerId !== pid) return;
    last = { screenX: e.screenX, screenY: e.screenY };
    if (Math.abs(e.screenX - sx) + Math.abs(e.screenY - sy) > 5) { if (!moved && !moveMode) clearTimeout(timer); moved = true; }
    if (moveMode) api.postMessage({ type: 'move', x: e.screenX, y: e.screenY });
    else if (moved) IceDday.spin(e.screenX - lx);
    lx = e.screenX;
  });
  function end(e) {
    if (!down) return;
    const cancel = e && e.type !== 'pointerup';
    down = false; clearTimeout(timer); last = null;
    // 컴퓨터가 버벅여서 '길게 누르기' 타이머가 늦게 돌아도, 실제로 짧게 눌렀다 뗐으면 클릭으로 처리
    const quick = !cancel && e && e.timeStamp && e.timeStamp - downAt < 350 && !moved;
    if (moveMode) { IceDday.setLifted(false); api.postMessage({ type: 'move-end' }); document.body.style.cursor = ''; if (quick) IceDday.poke(); }
    else if (!moved) { if (!cancel) IceDday.poke(); }
    else IceDday.spinEnd();
    moveMode = false;
    api.postMessage({ type: 'drag', on: false });
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('lostpointercapture', end);

  window.addEventListener('contextmenu', e => { e.preventDefault(); api.postMessage({ type: 'menu' }); });

  window.addEventListener('wheel', e => {
    if (!(e.altKey || e.ctrlKey)) return;          // 터치패드 핀치도 Ctrl+휠로 들어옴
    e.preventDefault();
    const k = Math.exp(-Math.max(-120, Math.min(120, e.deltaY)) * 0.0015);
    api.postMessage({ type: 'zoom', k });
  }, { passive: false });
})();
