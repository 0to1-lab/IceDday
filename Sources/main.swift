// Ice D-day — 바탕화면에 떠 있는 D-day 위젯 (얼음이 녹고, 빵이 구워지고, 알이 깨짐)
// 얇은 Swift 껍데기: 투명 창 + 웹뷰(Three.js 장면) + 자동 누끼(Vision) + 메뉴바 아이콘
// 위젯을 여러 개 띄울 수 있고, 위젯마다 D-day·제목·사진·테마·크기·위치가 따로 있음
import AppKit
import WebKit
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import ServiceManagement

// MARK: - 위젯 하나의 설정

struct WidgetModel: Codable {
    var id: String
    var title = ""
    var target: Date? = nil
    var start: Date? = nil
    var theme = "ice"
    var variants: [String: String] = [:]   // 테마마다 고른 종류 (얼음: cube/ball/chunk …)
    var ovenColor = "red"
    var scale = 1.0
    var origin: [Double]? = nil

    init(id: String) { self.id = id }

    // 나중에 항목이 늘어나도 예전 저장값을 읽을 수 있게, 없는 항목은 기본값으로
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        target = try c.decodeIfPresent(Date.self, forKey: .target)
        start = try c.decodeIfPresent(Date.self, forKey: .start)
        theme = try c.decodeIfPresent(String.self, forKey: .theme) ?? "ice"
        variants = try c.decodeIfPresent([String: String].self, forKey: .variants) ?? [:]
        ovenColor = try c.decodeIfPresent(String.self, forKey: .ovenColor) ?? "red"
        scale = try c.decodeIfPresent(Double.self, forKey: .scale) ?? 1.0
        origin = try c.decodeIfPresent([Double].self, forKey: .origin)
    }

    var variant: String { variants[theme] ?? Catalog.themes.first { $0.theme == theme }?.variant ?? "cube" }
    var clampedScale: Double { min(Catalog.scaleRange.upperBound, max(Catalog.scaleRange.lowerBound, scale)) }
    var displayName: String { title.isEmpty ? "D-day" : title }
    var emoji: String { theme == "oven" ? "🍞" : theme == "egg" ? "🥚" : "❄️" }
    var themeIndex: Int {
        Catalog.themes.firstIndex { $0.theme == theme && $0.variant == variant } ?? Catalog.themes.firstIndex { $0.theme == theme } ?? 0
    }

    /// 진행도(0~1), 라벨(D-12 등), D-day가 됐는지
    func progressInfo(now: Date = Date()) -> (progress: Double, label: String, celebrate: Bool) {
        guard let target else { return (0, "오른쪽 클릭 → D-day 설정", false) }
        let cal = Calendar.current
        let targetDay = cal.startOfDay(for: target)
        let s = start ?? now
        let total = targetDay.timeIntervalSince(s)
        let progress = total > 0 ? min(1, max(0, now.timeIntervalSince(s) / total)) : 1
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: now), to: targetDay).day ?? 0
        let label = days > 0 ? "D-\(days)" : days == 0 ? "D-DAY" : "D+\(-days)"
        return (progress, label, days <= 0)
    }
}

enum Catalog {
    static let scaleRange = 0.5...1.35
    // 테마 · 종류 목록 (메뉴와 설정창에서 같이 씀)
    static let themes: [(theme: String, variant: String, group: String, name: String)] = [
        ("ice", "cube", "얼음", "각얼음"), ("ice", "ball", "얼음", "얼음 공"), ("ice", "chunk", "얼음", "수정 모양 얼음"),
        ("oven", "retro", "오븐", "레트로 오븐"),
        ("egg", "white", "알", "하얀 달걀"), ("egg", "brown", "알", "갈색 달걀"), ("egg", "dino", "알", "공룡알"), ("egg", "fantasy", "알", "판타지 알"),
    ]
    // 레트로 오븐 색
    static let ovenColors: [(key: String, name: String)] = [("red", "빨강"), ("mint", "민트"), ("cream", "크림"), ("sky", "하늘색"), ("black", "검정")]
}

// MARK: - 저장값

