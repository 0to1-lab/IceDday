// 위젯을 '바탕화면 바로 위' 층에 붙여 둠 (맥의 desktopIconWindow + 1 과 같은 효과)
// - 다른 창을 열면 그 창이 위젯을 덮음
// - 위젯을 클릭해도 다른 창 위로 올라오지 않음
// - Win+D(바탕화면 보기)를 누르면 위젯은 바탕화면과 함께 보임
// Windows 기본 기능(user32.dll)을 koffi로 직접 부름. 실패하면 아무것도 안 함(보통 창처럼 동작).
let api = null;

function load() {
  if (api !== null) return api;
  api = false;
  if (process.platform !== 'win32') return api;
  try {
    const koffi = require('koffi');
    const u = koffi.load('user32.dll');
    api = {
      FindWindowW: u.func('uintptr_t __stdcall FindWindowW(str16 cls, str16 name)'),
      FindWindowExW: u.func('uintptr_t __stdcall FindWindowExW(uintptr_t parent, uintptr_t after, str16 cls, str16 name)'),
      GetWindow: u.func('uintptr_t __stdcall GetWindow(uintptr_t h, uint32_t cmd)'),
      SetWindowPos: u.func('bool __stdcall SetWindowPos(uintptr_t h, uintptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
    };
  } catch (e) { console.error('desktop-layer: 사용할 수 없음', e); api = false; }
  return api;
}

const GW_HWNDPREV = 3;
const HWND_TOP = 0;
const FLAGS = 0x0001 | 0x0002 | 0x0010 | 0x0200;   // NOSIZE | NOMOVE | NOACTIVATE | NOOWNERZORDER

// 바탕화면 아이콘이 들어 있는 창 (Progman 또는 그 옆의 WorkerW)
function desktopHost(a) {
  const progman = a.FindWindowW('Progman', null);
  if (progman && a.FindWindowExW(progman, 0, 'SHELLDLL_DefView', null)) return progman;
  let w = 0;
  for (let i = 0; i < 64; i++) {
    w = a.FindWindowExW(0, w, 'WorkerW', null);
    if (!w) break;
    if (a.FindWindowExW(w, 0, 'SHELLDLL_DefView', null)) return w;
  }
  return progman;
}

const toNum = h => (typeof h === 'bigint' ? h : BigInt(h));

/** 위젯 창을 바탕화면 바로 위로 옮김. 이미 그 자리면 아무것도 안 함. */
function pinToDesktop(win) {
  const a = load();
  if (!a || !win || win.isDestroyed()) return false;
  try {
    const buf = win.getNativeWindowHandle();
    const me = buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0));
    const host = desktopHost(a);
    if (!host) return false;
    const above = toNum(a.GetWindow(host, GW_HWNDPREV));   // 바탕화면 바로 위에 있는 창
    if (above === me) return true;                          // 이미 제자리
    // SetWindowPos(창, X)는 창을 X 바로 아래에 둠 → 바탕화면 바로 위 창의 아래 = 바탕화면 바로 위
    a.SetWindowPos(me, above ? above : HWND_TOP, 0, 0, 0, 0, FLAGS);
    return true;
  } catch (e) { console.error('desktop-layer', e); return false; }
}

module.exports = { pinToDesktop, available: () => !!load() };
