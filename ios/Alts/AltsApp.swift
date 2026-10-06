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
        case .inactive:
            if lockedSpaceIsShowing {
                PrivacyCover.show()
            }
        case .background:
            if lockedSpaceIsShowing {
                PrivacyCover.show()
            }
            sessions.dismissPresentations { $0.requiresUnlock }
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
