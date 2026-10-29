#!/bin/bash
# Ice D-day 빌드: 터미널에서  ./build.sh  한 번이면 build/ 폴더에 앱과 배포용 zip이 생겨요.
set -euo pipefail
cd "$(dirname "$0")"

NAME="Ice D-day"
EXEC="IceDday"
APP="build/$NAME.app"
VERSION="1.1"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "⚠️  Swift 컴파일러가 없어요. 아래 명령으로 Command Line Tools를 먼저 설치해 주세요:"
  echo "    xcode-select --install"
  exit 1
fi

echo "❄️  빌드 시작…"
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
SDK="$(xcrun --show-sdk-path)"

# Apple 실리콘(M1~)과 인텔 맥 둘 다 돌아가게 각각 빌드 후 합침 (인텔 쪽이 실패하면 실리콘용만)
BINS=()
for ARCH in arm64 x86_64; do
  if swiftc -O -swift-version 5 -sdk "$SDK" -target "$ARCH-apple-macos14.0" \
       Sources/main.swift -o "build/$EXEC-$ARCH" 2> "build/swiftc-$ARCH.log"; then
    BINS+=("build/$EXEC-$ARCH")
  else
    echo "   ($ARCH 빌드 실패 — build/swiftc-$ARCH.log 참고)"
  fi
done
if [ ${#BINS[@]} -eq 0 ]; then
  echo "❌ 빌드 실패. 오류 내용:"; cat build/swiftc-arm64.log; exit 1
fi
lipo -create "${BINS[@]}" -output "$APP/Contents/MacOS/$EXEC"
rm -f "${BINS[@]}"

# 웹(3D 장면) 파일
cp web/index.html web/ice.bundle.js "$APP/Contents/Resources/web/"

# 앱 아이콘
if [ -f assets/icon.png ]; then
  ICONSET="build/AppIcon.iconset"; mkdir -p "$ICONSET"
  for S in 16 32 128 256 512; do
    sips -z $S $S assets/icon.png --out "$ICONSET/icon_${S}x${S}.png" >/dev/null
    sips -z $((S*2)) $((S*2)) assets/icon.png --out "$ICONSET/icon_${S}x${S}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
  rm -rf "$ICONSET"
fi

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleDisplayName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>io.github.icedday</string>
  <key>CFBundleExecutable</key><string>$EXEC</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# 개발자 등록 없이 쓰는 임시 서명 (내 맥에서는 바로 실행됨)
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

# 친구에게 보낼 zip
ditto -c -k --keepParent "$APP" "build/Ice-D-day-$VERSION.zip"

echo "✅ 완료!"
echo "   앱:  $APP"
echo "   배포용: build/Ice-D-day-$VERSION.zip"
echo "   실행:  open \"$APP\""
