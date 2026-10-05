import Foundation
import Testing
@testable import Alts

@MainActor
struct SpaceStoreTests {
    private func temporaryFile() -> URL {
        FileManager.default.temporaryDirectory
            .appending(path: "alts-tests-\(UUID().uuidString)")
            .appending(path: "spaces.json")
    }

    @Test func spacesSurviveARelaunch() throws {
        let file = temporaryFile()
        let first = SpaceStore(fileURL: file)
        let work = Space(name: "Work", service: .whatsApp, tint: .moss, requiresUnlock: true)
        let personal = Space(name: "Personal", service: .whatsApp, tint: .brick)
        first.add(work)
        first.add(personal)

        let second = SpaceStore(fileURL: file)
        #expect(second.spaces == [work, personal])
    }

    @Test func reorderingIsSaved() {
        let file = temporaryFile()
        let store = SpaceStore(fileURL: file)
        let a = Space(name: "A", service: .telegram, tint: .graphite)
        let b = Space(name: "B", service: .telegram, tint: .graphite)
        let c = Space(name: "C", service: .telegram, tint: .graphite)
        [a, b, c].forEach(store.add)

        store.move(fromOffsets: IndexSet(integer: 2), toOffset: 0)

        #expect(SpaceStore(fileURL: file).spaces.map(\.name) == ["C", "A", "B"])
    }

    @Test func removingASpaceKeepsTheOthers() {
        let store = SpaceStore(fileURL: nil)
        let keep = Space(name: "Keep", service: .instagram, tint: .ochre)
        let drop = Space(name: "Drop", service: .instagram, tint: .ochre)
        store.add(keep)
        store.add(drop)

        store.remove(id: drop.id)

        #expect(store.spaces == [keep])
    }

    @Test func suggestedNamesCountUp() {
        let store = SpaceStore(fileURL: nil)
        #expect(store.suggestedName(for: .whatsApp) == "WhatsApp")
        store.add(Space(name: "WhatsApp", service: .whatsApp, tint: .pine))
        #expect(store.suggestedName(for: .whatsApp) == "WhatsApp 2")
        store.add(Space(name: "WhatsApp 2", service: .whatsApp, tint: .pine))
        #expect(store.suggestedName(for: .whatsApp) == "WhatsApp 3")
    }

    @Test func aCorruptFileIsSetAsideNotOverwritten() throws {
        let file = temporaryFile()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("not json".utf8).write(to: file)

        let store = SpaceStore(fileURL: file)
        #expect(store.spaces.isEmpty)

        let backup = file.appendingPathExtension("unreadable")
        #expect(try String(contentsOf: backup, encoding: .utf8) == "not json")
    }

    @Test func unknownServicesAndTintsStillDecode() throws {
        let json = """
        [{"id":"6F0E9C1A-3C55-4C1B-9D0B-6F7A3B1E2D10","name":"Old","service":"someday-removed",
          "tint":"neon","requiresUnlock":false,"createdAt":0}]
        """
        let spaces = try JSONDecoder().decode([Space].self, from: Data(json.utf8))
        #expect(spaces.first?.service == .custom)
        #expect(spaces.first?.tint == .graphite)
    }

    @Test func monogramsUseTheFirstTwoWords() {
        #expect(Space(name: "Work Chat", service: .slack, tint: .pine).monogram == "WC")
        #expect(Space(name: "personal", service: .slack, tint: .pine).monogram == "P")
        #expect(Space(name: "WhatsApp 2", service: .whatsApp, tint: .pine).monogram == "W2")
        #expect(Space(name: "  ", service: .telegram, tint: .pine).monogram == "T")
    }
}