enum Paths {
    // 누끼 결과를 두는 곳
    static let support: URL = {
        let u = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("IceDday", isDirectory: true)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }()
    static func cutout(_ id: String) -> URL { support.appendingPathComponent("cutout-\(id).png") }
}

enum Store {
    static let d = UserDefaults.standard

    static func load() -> [WidgetModel] {
        if let data = d.data(forKey: "widgets"), let list = try? JSONDecoder().decode([WidgetModel].self, from: data) {
            return list
        }
        // 1.0(위젯 하나짜리)에서 넘어온 경우: 예전 설정을 첫 위젯으로 옮김
        var m = WidgetModel(id: "w1")
        m.title = d.string(forKey: "title") ?? ""
        m.target = d.object(forKey: "target") as? Date
        m.start = d.object(forKey: "start") as? Date
        m.theme = d.string(forKey: "theme") ?? "ice"
        for th in ["ice", "oven", "egg"] { if let v = d.string(forKey: "variant.\(th)") { m.variants[th] = v } }
        if m.variants["ice"] == nil, let s = d.string(forKey: "shape") { m.variants["ice"] = s }
        m.ovenColor = d.string(forKey: "ovenColor") ?? "red"
        let sc = d.double(forKey: "scale"); if sc > 0 { m.scale = sc }
        if let a = d.array(forKey: "origin") as? [Double], a.count == 2 { m.origin = a }
        let old = support("cutout.png")
        if FileManager.default.fileExists(atPath: old.path) { try? FileManager.default.moveItem(at: old, to: Paths.cutout(m.id)) }
        return [m]
    }
    private static func support(_ name: String) -> URL { Paths.support.appendingPathComponent(name) }

    static func save(_ list: [WidgetModel]) {
        if let data = try? JSONEncoder().encode(list) { d.set(data, forKey: "widgets") }
    }
}

// MARK: - 누끼 (Apple Vision, 기기 안에서 처리)

enum Cutout {
    /// 사진을 읽어 방향을 바로잡고 크기를 줄인 뒤, 주인공만 남긴 PNG를 저장
    static func make(from url: URL, to out: URL) -> Bool {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return false }
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,   // 사진 회전 정보 반영
            kCGImageSourceThumbnailMaxPixelSize: 1400,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return false }

        var result: CGImage = image
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
            if let obs = request.results?.first, !obs.allInstances.isEmpty {
                let buffer = try obs.generateMaskedImage(ofInstances: obs.allInstances, from: handler, croppedToInstancesExtent: true)
                let ci = CIImage(cvPixelBuffer: buffer)
                if let cg = CIContext().createCGImage(ci, from: ci.extent) { result = cg }
            }
        } catch {
            NSLog("IceDday: 누끼 실패, 원본 사용 — \(error)")
        }

        guard let dest = CGImageDestinationCreateWithURL(out as CFURL, UTType.png.identifier as CFString, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, result, nil)
        return CGImageDestinationFinalize(dest)
    }
}

// MARK: - 메뉴·버튼·슬라이더에 클로저를 바로 연결하는 도우미

@MainActor
final class Action: NSObject {
    let fn: () -> Void
    init(_ fn: @escaping () -> Void) { self.fn = fn }
    @objc func run() { fn() }
}

@MainActor
func menuItem(_ title: String, on: Bool = false, enabled: Bool = true, _ fn: (() -> Void)? = nil) -> NSMenuItem {
    let i = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    if let fn {
        let a = Action(fn)
        i.target = a
        i.action = #selector(Action.run)
        i.representedObject = a            // 메뉴 항목이 살아 있는 동안 동작도 유지
    }
    i.state = on ? .on : .off
    i.isEnabled = enabled
    return i
}

@MainActor
final class ActionSlider: NSSlider {
    var onChange: ((Double) -> Void)?
    @objc func fire(_ sender: NSSlider) { onChange?(sender.doubleValue) }
}

// MARK: - 마우스 처리 (끌면 회전, 길게 눌러 끌거나 ⌘+끌기는 이동, 클릭은 테마 반응)

