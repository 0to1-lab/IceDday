// 윈도우용 앱 만들기:  cd win && npm install && npm run dist
// 1) src/ → web/ice.bundle.js 다시 빌드  2) 위젯 화면 준비  3) Windows용 Electron 앱으로 묶기  4) zip
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const pkg = require('./package.json');

function prepare() {
  execSync('npm run build:web', { cwd: ROOT, stdio: 'inherit' });
  fs.copyFileSync(path.join(ROOT, 'web', 'ice.bundle.js'), path.join(__dirname, 'renderer', 'ice.bundle.js'));
  // 맥과 같은 화면(web/index.html)에 윈도우용 스크립트(누끼·마우스)만 더함
  const html = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8')
    .replace('<script src="ice.bundle.js"></script>',
      '<script>window.ICE_EXTERNAL_UI = true;</script>\n<script src="ice.bundle.js"></script>\n<script src="cutout.js"></script>\n<script src="input.js"></script>');
  fs.writeFileSync(path.join(__dirname, 'renderer', 'widget.html'), html);
}

async function dist() {
  prepare();
  const { packager } = require('@electron/packager');
  const out = path.join(__dirname, 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  const [appDir] = await packager({
    dir: __dirname, out, name: 'Ice D-day', executableName: 'Ice D-day',
    platform: 'win32', arch: 'x64', icon: path.join(__dirname, 'assets', 'icon.ico'),
    asar: false, overwrite: true, prune: true,
    appCopyright: 'Ice D-day', win32metadata: { CompanyName: 'Ice D-day', FileDescription: 'Ice D-day', ProductName: 'Ice D-day' },
    ignore: [/^\/dist($|\/)/, /^\/build-win\.js$/, /^\/renderer\/_/, /\.map$/],
  });
  // 안 쓰는 언어 파일 정리 (한국어·영어만 남김)
  const loc = path.join(appDir, 'locales');
  for (const f of fs.readdirSync(loc)) if (!/^(ko|en-US)\.pak$/.test(f)) fs.rmSync(path.join(loc, f));
  // koffi: 윈도우 64비트용만 남김
  const kb = path.join(appDir, 'resources', 'app', 'node_modules', 'koffi', 'build', 'koffi');
  if (fs.existsSync(kb)) for (const f of fs.readdirSync(kb)) if (f !== 'win32_x64') fs.rmSync(path.join(kb, f), { recursive: true });
  const folder = path.join(out, 'Ice D-day');
  fs.renameSync(appDir, folder);
  const zip = `Ice-D-day-Windows-${pkg.version}.zip`;
  execSync(`zip -qr -9 "${zip}" "Ice D-day"`, { cwd: out });
  console.log(`\n완성: win/dist/${zip}`);
}

if (process.argv.includes('--prepare')) prepare();
else dist().catch(e => { console.error(e); process.exit(1); });
