// Ice D-day (Windows) — Electron 껍데기
// 맥 버전(Sources/main.swift)과 같은 일을 함: 투명 창 + 3D 장면 + 자동 누끼 + 트레이 아이콘 메뉴
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, nativeImage, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { pinToDesktop } = require('./desktop-layer');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.setAppUserModelId('IceDday');

// ───────── 저장값 ─────────
// 위젯을 여러 개 띄울 수 있고, 위젯마다 D-day·제목·사진·테마·크기·위치가 따로 있음
const SUPPORT = app.getPath('userData');
const SETTINGS = path.join(SUPPORT, 'settings.json');
const cutoutPath = id => path.join(SUPPORT, `cutout-${id}.png`);

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } }
const saved = readJSON(SETTINGS);
const store = { onTop: !!saved.onTop, quality: saved.quality || 'auto', updateAlerted: saved.updateAlerted || '', widgets: [] };
const blank = id => ({ id, title: '', target: null, start: null, theme: 'ice', variants: {}, ovenColor: 'red', scale: 1, pos: null });
if (Array.isArray(saved.widgets)) store.widgets = saved.widgets.map(m => Object.assign(blank(m.id || newId()), m));
else {
  // 1.0(위젯 하나짜리)에서 넘어온 경우: 예전 설정을 첫 위젯으로 옮김
  const m = blank('w1');
  for (const k of ['title', 'target', 'start', 'theme', 'variants', 'ovenColor', 'scale', 'pos']) if (saved[k] != null) m[k] = saved[k];
  const old = path.join(SUPPORT, 'cutout.png');
  try { if (fs.existsSync(old)) fs.renameSync(old, cutoutPath('w1')); } catch { }
  store.widgets = [m];
}
function newId() { return 'w' + Math.random().toString(36).slice(2, 10); }
let saveTimer = null;
function save() {
  store.widgets = widgets.map(w => w.m);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(SETTINGS, JSON.stringify(store, null, 1)); } catch (e) { console.error(e); } }, 150);
}
function saveNow() { clearTimeout(saveTimer); store.widgets = widgets.map(w => w.m); try { fs.writeFileSync(SETTINGS, JSON.stringify(store, null, 1)); } catch { } }

const THEMES = [
  ['ice', 'cube', '얼음', '각얼음'], ['ice', 'ball', '얼음', '얼음 공'], ['ice', 'chunk', '얼음', '수정 모양 얼음'],
  ['oven', 'retro', '오븐', '레트로 오븐'],
  ['egg', 'white', '알', '하얀 달걀'], ['egg', 'brown', '알', '갈색 달걀'], ['egg', 'dino', '알', '공룡알'], ['egg', 'fantasy', '알', '판타지 알'],
].map(([theme, variant, group, name]) => ({ theme, variant, group, name }));
const OVEN_COLORS = [['red', '빨강'], ['mint', '민트'], ['cream', '크림'], ['sky', '하늘색'], ['black', '검정']];
const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.avif': 'image/avif' };

const BASE = { w: 340, h: 460 };
const SCALE_MIN = 0.5, SCALE_MAX = 1.35;
let tray = null, liteOn = false, menuTimer = null;
const widgets = [];
const refreshSoon = (ms = 300) => { clearTimeout(menuTimer); menuTimer = setTimeout(refreshMenu, ms); };

