import SwiftUI
import WebKit

struct SpaceView: View {
    let spaceID: UUID

    @Environment(SpaceStore.self) private var store
    @Environment(SessionCache.self) private var sessions
    @Environment(LockState.self) private var locks
    @Environment(Navigator.self) private var navigator
    @State private var editing: Space?

    var body: some View {
        Group {
            if let space = store.space(with: spaceID) {
                content(for: space)
                    .navigationTitle(space.name)
                    .toolbarTitleMenu {
                        Picker("Space", selection: Binding(get: { spaceID }, set: { navigator.show($0) })) {
                            ForEach(store.spaces) { other in
                                Text(other.name).tag(other.id)
                            }
                        }
                    }
                    .toolbar {
                        // Nothing about a locked space's page is reachable until it's unlocked.
                        if locks.isUnlocked(space) {
                            ToolbarItem(placement: .topBarTrailing) {
                                actionsMenu(for: space)
                            }
                        }
                    }
                    .onChange(of: shouldStartSession(for: space), initial: true) { _, start in
                        if start {
                            sessions.session(for: space)
                        }
                    }
                    .sheet(item: $editing) { space in
                        SpaceForm(mode: .edit(space))
                    }
            } else {
                ContentUnavailableView("Space Deleted", systemImage: "trash")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var session: SpaceSession? {
        sessions.existingSession(for: spaceID)
    }

    /// A session starts once the space is unlocked, and starts again if an edit replaced it or its data was cleared.
    private func shouldStartSession(for space: Space) -> Bool {
        locks.isUnlocked(space) && session == nil && !sessions.clearing.contains(space.id)
    }

    @ViewBuilder
    private func content(for space: Space) -> some View {
        if !locks.isUnlocked(space) {
            LockedView(space: space) {
                await locks.unlock(space)
            }
        } else if let session {
            SpaceWebView(session: session)
        } else {
            Color(.systemBackground)
        }
    }

    private func actionsMenu(for space: Space) -> some View {
        Menu {
            if let url = session?.url, let host = url.host(), let home = space.startURL, !WebAddress.isSameSite(url, as: home) {
                // The page has moved to another site, so say which one.
                Text(host)
            }
            ControlGroup {
                Button("Back", systemImage: "chevron.backward") {
                    session?.webView.goBack()
                }
                .disabled(session?.canGoBack != true)
                Button("Forward", systemImage: "chevron.forward") {
                    session?.webView.goForward()
                }
                .disabled(session?.canGoForward != true)
                Button("Reload", systemImage: "arrow.clockwise") {
                    session?.reload()
                }
            }

            Section("Page Zoom") {
                ControlGroup {
                    Button("Zoom Out", systemImage: "minus.magnifyingglass") {
                        setZoom(PageZoom.smaller(than: space.pageZoom), of: space)
                    }
                    .disabled(PageZoom.smaller(than: space.pageZoom) == nil)
                    Button(space.pageZoom.formatted(.percent.precision(.fractionLength(0)))) {
                        setZoom(1, of: space)
                    }
                    Button("Zoom In", systemImage: "plus.magnifyingglass") {
                        setZoom(PageZoom.larger(than: space.pageZoom), of: space)
                    }
                    .disabled(PageZoom.larger(than: space.pageZoom) == nil)
                }
            }

            Section {
                Toggle("Desktop Site", systemImage: "desktopcomputer", isOn: Binding(
                    get: { space.desktopSite },
                    set: { isOn in
                        var updated = space
                        updated.desktopSite = isOn
                        store.update(updated)
                    }
                ))
                if let url = session?.url {
                    ShareLink("Share Page", item: url)
                }
                Button("Edit Space", systemImage: "slider.horizontal.3") {
                    editing = space
                }
            }
        } label: {
            Label("Actions", systemImage: "ellipsis")
        }
    }

    private func setZoom(_ zoom: Double?, of space: Space) {
        guard let zoom else { return }
        var updated = space
        updated.pageZoom = zoom
        store.update(updated)
    }
}

/// The page itself, with a progress bar while it loads and a retry screen when it can't.
private struct SpaceWebView: View {
    @Bindable var session: SpaceSession
    @Environment(SessionCache.self) private var sessions

    var body: some View {
        WebContainer(webView: session.webView, keepsRunningOffScreen: true) {
            sessions.markUsed(session.space.id)
            session.didAttach()
        }
        // WKWebView moves its content out of the keyboard's way on its own. Letting SwiftUI do it as well makes the page jump.
        .ignoresSafeArea(.keyboard)
        .overlay(alignment: .top) {
            if session.isLoading {
                ProgressView(value: session.progress)
                    .progressViewStyle(.linear)
                    .transition(.opacity)
            }
        }
        .overlay {
            if let error = session.loadError {
                ContentUnavailableView {
                    Label("Can't Load Page", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") {
                        session.retry()
                    }
                    .buttonStyle(.bordered)
                }
                .background(Color(.systemBackground))
            }
        }
        .animation(.default, value: session.isLoading)
        .sheet(item: $session.popup) { popup in
            PopupSheet(popup: popup)
        }
    }
}

private struct PopupSheet: View {
    let popup: PopupWindow
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebContainer(webView: popup.webView)
                .ignoresSafeArea(.keyboard)
                .overlay {
                    if let error = popup.loadError {
                        ContentUnavailableView {
                            Label("Can't Load Page", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Try Again") {
                                popup.webView.reload()
                            }
                            .buttonStyle(.bordered)
                        }
                        .background(Color(.systemBackground))
                    } else if popup.isLoading && popup.host.isEmpty {
                        ProgressView()
                    }
                }
                .navigationTitle(popup.host)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") {
                            dismiss()
                        }
                    }
                }
        }
    }
}

