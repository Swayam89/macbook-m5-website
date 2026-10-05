import Foundation
import Observation
import os

/// The list of spaces, persisted as a small JSON file in Application Support.
///
/// Website data (cookies, local storage, IndexedDB) does not live here. WebKit keeps it
/// in a separate data store per space, keyed by `Space.id`.
@MainActor
@Observable
final class SpaceStore {
    private(set) var spaces: [Space] = []

    @ObservationIgnored private let fileURL: URL?
    @ObservationIgnored private let log = Logger(subsystem: "com.swayam89.alts", category: "store")

    /// Pass `nil` to keep everything in memory (previews and UI tests).
    init(fileURL: URL?) {
        self.fileURL = fileURL
        load()
    }

    static var defaultFileURL: URL {
        URL.applicationSupportDirectory.appending(path: "spaces.json")
    }

    func space(with id: UUID) -> Space? {
        spaces.first { $0.id == id }
    }

    func add(_ space: Space) {
        spaces.append(space)
        save()
    }

    func update(_ space: Space) {
        guard let index = spaces.firstIndex(where: { $0.id == space.id }) else { return }
        spaces[index] = space
        save()
    }

    func remove(id: UUID) {
        spaces.removeAll { $0.id == id }
        save()
    }

    func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        spaces.move(fromOffsets: source, toOffset: destination)
        save()
    }

    /// The next free name for a new space of `service`: "WhatsApp", then "WhatsApp 2", and so on.
    func suggestedName(for service: Service) -> String {
        let taken = Set(spaces.map(\.name))
        guard taken.contains(service.displayName) else { return service.displayName }
        var n = 2
        while taken.contains("\(service.displayName) \(n)") { n += 1 }
        return "\(service.displayName) \(n)"
    }

    private func load() {
        guard let fileURL, FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let data = try Data(contentsOf: fileURL)
            spaces = try JSONDecoder().decode([Space].self, from: data)
        } catch {
            // Keep the unreadable file instead of overwriting it with an empty list on the next save.
            log.error("Could not read spaces: \(error.localizedDescription, privacy: .public)")
            let backup = fileURL.appendingPathExtension("unreadable")
            try? FileManager.default.removeItem(at: backup)
            try? FileManager.default.moveItem(at: fileURL, to: backup)
        }
    }

    private func save() {
        guard let fileURL else { return }
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(spaces).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            log.error("Could not save spaces: \(error.localizedDescription, privacy: .public)")
        }
    }
}