// 앱 파일을 app:// 주소로 열어서 누끼 모델(wasm)도 문제없이 읽히게 함
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const dayStart = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// ───────── 위젯 하나 (창 + 3D 장면) ─────────
class Widget {
  constructor(m, slot) {
    this.m = m;
    this.hit = null; this.dragging = false; this.ready = false; this.processing = false; this.ignoring = false;
    this.moveFrom = null; this.settingsWin = null;
    const { width, height } = this.size();
    const win = this.win = new BrowserWindow({
      width, height, transparent: true, backgroundColor: '#00000000', frame: false, resizable: false,
      maximizable: false, minimizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false,
      alwaysOnTop: !!store.onTop, show: false, title: 'Ice D-day',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    win.setMenu(null);
    if (m.pos) win.setBounds({ ...m.pos, width, height }); else this.resetPosition(slot);
    this.keepOnScreen();
    win.webContents.on('did-finish-load', () => win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => { }));
    win.loadURL('app://ice/renderer/widget.html');
    win.once('ready-to-show', () => { win.showInactive(); this.keepLayer(); });
    win.on('focus', () => this.keepLayer());     // 클릭해서 앞으로 올라와도 바로 바탕화면 층으로 돌려보냄
  }
  get name() { return this.m.title || 'D-day'; }
  get emoji() { return this.m.theme === 'oven' ? '🍞' : this.m.theme === 'egg' ? '🥚' : '❄️'; }
  variant() { return this.m.variants[this.m.theme] || THEMES.find(t => t.theme === this.m.theme).variant; }
  themeIndex() { return Math.max(0, THEMES.findIndex(t => t.theme === this.m.theme && t.variant === this.variant())); }
  size() { const k = Math.min(SCALE_MAX, Math.max(SCALE_MIN, this.m.scale || 1)); return { width: Math.round(BASE.w * k), height: Math.round(BASE.h * k) }; }
  js(code) { return this.win.isDestroyed() ? Promise.resolve() : this.win.webContents.executeJavaScript(code).catch(e => console.error(e)); }

  // 화면 오른쪽 아래부터 왼쪽으로 한 칸씩
  resetPosition(slot = 0) {
    const wa = screen.getPrimaryDisplay().workArea, { width, height } = this.size();
    const x = Math.max(wa.x + 20, wa.x + wa.width - width - 40 - Math.round(slot * width * 0.85));
    const b = { x, y: wa.y + wa.height - height - 20, width, height };
    this.win.setBounds(b);
    this.m.pos = { x: b.x, y: b.y }; save();
  }
  keepOnScreen() {
    const b = this.win.getBounds();
    const ok = screen.getAllDisplays().some(d => {
      const a = d.workArea;
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
    });
    if (!ok) this.resetPosition(widgets.indexOf(this));
  }
  // 크기 바꾸기: 바닥 가운데를 기준으로 (50% ~ 135%)
  applyScale(v) {
    v = Math.min(SCALE_MAX, Math.max(SCALE_MIN, v));
    if (Math.abs(v - this.m.scale) < 0.0005) return;
    const old = this.win.getBounds();
    this.m.scale = v;
    const { width, height } = this.size();
    const b = { x: Math.round(old.x + old.width / 2 - width / 2), y: old.y + old.height - height, width, height };
    this.win.setBounds(b);
    this.m.pos = { x: b.x, y: b.y }; this.hit = null;
    save();
    this.settingsWin?.webContents.send('scale', this.m.scale);
    refreshSoon();
  }
  // 맥처럼 바탕화면 바로 위 층에 두기 ('항상 위에 표시'를 켜면 대신 맨 위)
  keepLayer() { if (!store.onTop && !this.win.isDestroyed()) pinToDesktop(this.win); }

  // 클릭 통과: 물체가 없는 투명한 곳은 바탕화면이 클릭되게
  updateClickThrough() {
    let want = false;
    if (!this.dragging && this.hit) {
      const b = this.win.getBounds(), m = screen.getCursorScreenPoint(), pad = 6, h = this.hit;
      const inside = m.x >= b.x + h.x - pad && m.x <= b.x + h.x + h.w + pad && m.y >= b.y + h.y - pad && m.y <= b.y + h.y + h.h + pad;
      want = !inside;
    }
    if (want !== this.ignoring) { this.ignoring = want; this.win.setIgnoreMouseEvents(want); }
  }

  progressInfo() {
    const now = new Date(), m = this.m;
    if (!m.target) return { progress: 0, label: '오른쪽 클릭 → D-day 설정', celebrate: false };
    const [Y, M, D] = m.target.split('-').map(Number);
    const targetDay = new Date(Y, M - 1, D);
    const start = m.start || now.getTime();
    const total = targetDay.getTime() - start;
    const progress = total > 0 ? Math.min(1, Math.max(0, (now.getTime() - start) / total)) : 1;
    const days = Math.round((targetDay - dayStart(now)) / 86400000);
    return { progress, label: days > 0 ? `D-${days}` : days === 0 ? 'D-DAY' : `D+${-days}`, celebrate: days <= 0 };
  }
  pushState() {
    if (!this.ready) return;
    const i = this.progressInfo();
    const s = { progress: i.progress, title: this.m.title, daysLabel: i.label, celebrate: i.celebrate, theme: this.m.theme, variant: this.variant(), color: this.m.ovenColor };
    this.js(`IceDday.setState(${JSON.stringify(s)})`);
  }
  pushPhoto() {
    if (!this.ready) return;
    const f = cutoutPath(this.m.id);
    if (!fs.existsSync(f)) { this.js('IceDday.setPhoto(null)'); return; }
    this.js(`IceDday.setPhoto('data:image/png;base64,${fs.readFileSync(f).toString('base64')}')`);
  }
  // 고른 사진의 배경을 지워서 이 위젯에 넣음 (누끼는 위젯 화면 안에서 처리)
  async usePhoto(file) {
    if (this.processing) return;
    this.processing = true;
    try {
      const mime = IMG_EXT[path.extname(file).toLowerCase()] || 'image/png';
      const url = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
      const r = await this.win.webContents.executeJavaScript(`IceCutout(${JSON.stringify(url)})`);
      fs.writeFileSync(cutoutPath(this.m.id), Buffer.from(r.url.split(',')[1], 'base64'));
      this.pushPhoto();
    } catch (e) {
      console.error('누끼 실패', e);
      dialog.showMessageBox({ type: 'warning', message: '사진을 넣지 못했어요', detail: String(e.message || e) });
    } finally { this.processing = false; }
  }
  async pickPhoto(parent) {
    const r = await dialog.showOpenDialog(parent || undefined, {
      title: widgets.length > 1 ? `'${this.name}' 위젯에 넣을 사진 고르기` : '위젯에 넣을 사진 고르기', buttonLabel: '이 사진으로',
      filters: [{ name: '사진', extensions: Object.keys(IMG_EXT).map(e => e.slice(1)) }], properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return false;
    this.usePhoto(r.filePaths[0]);
    return true;
  }

  // 설정창 (위젯마다)
  openSettings() {
    if (this.settingsWin) { this.settingsWin.show(); this.settingsWin.focus(); return; }
    const sw = this.settingsWin = new BrowserWindow({
      width: 400, height: 600, useContentSize: true, resizable: false, maximizable: false, minimizable: false,
      title: widgets.length > 1 ? `D-day 설정 — ${this.name}` : 'D-day 설정',
      icon: path.join(__dirname, 'assets', 'icon.ico'), autoHideMenuBar: true, show: false, backgroundColor: '#f6f7f9',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
    sw.setMenu(null);
    sw.loadURL('app://ice/renderer/settings.html');
    sw.once('ready-to-show', () => sw.show());
    sw.on('page-title-updated', e => e.preventDefault());
    sw.on('closed', () => { this.settingsWin = null; });
  }

  selectTheme(i) {
    const t = THEMES[Math.max(0, Math.min(THEMES.length - 1, i))];
    this.m.theme = t.theme; this.m.variants[t.theme] = t.variant; save();
    refreshMenu(); this.pushState();
  }

  destroy() {
    this.settingsWin?.close();
    if (!this.win.isDestroyed()) this.win.destroy();
    try { fs.rmSync(cutoutPath(this.m.id), { force: true }); } catch { }
  }

  // 위젯 화면에서 오는 메시지
  onMessage(m) {
    const win = this.win;
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.js(`IceDday.setQuality(${JSON.stringify(store.quality)})`);
        this.pushState();
        this.pushPhoto();
        if (!this.m.target) setTimeout(() => this.openSettings(), 600);     // 날짜가 없으면 바로 정할 수 있게
        break;
      case 'hit': this.hit = { x: m.x, y: m.y, w: m.w, h: m.h }; break;
      case 'drag': this.dragging = !!m.on; this.updateClickThrough(); break;
      case 'move-start': { const b = win.getBounds(); this.moveFrom = { mx: m.x, my: m.y, x: b.x, y: b.y }; break; }
      case 'move':
        if (this.moveFrom) { const { width, height } = this.size(), f = this.moveFrom; win.setBounds({ x: Math.round(f.x + m.x - f.mx), y: Math.round(f.y + m.y - f.my), width, height }); }
        break;
      case 'move-end': if (this.moveFrom) { const b = win.getBounds(); this.m.pos = { x: b.x, y: b.y }; save(); this.moveFrom = null; } break;
      case 'zoom': this.applyScale(this.m.scale * (+m.k || 1)); break;
      case 'menu': contextMenu(this).popup({ window: win }); break;
      case 'lite': if (liteOn !== !!m.on) { liteOn = !!m.on; refreshSoon(); } break;
    }
  }
}

// ───────── 새 버전 확인 (GitHub의 최신 릴리스 번호만 물어봄, 개인정보는 보내지 않음) ─────────
const REPO = '0to1-lab/IceDday';
let update = null;   // { version, url }
function isNewer(a, b) {
  const p = s => String(s).replace(/^v/i, '').split('.').map(x => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; }
  return false;
}
async function checkForUpdate(manual) {
  try {
    const r = await net.fetch(process.env.ICE_UPDATE_API || `https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'IceDday' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = String(j.tag_name || '').replace(/^v/i, '');
    if (!v || !isNewer(v, app.getVersion())) {
      if (manual) dialog.showMessageBox({ type: 'info', message: '최신 버전이에요', detail: `지금 쓰는 버전: v${app.getVersion()}` });
      return;
    }
    update = { version: v, url: j.html_url || `https://github.com/${REPO}/releases/latest` };
    refreshMenu();
    if (manual || store.updateAlerted !== v) {        // 버전마다 한 번만 알림
      store.updateAlerted = v; save();
      tray?.displayBalloon({ title: `Ice D-day 새 버전(v${v})이 나왔어요`, content: '여기를 누르면 받는 곳이 열려요. D-day와 사진 설정은 그대로 이어져요.', iconType: 'info' });
    }
  } catch (e) {
    if (manual) dialog.showMessageBox({ type: 'warning', message: '업데이트를 확인하지 못했어요', detail: '인터넷 연결을 확인하고 다시 시도해 주세요.' });
  }
}
const openUpdate = () => update && shell.openExternal(update.url);
const updateItems = () => update ? [{ label: `⬆ 새 버전 v${update.version} 받기`, click: openUpdate }, { type: 'separator' }] : [];

// ───────── 위젯 추가 · 닫기 ─────────
function addWidget() {
  const last = widgets[widgets.length - 1];
  const m = blank(newId());
  if (last) { m.theme = last.m.theme; m.variants = { ...last.m.variants }; m.ovenColor = last.m.ovenColor; }
  widgets.push(new Widget(m, widgets.length));   // 날짜가 없으니 장면이 준비되면 설정창이 자동으로 열림
  save(); refreshMenu();
}
async function closeWidget(w) {
  const r = await dialog.showMessageBox({
    type: 'question', buttons: ['닫기', '취소'], defaultId: 1, cancelId: 1,
    message: `'${w.name}' 위젯을 닫을까요?`, detail: '이 위젯의 D-day와 사진 설정이 지워져요.',
  });
  if (r.response !== 0) return;
  widgets.splice(widgets.indexOf(w), 1);
  w.destroy();
  saveNow(); refreshMenu();
}

// ───────── 메뉴 (트레이 아이콘 · 위젯 오른쪽 클릭) ─────────
function widgetItems(w) {
  const cur = w.themeIndex();
  const themeItems = [];
  let lastGroup = '';
  THEMES.forEach((t, i) => {
    if (t.group !== lastGroup) { if (lastGroup) themeItems.push({ type: 'separator' }); themeItems.push({ label: t.group, enabled: false }); lastGroup = t.group; }
    themeItems.push({ label: '   ' + t.name, type: 'checkbox', checked: i === cur, click: () => w.selectTheme(i) });   // 구역이 나뉘어도 체크는 하나만 (radio는 구역마다 따로 체크됨)
  });
  const sizes = [];
  for (let p = 50; p <= 135; p += 5) sizes.push({ label: `${p}%`, type: 'radio', checked: Math.round(w.m.scale * 100) === p, click: () => w.applyScale(p / 100) });
  const items = [
    { label: 'D-day 설정…', click: () => w.openSettings() },
    { label: '사진 고르기…', click: () => w.pickPhoto() },
    { label: '진행 과정 미리보기', click: () => w.js('IceDday.preview()') },
    { type: 'separator' },
    { label: `크기 (${Math.round(w.m.scale * 100)}%)`, submenu: [...sizes, { type: 'separator' }, { label: '기본 크기로', click: () => w.applyScale(1) }, { label: 'Alt+휠 또는 Ctrl+휠로도 조절돼요', enabled: false }] },
    { label: '테마', submenu: themeItems },
  ];
  if (w.m.theme === 'oven') items.push({ label: '오븐 색', submenu: OVEN_COLORS.map(([k, n]) => ({ label: n, type: 'radio', checked: w.m.ovenColor === k, click: () => { w.m.ovenColor = k; save(); refreshMenu(); w.pushState(); } })) });
  items.push({ label: '위치 처음으로', click: () => w.resetPosition(widgets.indexOf(w)) });
  items.push({ type: 'separator' }, { label: '이 위젯 닫기', click: () => closeWidget(w) });
  return items;
}
function appItems() {
  return [
    { label: '화질', submenu: [
      { label: `자동${store.quality === 'auto' ? (liteOn ? ' (지금: 가볍게)' : ' (지금: 높게)') : ''}`, type: 'radio', checked: store.quality === 'auto', click: () => setQuality('auto') },
      { label: '높게', type: 'radio', checked: store.quality === 'high', click: () => setQuality('high') },
      { label: '가볍게 (느린 컴퓨터용)', type: 'radio', checked: store.quality === 'lite', click: () => setQuality('lite') },
      { type: 'separator' },
      { label: '성능 정보 보기', click: showPerf },
    ] },
    { label: '항상 위에 표시', type: 'checkbox', checked: !!store.onTop, click: m => { store.onTop = m.checked; save(); widgets.forEach(w => { w.win.setAlwaysOnTop(m.checked); w.keepLayer(); }); } },
    { label: '로그인 시 자동 실행', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: m => { app.setLoginItemSettings({ openAtLogin: m.checked }); refreshMenu(); } },
    { label: `업데이트 확인 (지금 v${app.getVersion()})`, click: () => checkForUpdate(true) },
  ];
}
// 트레이 메뉴: 위젯이 하나면 바로 보이고, 여러 개면 위젯별 하위 메뉴
function buildMenu() {
  const t = [...updateItems()];
  if (widgets.length === 1) t.push(...widgetItems(widgets[0]));
  else {
    for (const w of widgets) t.push({ label: `${w.emoji}  ${w.name}  ${w.m.target ? w.progressInfo().label : ''}`, submenu: widgetItems(w) });
    if (widgets.length > 1) t.push({ type: 'separator' }, { label: '모두 미리보기', click: () => widgets.forEach(w => w.js('IceDday.preview()')) });
  }
  t.push({ type: 'separator' }, { label: '＋ 위젯 추가', click: addWidget }, ...appItems(), { type: 'separator' }, { label: '종료', click: () => app.quit() });
  return Menu.buildFromTemplate(t);
}
// 위젯을 오른쪽 클릭했을 때: 그 위젯 메뉴 + 위젯 추가 + 종료
function contextMenu(w) {
  return Menu.buildFromTemplate([...updateItems(), ...widgetItems(w), { type: 'separator' }, { label: '＋ 위젯 추가', click: addWidget }, { label: '종료', click: () => app.quit() }]);
}
let lastMenuKey = '';
function refreshMenu() { lastMenuKey = menuKey(); tray?.setContextMenu(buildMenu()); }
const menuKey = () => widgets.map(w => w.name + w.progressInfo().label).join('|');

function setQuality(q) { store.quality = q; save(); widgets.forEach(w => w.js(`IceDday.setQuality(${JSON.stringify(q)})`)); refreshMenu(); }
async function showPerf() {
  const p = await widgets[0]?.js('IceDday.getPerf()') || {};
  const gpu = app.getGPUFeatureStatus();
  dialog.showMessageBox({
    type: 'info', title: 'Ice D-day 성능 정보', buttons: ['확인'],
    message: p.fps ? `켠 지 3~8초 사이에 초당 ${p.fps.toFixed(1)}장 그렸어요 (목표 30장)` : '측정 중이거나 자동 모드가 아니에요',
    detail: [`지금 화질: ${p.lite ? '가볍게' : '높게'} (설정: ${{ auto: '자동', high: '높게', lite: '가볍게' }[p.quality] || p.quality})`,
      `그래픽: ${p.gpu || '알 수 없음'}`, `WebGL 가속: ${gpu.webgl}`,
      '', '초당 15장보다 적으면 컴퓨터가 느린 편이라 자동으로 가볍게 바뀌어요.', '위젯이 여러 개면 그만큼 더 무거워져요.'].join('\n'),
  });
}

function makeTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Ice D-day — 클릭하면 메뉴 (설정·위젯 추가·종료)');
  refreshMenu();
  tray.on('click', () => tray.popUpContextMenu());
  tray.on('balloon-click', openUpdate);
  if (!widgets.some(w => w.m.target)) tray.displayBalloon({ title: 'Ice D-day가 켜졌어요', content: '설정·위젯 추가·종료는 위젯을 오른쪽 클릭하거나, 여기 트레이의 Ice D-day 아이콘에서 할 수 있어요.', iconType: 'info' });
}

// ───────── 설정창 · 위젯 메시지 연결 ─────────
const bySettings = e => widgets.find(w => w.settingsWin && !w.settingsWin.isDestroyed() && w.settingsWin.webContents === e.sender);
const byWidget = e => widgets.find(w => !w.win.isDestroyed() && w.win.webContents === e.sender);

ipcMain.handle('settings:get', e => {
  const w = bySettings(e); if (!w) return null;
  return {
    title: w.m.title, target: w.m.target, themeIndex: w.themeIndex(), ovenColor: w.m.ovenColor, scale: w.m.scale,
    themes: THEMES.map(t => `${t.group} · ${t.name}`), colors: OVEN_COLORS, hasPhoto: fs.existsSync(cutoutPath(w.m.id)),
    heading: widgets.length > 1 ? `D-day 설정 — ${w.emoji} ${w.name}` : 'D-day 설정',
  };
});
ipcMain.handle('settings:save', (e, s) => {
  const w = bySettings(e); if (!w) return;
  w.m.title = String(s.title || '').trim();
  if (s.target && s.target !== w.m.target) { w.m.target = s.target; w.m.start = Date.now(); }  // 날짜를 바꾸면 지금부터 시작
  if (OVEN_COLORS.some(([k]) => k === s.ovenColor)) w.m.ovenColor = s.ovenColor;
  save();
  w.selectTheme(+s.themeIndex || 0);
  w.settingsWin?.close();
});
ipcMain.handle('settings:photo', e => { const w = bySettings(e); return w ? w.pickPhoto(w.settingsWin) : false; });
ipcMain.on('settings:scale', (e, v) => bySettings(e)?.applyScale(+v));
ipcMain.on('ice', (e, m) => { if (m) byWidget(e)?.onMessage(m); });

// ───────── 시작 ─────────
app.on('second-instance', () => widgets[0]?.openSettings());
app.on('window-all-closed', () => { /* 트레이에 남아 있음 */ });
app.on('before-quit', saveNow);
app.whenReady().then(() => {
  protocol.handle('app', req => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(__dirname, decodeURIComponent(u.pathname)));
    if (!file.startsWith(__dirname)) return new Response('no', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  store.widgets.forEach((m, i) => widgets.push(new Widget(m, i)));
  saveNow();
  makeTray();
  setInterval(() => { widgets.forEach(w => w.pushState()); if (menuKey() !== lastMenuKey) refreshMenu(); }, 60 * 1000);
  setInterval(() => widgets.forEach(w => w.updateClickThrough()), 50);
  setInterval(() => widgets.forEach(w => w.keepLayer()), 300);
  setTimeout(() => checkForUpdate(false), 8000);                 // 켜고 8초 뒤, 그 뒤로 6시간마다 새 버전 확인
  setInterval(() => checkForUpdate(false), 6 * 3600 * 1000);
  require('electron').powerMonitor.on('resume', () => widgets.forEach(w => w.pushState()));
  const keep = () => widgets.forEach(w => w.keepOnScreen());
  screen.on('display-removed', keep);
  screen.on('display-metrics-changed', keep);
});

// 개발용 자가 점검: ICE_SELFTEST=폴더 로 실행하면 화면을 찍어 저장하고 종료 (ICE_SELFTEST_ADD=1 이면 위젯 하나 추가)
if (process.env.ICE_SELFTEST) app.whenReady().then(() => {
  if (process.env.ICE_SELFTEST_ADD) setTimeout(addWidget, 1500);
  setTimeout(async () => {
    const out = process.env.ICE_SELFTEST;
    try {
      for (const [i, w] of widgets.entries()) {
        try { fs.writeFileSync(path.join(out, `widget${i}.png`), (await w.win.capturePage()).toPNG()); } catch (e) { }
        try { if (w.settingsWin) fs.writeFileSync(path.join(out, `settings${i}.png`), (await w.settingsWin.capturePage()).toPNG()); } catch (e) { }
      }
      saveNow();
      fs.writeFileSync(path.join(out, 'state.json'), JSON.stringify({ liteOn, store, widgets: widgets.map(w => ({ id: w.m.id, hit: w.hit, ready: w.ready, bounds: w.win.getBounds(), settings: !!w.settingsWin })) }, null, 1));
      fs.writeFileSync(path.join(out, 'menu.json'), JSON.stringify(buildMenu().items.map(i => i.label)));
    } catch (e) { fs.writeFileSync(path.join(out, 'error.txt'), String(e.stack)); }
    app.exit(0);
  }, +process.env.ICE_SELFTEST_WAIT || 9000);
});
