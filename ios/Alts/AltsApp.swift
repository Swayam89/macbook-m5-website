import AppIntents
import SwiftUI
import UserNotifications

@main
struct AltsApp: App {
    @State private var store: SpaceStore
    @State private var sessions = SessionCache()
    @State private var locks = LockState()
    @State private var navigator = Navigator.shared
    @Environment(\.scenePhase) private var scenePhase

    init() {
        let store = SpaceStore(fileURL: LaunchMode.isUITesting ? nil : SpaceStore.defaultFileURL)
        if LaunchMode.seedsSampleSpaces {
            for space in LaunchMode.sampleSpaces {
                store.add(space)
            }
        }
        if LaunchMode.simulatesPendingRemoval {
            WebsiteData.markForRemoval(UUID())
        }
        _store = State(initialValue: store)
        UNUserNotificationCenter.current().delegate = NotificationRouter.shared
    }

    var body: some Scene {
        WindowGroup {
            NavigationStack(path: $navigator.path) {
                SpaceListView()
                    .navigationDestination(for: UUID.self) { id in
                        SpaceView(spaceID: id)
                    }
            }
            .environment(store)
            .environment(sessions)
            .environment(locks)
            .environment(navigator)
            .onChange(of: store.spaces) { _, spaces in
                sessions.sync(with: spaces)
                sessions.keepRunning(spaces)
                AltsShortcuts.updateAppShortcutParameters()
            }
            .onChange(of: sessions.clearing) {
                sessions.keepRunning(store.spaces)
            }
            .onChange(of: scenePhase) { _, phase in
                handle(phase)
            }
            .task {
                Downloads.removeLeftovers()
                AltsShortcuts.updateAppShortcutParameters()
                sessions.keepRunning(store.spaces)
                // Unfinished removals wait until the app is up, and give up after a few launches.
                try? await Task.sleep(for: .seconds(3))
                await WebsiteData.removePending()
            }
        }
    }

    private var lockedSpaceIsShowing: Bool {
        guard let id = navigator.path.last, let space = store.space(with: id) else { return false }
        return space.requiresUnlock
    }

    private func handle(_ phase: ScenePhase) {
        switch phase {
        case .active:
            PrivacyCover.hide()
            store.retryIfUnreadable()
            // Restarts alert spaces that a memory warning released.
            sessions.keepRunning(store.spaces)
        case .inactive:
            if lockedSpaceIsShowing && !locks.isAuthenticating {
                PrivacyCover.show()
            }
        case .background:
            // Sessions go first, so a file on a share sheet is kept and offered again after unlocking.
            sessions.dismissPresentations { $0.requiresUnlock }
            if lockedSpaceIsShowing {
                PrivacyCover.show()
                // Then anything else over the locked space, such as its settings or Share Page.
                UIApplication.shared.connectedScenes
                    .compactMap { ($0 as? UIWindowScene)?.keyWindow?.rootViewController }
                    .forEach { $0.dismiss(animated: false) }
            }
            locks.lockAll()
        @unknown default:
            break
        }
    }
}

/// Switches used by the test targets. None of them affect a normal launch.
enum LaunchMode {
    /// UI tests run against an in-memory list so they never touch real spaces.
    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("-ui-testing")
    }

    /// Launches as if a deletion had been interrupted, to check the launch cleanup is safe.
    static var simulatesPendingRemoval: Bool {
        isUITesting && ProcessInfo.processInfo.arguments.contains("-pending-removal")
    }

    /// Passes every Face ID and passcode check, because UI tests can't answer the system prompt.
    static var passesAuthentication: Bool {
        isUITesting && ProcessInfo.processInfo.arguments.contains("-pass-authentication")
    }

    static var seedsSampleSpaces: Bool {
        isUITesting && ProcessInfo.processInfo.arguments.contains("-sample-spaces")
    }

    static var sampleSpaces: [Space] {
        [
            Space(name: "Personal", service: .whatsApp, tint: .pine),
            Space(name: "Work", service: .whatsApp, tint: .harbor, requiresUnlock: true),
            Space(name: "Shop", service: .instagram, tint: .brick),
            Space(name: "Band", service: .discord, tint: .plum),
            Space(name: "Docs", service: .custom, customURL: URL(string: "https://example.com"), tint: .graphite),
        ]
    }
}
