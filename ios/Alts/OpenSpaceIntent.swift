import AppIntents
import Foundation

// A Shortcut that runs "Open Space" can be added to the Home Screen with its own name and icon,
// which is the closest iOS gets to the separate app icon a cloned Android app has.

struct SpaceEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Space"
    static let defaultQuery = SpaceQuery()

    let id: UUID
    let name: String
    let siteName: String

    init(_ space: Space) {
        id = space.id
        name = space.name
        siteName = space.siteName
    }

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "\(siteName)")
    }
}

struct SpaceQuery: EntityQuery {
    @MainActor
    func entities(for identifiers: [UUID]) async throws -> [SpaceEntity] {
        savedSpaces().filter { identifiers.contains($0.id) }.map(SpaceEntity.init)
    }

    @MainActor
    func suggestedEntities() async throws -> [SpaceEntity] {
        savedSpaces().map(SpaceEntity.init)
    }

    /// Intents can run before any window exists, so they read the saved list directly.
    @MainActor
    private func savedSpaces() -> [Space] {
        SpaceStore(fileURL: SpaceStore.defaultFileURL).spaces
    }
}

struct OpenSpaceIntent: OpenIntent {
    static let title: LocalizedStringResource = "Open Space"
    static let description = IntentDescription("Opens one of your spaces in Alts.")

    @Parameter(title: "Space")
    var target: SpaceEntity

    init() {}

    init(target: SpaceEntity) {
        self.target = target
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        Navigator.shared.show(target.id)
        return .result()
    }
}

struct AltsShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenSpaceIntent(),
            phrases: [
                "Open \(\.$target) in \(.applicationName)",
                "Open a space in \(.applicationName)",
            ],
            shortTitle: "Open Space",
            systemImageName: "square.on.square"
        )
    }
}