final class DragView: NSView {
    var onClick: ((NSPoint) -> Void)?    // 클릭한 곳 (뷰 좌표, 왼쪽 아래 기준)
    var onMenu: ((NSEvent) -> Void)?
    var onDragEnd: (() -> Void)?
    var onZoom: ((CGFloat) -> Void)?     // 크기 배율 변화 (1.0 = 그대로)
    var onSpin: ((CGFloat) -> Void)?     // 끌어서 돌리기 (가로 이동 픽셀)
    var onSpinEnd: (() -> Void)?
    var onLift: ((Bool) -> Void)?        // 길게 눌러 '들린' 상태 표시
    private(set) var dragging = false
    private var startMouse = NSPoint.zero
    private var lastMouse = NSPoint.zero
    private var startOrigin = NSPoint.zero
    private var moved = false
    private var moveMode = false         // 길게 누르거나 ⌘ 누르고 끌면 위치 이동, 바로 끌면 회전
    private var pressTimer: Timer?

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func hitTest(_ point: NSPoint) -> NSView? { frame.contains(point) ? self : nil }

    override func mouseDown(with event: NSEvent) {
        guard let w = window else { return }
        dragging = true; moved = false
        moveMode = event.modifierFlags.contains(.command)
        startMouse = NSEvent.mouseLocation
        lastMouse = startMouse
        startOrigin = w.frame.origin
        // 0.35초 동안 거의 안 움직이고 누르고 있으면 → 이동 모드
        pressTimer?.invalidate()
        pressTimer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.dragging, !self.moved, !self.moveMode else { return }
                self.moveMode = true
                self.startMouse = NSEvent.mouseLocation
                self.startOrigin = self.window?.frame.origin ?? .zero
                NSCursor.closedHand.set()
                self.onLift?(true)
            }
        }
    }
    override func mouseDragged(with event: NSEvent) {
        guard let w = window else { return }
        let now = NSEvent.mouseLocation
        let dx = now.x - startMouse.x, dy = now.y - startMouse.y
        if abs(dx) + abs(dy) > 3 { moved = true; if !moveMode { pressTimer?.invalidate() } }
        if moveMode {
            w.setFrameOrigin(NSPoint(x: startOrigin.x + dx, y: startOrigin.y + dy))
        } else if moved {
            onSpin?(now.x - lastMouse.x)
        }
        lastMouse = now
    }
    override func mouseUp(with event: NSEvent) {
        dragging = false
        pressTimer?.invalidate()
        if moveMode {
            NSCursor.arrow.set()
            onLift?(false)
            if moved { onDragEnd?() }
        }
        else if !moved { onClick?(convert(event.locationInWindow, from: nil)) }
        else { onSpinEnd?() }
    }
    override func rightMouseDown(with event: NSEvent) { onMenu?(event) }

    // ⌥(option) 누른 채 스크롤 → 크기 조절
    override func scrollWheel(with event: NSEvent) {
        guard event.modifierFlags.contains(.option) else { return }
        let dy = event.scrollingDeltaY
        let step: CGFloat = event.hasPreciseScrollingDeltas ? 0.004 : 0.04
        if dy != 0 { onZoom?(1 + dy * step) }
    }
    // 트랙패드 두 손가락 벌리기/오므리기 → 크기 조절
    override func magnify(with event: NSEvent) { onZoom?(1 + event.magnification) }
}

// MARK: - 위젯 하나 (창 + 3D 장면)

@MainActor
final class Widget: NSObject, WKScriptMessageHandler {
    static let baseSize = NSSize(width: 340, height: 460)
    var model: WidgetModel { didSet { app?.save() } }
    weak var app: AppDelegate?
    var window: NSWindow!
    var web: WKWebView!
    var dragView: DragView!
    var hitRect: NSRect?            // 웹 좌표(왼쪽 위 기준)로 받은, 실제로 그려진 범위
    var hovering = false
    var webReady = false
    var processing = false
    let sizeLabels = NSHashTable<NSTextField>.weakObjects()

    var size: NSSize { NSSize(width: Self.baseSize.width * model.clampedScale, height: Self.baseSize.height * model.clampedScale) }