/// Shown instead of a locked space's page. It asks to unlock when it appears and each time Alts
/// comes back to the front, but not again right after someone cancels.
struct LockedView: View {
    let space: Space
    var unlock: () async -> Void

    @Environment(\.scenePhase) private var scenePhase
    @State private var isUnlocking = false
    @State private var askedThisVisit = false

    var body: some View {
        VStack(spacing: 16) {
            SpaceTile(space: space, size: 64)
                .padding(.bottom, 4)
            Text("\(space.name) is locked")
                .font(.headline)
            Button {
                Task { await attemptUnlock() }
            } label: {
                // System background on the accent keeps the label readable in light and dark mode.
                Text("Unlock")
                    .foregroundStyle(Color(.systemBackground))
            }
            .buttonStyle(.borderedProminent)
            .disabled(isUnlocking)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .onChange(of: scenePhase, initial: true) { _, phase in
            switch phase {
            case .active where !askedThisVisit:
                askedThisVisit = true
                Task { await attemptUnlock() }
            case .background:
                askedThisVisit = false
            default:
                break
            }
        }
    }

    private func attemptUnlock() async {
        guard !isUnlocking else { return }
        isUnlocking = true
        await unlock()
        isUnlocking = false
    }
}

/// Hosts a web view that lives longer than this SwiftUI view. The view is moved in and out
/// of a plain container so the same `WKWebView` can be shown again later.
struct WebContainer: UIViewRepresentable {
    let webView: WKWebView
    /// Space pages go backstage when they leave the screen so they keep running. Popups don't.
    var keepsRunningOffScreen = false
    /// Called each time the web view is actually on screen in this container.
    var onShow: @MainActor () -> Void = {}

    func makeUIView(context: Context) -> ContainerView {
        let container = ContainerView()
        container.keepsRunningOffScreen = keepsRunningOffScreen
        container.onShow = onShow
        container.host(webView)
        return container
    }

    func updateUIView(_ container: ContainerView, context: Context) {
        container.onShow = onShow
        if container.hosted !== webView || webView.superview !== container {
            container.host(webView)
        }
    }

    static func dismantleUIView(_ container: ContainerView, coordinator: ()) {
        container.release()
    }

    final class ContainerView: UIView {
        private(set) weak var hosted: WKWebView?
        var keepsRunningOffScreen = false
        var onShow: @MainActor () -> Void = {}

        func host(_ webView: WKWebView) {
            if let hosted, hosted !== webView, hosted.superview === self {
                letGo(hosted)
            }
            webView.removeFromSuperview()
            webView.frame = bounds
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(webView)
            hosted = webView
            if window != nil {
                onShow()
            }
        }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard window != nil, let hosted else { return }
            if hosted.superview === self {
                onShow()
            } else {
                // Back on screen after its web view went backstage: take it back.
                host(hosted)
            }
        }

        override func willMove(toWindow newWindow: UIWindow?) {
            super.willMove(toWindow: newWindow)
            if newWindow == nil, let hosted, hosted.superview === self {
                letGo(hosted)
            }
        }

        func release() {
            if let hosted, hosted.superview === self {
                letGo(hosted)
            }
            hosted = nil
        }

        private func letGo(_ webView: WKWebView) {
            if keepsRunningOffScreen, let window {
                Backstage.keep(webView, in: window)
            } else {
                webView.removeFromSuperview()
            }
        }
    }
}
