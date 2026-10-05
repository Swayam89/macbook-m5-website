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
                AltsShortcuts.updateAppShortcutParameters()
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background {
                    locks.lockAll()
                }
            }
            .task {
                guard !LaunchMode.isTesting else { return }
                await WebsiteData.sweepOrphans(keeping: Set(store.spaces.map(\.id)))
            }
        }
    }
}

/// Switches used by the test targets. None of them affect a normal launch.
enum LaunchMode {
    /// UI tests run against an in-memory list so they never touch real spaces.
    static var isUITesting: Bool {
        ProcessInfo.processInfo.arguments.contains("-ui-testing")
    }

    static var seedsSampleSpaces: Bool {
        isUITesting && ProcessInfo.processInfo.arguments.contains("-sample-spaces")
    }

    static var isTesting: Bool {
        isUITesting || ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
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