    init(model: WidgetModel, app: AppDelegate, slot: Int) {
        self.model = model
        self.app = app
        super.init()
        makeWindow(slot: slot)
    }

    // 투명하고 테두리 없는 창을 바탕화면 아이콘 바로 위 층에 띄움
    private func makeWindow(slot: Int) {
        window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "ice")
        web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: config)
        web.setValue(false, forKey: "drawsBackground")      // 웹뷰 배경 투명
        web.underPageBackgroundColor = .clear
        web.autoresizingMask = [.width, .height]

        dragView = DragView(frame: NSRect(origin: .zero, size: size))
        dragView.autoresizingMask = [.width, .height]
        dragView.onClick = { [weak self] _ in self?.js("IceDday.poke()") }
        dragView.onMenu = { [weak self] e in
            guard let self, let app = self.app, let v = self.dragView else { return }
            NSMenu.popUpContextMenu(app.contextMenu(for: self), with: e, for: v)
        }
        dragView.onDragEnd = { [weak self] in self?.rememberOrigin() }
        dragView.onZoom = { [weak self] k in guard let self else { return }; self.applyScale(self.model.scale * Double(k)) }
        dragView.onSpin = { [weak self] dx in self?.js("IceDday.spin(\(Double(dx)))") }
        dragView.onSpinEnd = { [weak self] in self?.js("IceDday.spinEnd()") }
        dragView.onLift = { [weak self] on in self?.js("IceDday.setLifted(\(on))") }

        let container = NSView(frame: NSRect(origin: .zero, size: size))
        container.addSubview(web)
        container.addSubview(dragView)
        window.contentView = container

        if let o = model.origin, o.count == 2 { window.setFrameOrigin(NSPoint(x: o[0], y: o[1])) } else { resetPosition(slot: slot) }
        keepOnScreen()
        window.orderFrontRegardless()

        if let dir = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true) {
            web.loadFileURL(dir.appendingPathComponent("index.html"), allowingReadAccessTo: dir)
        }
    }

    func js(_ code: String) { if webReady { web.evaluateJavaScript(code) } }

    /// 화면 오른쪽 아래부터 왼쪽으로 한 칸씩 (slot = 몇 번째 위젯인지)
    func resetPosition(slot: Int = 0) {
        guard let vf = NSScreen.main?.visibleFrame else { return }
        let s = size
        let x = max(vf.minX + 20, vf.maxX - s.width - 40 - CGFloat(slot) * (s.width * 0.85))
        window.setFrameOrigin(NSPoint(x: x, y: vf.minY + 40))
        rememberOrigin()
    }
    func rememberOrigin() { model.origin = [Double(window.frame.origin.x), Double(window.frame.origin.y)] }

    func keepOnScreen() {
        let f = window.frame
        if !NSScreen.screens.contains(where: { $0.visibleFrame.intersects(f) }) { resetPosition() }
    }

    // 크기 바꾸기: 바닥 가운데를 기준으로 커지거나 작아짐 (50% ~ 135%)
    func applyScale(_ value: Double) {
        let v = min(Catalog.scaleRange.upperBound, max(Catalog.scaleRange.lowerBound, value))
        guard abs(v - model.clampedScale) > 0.0005 else { return }
        let old = window.frame
        model.scale = v
        let s = size
        let f = NSRect(x: old.midX - s.width / 2, y: old.minY, width: s.width, height: s.height)
        window.setFrame(f, display: true)
        rememberOrigin()
        hitRect = nil
        let text = "\(Int((v * 100).rounded()))%"
        sizeLabels.allObjects.forEach { $0.stringValue = text }
    }

    // 진행도 계산 → 장면에 전달
    func pushState() {
        guard webReady else { return }
        let info = model.progressInfo()
        let payload: [String: Any] = ["progress": info.progress, "title": model.title, "daysLabel": info.label, "celebrate": info.celebrate,
                                      "theme": model.theme, "variant": model.variant, "color": model.ovenColor]
        guard let json = try? JSONSerialization.data(withJSONObject: payload),
              let s = String(data: json, encoding: .utf8) else { return }
        js("IceDday.setState(\(s))")
    }

    func pushPhoto() {
        guard webReady else { return }
        guard let data = try? Data(contentsOf: Paths.cutout(model.id)) else { js("IceDday.setPhoto(null)"); return }
        js("IceDday.setPhoto('data:image/png;base64,\(data.base64EncodedString())')")
    }

    /// 고른 사진의 배경을 지워서 이 위젯에 넣음
    func usePhoto(_ url: URL) {
        guard !processing else { return }
        processing = true
        let out = Paths.cutout(model.id)
        Task.detached(priority: .userInitiated) {
            let ok = Cutout.make(from: url, to: out)
            await MainActor.run { [weak self] in
                self?.processing = false
                if ok { self?.pushPhoto() }
            }
        }
    }

    // 클릭 통과 (물체가 없는 투명한 곳은 바탕화면이 클릭되게)
    func updateClickThrough() {
        if dragView.dragging { window.ignoresMouseEvents = false; return }
        guard let r = hitRect else { window.ignoresMouseEvents = false; return }
        let f = window.frame
        let screenRect = NSRect(x: f.minX + r.minX, y: f.maxY - r.maxY, width: r.width, height: r.height).insetBy(dx: -6, dy: -6)
        let inside = screenRect.contains(NSEvent.mouseLocation)
        if window.ignoresMouseEvents == inside { window.ignoresMouseEvents = !inside }
        if inside != hovering { hovering = inside; js("IceDday.setHover(\(inside))") }
    }

    func close() {
        web.configuration.userContentController.removeScriptMessageHandler(forName: "ice")
        window.orderOut(nil)
        window.close()
        try? FileManager.default.removeItem(at: Paths.cutout(model.id))
    }

    // 웹 장면에서 오는 메시지
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "ready":
            webReady = true
            pushState()
            pushPhoto()
            if model.target == nil {   // 날짜가 없으면 바로 정할 수 있게
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                    MainActor.assumeIsolated { if let self { self.app?.openSettings(self) } }
                }
            }
        case "hit":
            func n(_ k: String) -> CGFloat { CGFloat((body[k] as? NSNumber)?.doubleValue ?? 0) }
            hitRect = NSRect(x: n("x"), y: n("y"), width: n("w"), height: n("h"))
        default: break
        }
    }
}

