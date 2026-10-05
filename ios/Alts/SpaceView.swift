import SwiftUI
import WebKit

struct SpaceView: View {
    let spaceID: UUID

    @Environment(SpaceStore.self) private var store
    @Environment(SessionCache.self) private var sessions
    @Environment(LockState.self) private var locks
    @Environment(Navigator.self) private var navigator
    @Environment(\.scenePhase) private var scenePhase
    @State private var editing: Space?

    var body: some View {
        Group {
            if let space = store.space(with: spaceID) {
                content(for: space)
                    .overlay {
                        // Covers the page before iOS takes the app switcher snapshot. It's an overlay so the
                        // lock screen underneath keeps its identity and doesn't prompt again after a cancel.
                        if space.requiresUnlock && scenePhase != .active {
                            LockedView(space: space, showsUnlockButton: false)
                        }
                    }
                    .navigationTitle(space.name)
                    .toolbarTitleMenu {
                        Picker("Space", selection: Binding(get: { spaceID }, set: { navigator.show($0) })) {
                            ForEach(store.spaces) { other in
                                Text(other.name).tag(other.id)
                            }
                        }
                    }
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            actionsMenu(for: space)
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

    /// A session starts once the space is unlocked, and starts again if an edit replaced it.
    private func shouldStartSession(for space: Space) -> Bool {
        locks.isUnlocked(space) && session == nil
    }

    @ViewBuilder
    private func content(for space: Space) -> some View {
        if !locks.isUnlocked(space) {
            LockedView(space: space, showsUnlockButton: true) {
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
                if let url = session?.webView.url {
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

    var body: some View {
        WebContainer(webView: session.webView, keepsRunningOffScreen: true) {
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
                        session.reload()
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

struct LockedView: View {
    let space: Space
    let showsUnlockButton: Bool
    var unlock: () async -> Void = {}

    @State private var isUnlocking = false

    var body: some View {
        VStack(spacing: 16) {
            SpaceTile(space: space, size: 64)
                .padding(.bottom, 4)
            Text("\(space.name) is locked")
                .font(.headline)
            if showsUnlockButton {
                Button("Unlock") {
                    Task { await attemptUnlock() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(isUnlocking)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
        .task {
            guard showsUnlockButton else { return }
            await attemptUnlock()
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
    var onAttach: @MainActor () -> Void = {}

    func makeUIView(context: Context) -> ContainerView {
        let container = ContainerView()
        container.keepsRunningOffScreen = keepsRunningOffScreen
        container.host(webView)
        attached()
        return container
    }

    func updateUIView(_ container: ContainerView, context: Context) {
        if container.hosted !== webView {
            container.host(webView)
            attached()
        }
    }

    static func dismantleUIView(_ container: ContainerView, coordinator: ()) {
        container.release()
    }

    private func attached() {
        let onAttach = onAttach
        Task { onAttach() }
    }

    final class ContainerView: UIView {
        private(set) weak var hosted: WKWebView?
        var keepsRunningOffScreen = false

        func host(_ webView: WKWebView) {
            hosted?.removeFromSuperview()
            webView.removeFromSuperview()
            webView.frame = bounds
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            addSubview(webView)
            hosted = webView
        }

        override func willMove(toWindow newWindow: UIWindow?) {
            super.willMove(toWindow: newWindow)
            if newWindow == nil {
                letGo()
            }
        }

        func release() {
            letGo()
            hosted = nil
        }

        private func letGo() {
            guard let hosted, hosted.superview === self else { return }
            if keepsRunningOffScreen, let window {
                Backstage.keep(hosted, in: window)
            } else {
                hosted.removeFromSuperview()
            }
        }
    }
}
