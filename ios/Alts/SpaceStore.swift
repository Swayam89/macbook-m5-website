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
    /// Entries this version can't read, such as a space for a site added by a newer Alts.
    /// They are written back untouched so saving never drops them.
    @ObservationIgnored private var unreadableEntries: [Any] = []
    /// Set when the file exists but couldn't be read at all. Saving is refused so a passing
    /// read error can't replace the saved list with an empty one.
    @ObservationIgnored private var isReadOnly = false
    @ObservationIgnored private let log = Logger(subsystem: "com.swayam89.alts", category: "store")

    /// Pass `nil` to keep everything in memory (previews and UI tests).
    init(fileURL: URL?) {
        self.fileURL = fileURL
        load()
    }

    nonisolated static var defaultFileURL: URL {
        URL.applicationSupportDirectory.appending(path: "spaces.json")
    }

    /// Reads the saved list without changing anything on disk, for App Intents.
    nonisolated static func savedSpaces(at url: URL = defaultFileURL) -> [Space] {
        guard let data = try? Data(contentsOf: url), let decoded = try? decode(data) else { return [] }
        return decoded.spaces
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

    /// The next free name: "WhatsApp", then "WhatsApp 2", and so on. Other websites are named after their host.
    func suggestedName(for service: Service, address: URL? = nil) -> String {
        var base = service.displayName
        if service == .custom, let host = address?.host() {
            base = host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
        }
        let taken = Set(spaces.map(\.name))
        guard taken.contains(base) else { return base }
        var n = 2
        while taken.contains("\(base) \(n)") { n += 1 }
        return "\(base) \(n)"
    }

    private func load() {
        guard let fileURL else { return }
        let data: Data
        do {
            data = try Data(contentsOf: fileURL)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            return
        } catch {
            log.error("Could not read spaces, keeping the file as it is: \(error.localizedDescription, privacy: .public)")
            isReadOnly = true
            return
        }

        do {
            (spaces, unreadableEntries) = try Self.decode(data)
            if !unreadableEntries.isEmpty {
                log.info("Kept \(self.unreadableEntries.count) spaces this version can't read")
            }
        } catch {
            // Not a list at all. Set it aside so nothing is lost, and start a new one.
            log.error("Spaces file is damaged: \(error.localizedDescription, privacy: .public)")
            let backup = fileURL.appendingPathExtension("unreadable")
            try? FileManager.default.removeItem(at: backup)
            try? FileManager.default.moveItem(at: fileURL, to: backup)
        }
    }

    /// Decodes entry by entry, so one entry that can't be read doesn't take the rest of the list with it.
    private nonisolated static func decode(_ data: Data) throws -> (spaces: [Space], unreadable: [Any]) {
        guard let entries = try JSONSerialization.jsonObject(with: data) as? [Any] else {
            throw CocoaError(.coderReadCorrupt)
        }
        let decoder = JSONDecoder()
        var spaces: [Space] = []
        var unreadable: [Any] = []
        for entry in entries {
            if JSONSerialization.isValidJSONObject(entry),
               let entryData = try? JSONSerialization.data(withJSONObject: entry),
               let space = try? decoder.decode(Space.self, from: entryData) {
                spaces.append(space)
            } else {
                unreadable.append(entry)
            }
        }
        return (spaces, unreadable)
    }

    private func save() {
        guard let fileURL, !isReadOnly else { return }
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(spaces)) as? [Any] ?? []
            let data = try JSONSerialization.data(
                withJSONObject: encoded + unreadableEntries,
                options: [.prettyPrinted, .sortedKeys]
            )
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            log.error("Could not save spaces: \(error.localizedDescription, privacy: .public)")
        }
    }
}