// MARK: - 앱

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    var widgets: [Widget] = []
    var statusItem: NSStatusItem!
    var settingsOpen = false

    func applicationDidFinishLaunching(_ note: Notification) {
        for (i, m) in Store.load().enumerated() { widgets.append(Widget(model: m, app: self, slot: i)) }
        save()
        makeStatusItem()

        // 1분마다 진행도 갱신, 0.05초마다 클릭 통과 판정 (타이머·알림은 모두 메인 스레드에서 실행됨)
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.pushAll() } }
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in MainActor.assumeIsolated { self?.widgets.forEach { $0.updateClickThrough() } } }
        NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in MainActor.assumeIsolated { self?.pushAll() } }
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in MainActor.assumeIsolated { self?.widgets.forEach { $0.keepOnScreen() } } }
    }

    func save() { Store.save(widgets.map { $0.model }) }
    func pushAll() { widgets.forEach { $0.pushState() }; refreshMenu() }

    // MARK: 위젯 추가 · 닫기

    func addWidget() {
        var m = WidgetModel(id: "w" + String(UUID().uuidString.prefix(8)).lowercased())
        if let last = widgets.last { m.theme = last.model.theme; m.variants = last.model.variants; m.ovenColor = last.model.ovenColor }
        let w = Widget(model: m, app: self, slot: widgets.count)
        widgets.append(w)
        save()
        refreshMenu()   // 날짜가 없으니 장면이 준비되면 설정창이 자동으로 열림
    }

    func closeWidget(_ w: Widget) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = "'\(w.model.displayName)' 위젯을 닫을까요?"
        a.informativeText = "이 위젯의 D-day와 사진 설정이 지워져요."
        a.addButton(withTitle: "닫기")
        a.addButton(withTitle: "취소")
        guard a.runModal() == .alertFirstButtonReturn else { return }
        w.close()
        widgets.removeAll { $0 === w }
        save()
        refreshMenu()
    }

    // MARK: 메뉴바 아이콘

    func makeStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let img = NSImage(systemSymbolName: "snowflake", accessibilityDescription: "Ice D-day") {
            img.isTemplate = true
            statusItem.button?.image = img
        } else {
            statusItem.button?.title = "❄︎"
        }
        refreshMenu()
    }

    func refreshMenu() { statusItem?.menu = buildMenu() }

    /// 메뉴바 ❄️ 메뉴: 위젯이 하나면 바로 보이고, 여러 개면 위젯별 하위 메뉴
    func buildMenu() -> NSMenu {
        let m = NSMenu()
        if widgets.count == 1, let w = widgets.first {
            widgetItems(w).forEach { m.addItem($0) }
        } else {
            for w in widgets {
                let info = w.model.progressInfo()
                let it = NSMenuItem(title: "\(w.model.emoji)  \(w.model.displayName)  \(w.model.target == nil ? "" : info.label)", action: nil, keyEquivalent: "")
                let sub = NSMenu()
                widgetItems(w).forEach { sub.addItem($0) }
                it.submenu = sub
                m.addItem(it)
            }
            if widgets.count > 1 {
                m.addItem(.separator())
                m.addItem(menuItem("모두 미리보기") { [weak self] in self?.widgets.forEach { $0.js("IceDday.preview()") } })
            }
        }
        m.addItem(.separator())
        m.addItem(menuItem("＋ 위젯 추가") { [weak self] in self?.addWidget() })
        m.addItem(menuItem("로그인 시 자동 실행", on: SMAppService.mainApp.status == .enabled) { [weak self] in self?.toggleLogin() })
        m.addItem(.separator())
        m.addItem(menuItem("종료") { NSApp.terminate(nil) })
        return m
    }

    /// 위젯을 오른쪽 클릭했을 때: 그 위젯 메뉴 + 위젯 추가 + 종료
    func contextMenu(for w: Widget) -> NSMenu {
        let m = NSMenu()
        widgetItems(w).forEach { m.addItem($0) }
        m.addItem(.separator())
        m.addItem(menuItem("＋ 위젯 추가") { [weak self] in self?.addWidget() })
        m.addItem(menuItem("종료") { NSApp.terminate(nil) })
        return m
    }

    /// 위젯 하나에 대한 메뉴 항목들
    func widgetItems(_ w: Widget) -> [NSMenuItem] {
        var items: [NSMenuItem] = []
        items.append(menuItem("D-day 설정…") { [weak self, weak w] in if let w { self?.openSettings(w) } })
        items.append(menuItem("사진 고르기…") { [weak self, weak w] in if let w { self?.pickPhoto(for: w) } })
        items.append(menuItem("진행 과정 미리보기") { [weak w] in w?.js("IceDday.preview()") })
        items.append(.separator())

        // 크기: 메뉴 안의 슬라이더로 끄는 대로 바로 바뀜
        let sizeItem = NSMenuItem(title: "크기", action: nil, keyEquivalent: "")
        let sizeMenu = NSMenu()
        let sliderItem = NSMenuItem()
        sliderItem.view = makeSizeSlider(for: w, width: 230)
        sizeMenu.addItem(sliderItem)
        sizeMenu.addItem(.separator())
        sizeMenu.addItem(menuItem("기본 크기로") { [weak self, weak w] in w?.applyScale(1.0); self?.refreshMenu() })
        sizeMenu.addItem(menuItem("⌥+스크롤 또는 핀치로도 조절돼요", enabled: false))
        sizeItem.submenu = sizeMenu
        items.append(sizeItem)

        let themeItem = NSMenuItem(title: "테마", action: nil, keyEquivalent: "")
        let themeMenu = NSMenu()
        let cur = w.model.themeIndex
        var lastGroup = ""
        for (i, t) in Catalog.themes.enumerated() {
            if t.group != lastGroup {
                if !lastGroup.isEmpty { themeMenu.addItem(.separator()) }
                themeMenu.addItem(menuItem(t.group, enabled: false))
                lastGroup = t.group
            }
            themeMenu.addItem(menuItem("   " + t.name, on: i == cur) { [weak self, weak w] in if let w { self?.selectTheme(i, for: w) } })
        }
        themeItem.submenu = themeMenu
        items.append(themeItem)

        if w.model.theme == "oven" {
            let colorItem = NSMenuItem(title: "오븐 색", action: nil, keyEquivalent: "")
            let colorMenu = NSMenu()
            for c in Catalog.ovenColors {
                colorMenu.addItem(menuItem(c.name, on: w.model.ovenColor == c.key) { [weak self, weak w] in
                    guard let w else { return }
                    w.model.ovenColor = c.key; w.pushState(); self?.refreshMenu()
                })
            }
            colorItem.submenu = colorMenu
            items.append(colorItem)
        }
        items.append(menuItem("위치 처음으로") { [weak self, weak w] in
            guard let self, let w else { return }
            w.resetPosition(slot: self.widgets.firstIndex { $0 === w } ?? 0)
        })
        items.append(.separator())
        items.append(menuItem("이 위젯 닫기") { [weak self, weak w] in if let w { self?.closeWidget(w) } })
        return items
    }

    // 크기 슬라이더 (50% ~ 135%, 5% 간격)
    func makeSizeSlider(for w: Widget, width: CGFloat) -> NSView {
        let v = NSView(frame: NSRect(x: 0, y: 0, width: width, height: 34))
        let slider = ActionSlider(frame: NSRect(x: 16, y: 6, width: width - 76, height: 24))
        slider.minValue = Catalog.scaleRange.lowerBound
        slider.maxValue = Catalog.scaleRange.upperBound
        slider.doubleValue = w.model.clampedScale
        slider.isContinuous = true
        slider.numberOfTickMarks = 18                      // 5% 간격 눈금
        slider.allowsTickMarkValuesOnly = true
        slider.target = slider
        slider.action = #selector(ActionSlider.fire(_:))
        slider.onChange = { [weak w] value in w?.applyScale(value) }
        let label = NSTextField(labelWithString: "\(Int((w.model.clampedScale * 100).rounded()))%")
        label.frame = NSRect(x: width - 56, y: 9, width: 48, height: 18)
        label.alignment = .right
        label.font = .monospacedDigitSystemFont(ofSize: 12, weight: .regular)
        v.addSubview(slider); v.addSubview(label)
        w.sizeLabels.add(label)
        return v
    }

    func selectTheme(_ i: Int, for w: Widget) {
        let t = Catalog.themes[max(0, min(Catalog.themes.count - 1, i))]
        w.model.theme = t.theme
        w.model.variants[t.theme] = t.variant
        w.pushState()
        refreshMenu()
    }

    func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
        } catch {
            alert("자동 실행을 바꾸지 못했어요", "앱을 '응용 프로그램' 폴더로 옮긴 뒤 다시 시도해 주세요.\n(\(error.localizedDescription))")
        }
        refreshMenu()
    }

    // MARK: 설정창 (위젯마다)

    func openSettings(_ w: Widget) {
        guard !settingsOpen else { return }
        settingsOpen = true
        defer { settingsOpen = false }
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert()
        a.messageText = widgets.count > 1 ? "D-day 설정 — \(w.model.emoji) \(w.model.displayName)" : "D-day 설정"
        a.informativeText = "날짜를 바꾸면 처음 상태로 돌아가고, 그날부터 D-day까지 천천히 진행돼요."
        a.addButton(withTitle: "저장")
        a.addButton(withTitle: "취소")

        let v = NSView(frame: NSRect(x: 0, y: 0, width: 300, height: 216))
        let shapeLabel = NSTextField(labelWithString: "테마")
        shapeLabel.frame = NSRect(x: 0, y: 192, width: 280, height: 18)
        let shapePop = NSPopUpButton(frame: NSRect(x: 0, y: 164, width: 196, height: 26), pullsDown: false)
        shapePop.addItems(withTitles: Catalog.themes.map { "\($0.group) · \($0.name)" })
        shapePop.selectItem(at: w.model.themeIndex)
        let colorLabel = NSTextField(labelWithString: "오븐 색")
        colorLabel.frame = NSRect(x: 206, y: 192, width: 94, height: 18)
        let colorPop = NSPopUpButton(frame: NSRect(x: 204, y: 164, width: 96, height: 26), pullsDown: false)
        colorPop.addItems(withTitles: Catalog.ovenColors.map { $0.name })
        colorPop.selectItem(at: Catalog.ovenColors.firstIndex { $0.key == w.model.ovenColor } ?? 0)
        let titleLabel = NSTextField(labelWithString: "제목")
        titleLabel.frame = NSRect(x: 0, y: 140, width: 280, height: 18)
        let titleField = NSTextField(frame: NSRect(x: 0, y: 116, width: 280, height: 24))
        titleField.placeholderString = "예: 기말고사"
        titleField.stringValue = w.model.title
        let dateLabel = NSTextField(labelWithString: "D-day 날짜")
        dateLabel.frame = NSRect(x: 0, y: 90, width: 280, height: 18)
        let picker = NSDatePicker(frame: NSRect(x: 0, y: 64, width: 160, height: 24))
        picker.datePickerStyle = .textFieldAndStepper
        picker.datePickerElements = .yearMonthDay
        picker.dateValue = w.model.target ?? Calendar.current.date(byAdding: .day, value: 30, to: Date())!
        let photoAction = Action { [weak self, weak w] in if let w { self?.pickPhoto(for: w) } }
        let photoButton = NSButton(title: "사진 고르기…", target: photoAction, action: #selector(Action.run))
        photoButton.frame = NSRect(x: 168, y: 62, width: 112, height: 28)
        let sizeLabel = NSTextField(labelWithString: "크기")
        sizeLabel.frame = NSRect(x: 0, y: 26, width: 280, height: 18)
        let sizeRow = makeSizeSlider(for: w, width: 300)
        sizeRow.frame.origin = NSPoint(x: -16, y: -6)
        [shapeLabel, shapePop, colorLabel, colorPop, titleLabel, titleField, dateLabel, picker, photoButton, sizeLabel, sizeRow].forEach { v.addSubview($0) }
        a.accessoryView = v
        a.window.initialFirstResponder = titleField

        let response = withExtendedLifetime(photoAction) { a.runModal() }
        guard response == .alertFirstButtonReturn else { return }
        let cal = Calendar.current
        let newTarget = cal.startOfDay(for: picker.dateValue)
        let changed = w.model.target.map { !cal.isDate($0, inSameDayAs: newTarget) } ?? true
        w.model.title = titleField.stringValue.trimmingCharacters(in: .whitespaces)
        if changed {
            w.model.target = newTarget
            w.model.start = Date()            // 지금부터 시작
        }
        w.model.ovenColor = Catalog.ovenColors[max(0, colorPop.indexOfSelectedItem)].key
        selectTheme(shapePop.indexOfSelectedItem, for: w)
    }

    func pickPhoto(for w: Widget) {
        NSApp.activate(ignoringOtherApps: true)
        let p = NSOpenPanel()
        p.allowedContentTypes = [.image]
        p.allowsMultipleSelection = false
        p.message = widgets.count > 1 ? "'\(w.model.displayName)' 위젯에 넣을 사진을 골라 주세요. 배경은 자동으로 지워져요." : "위젯에 넣을 사진을 골라 주세요. 배경은 자동으로 지워져요."
        guard p.runModal() == .OK, let url = p.url else { return }
        w.usePhoto(url)
    }

    func alert(_ title: String, _ text: String) {
        NSApp.activate(ignoringOtherApps: true)
        let a = NSAlert(); a.messageText = title; a.informativeText = text; a.runModal()
    }
}

// MARK: - 시작

// 앱 시작 코드는 메인 스레드에서 실행됨을 Swift에 알려 줌
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)   // Dock 아이콘 없이 메뉴바에만
    withExtendedLifetime(delegate) { app.run() }
}
