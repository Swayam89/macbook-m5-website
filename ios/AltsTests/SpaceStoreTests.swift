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
        for space in [a, b, c] {
            store.add(space)
        }

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
        #expect(store.setAsideDamagedList)

        let backup = file.appendingPathExtension("unreadable")
        #expect(try String(contentsOf: backup, encoding: .utf8) == "not json")

        // A second damaged file is kept next to the first instead of replacing it.
        try Data("still not json".utf8).write(to: file)
        _ = SpaceStore(fileURL: file)
        #expect(try String(contentsOf: backup, encoding: .utf8) == "not json")
        let secondBackup = file.appendingPathExtension("unreadable-2")
        #expect(try String(contentsOf: secondBackup, encoding: .utf8) == "still not json")
    }

    @Test func aListThatCantBeReadIsLeftAloneAndReadLater() throws {
        let file = temporaryFile()
        SpaceStore(fileURL: file).add(Space(name: "Work", service: .whatsApp, tint: .moss))
        let saved = try Data(contentsOf: file)

        // A folder where the file should be makes reading fail with something other than "no such file".
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: true)
        let store = SpaceStore(fileURL: file)
        #expect(store.isReadOnly)
        #expect(store.spaces.isEmpty)
        store.retryIfUnreadable()
        #expect(store.isReadOnly)

        try FileManager.default.removeItem(at: file)
        try saved.write(to: file)
        store.retryIfUnreadable()
        #expect(!store.isReadOnly)
        #expect(store.spaces.map(\.name) == ["Work"])
    }

    @Test func unknownTintsFallBackToGraphite() throws {
        let json = """
        [{"id":"6F0E9C1A-3C55-4C1B-9D0B-6F7A3B1E2D10","name":"Old","service":"telegram",
          "tint":"neon","requiresUnlock":false,"createdAt":0}]
        """
        let spaces = try JSONDecoder().decode([Space].self, from: Data(json.utf8))
        #expect(spaces.first?.tint == .graphite)
    }

    /// A space for a site this version doesn't know (written by a newer Alts) is hidden, but it
    /// survives on disk when the list is saved, along with every space that can be read.
    @Test func entriesThisVersionCantReadAreKept() throws {
        let file = temporaryFile()
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let json = """
        [{"id":"6F0E9C1A-3C55-4C1B-9D0B-6F7A3B1E2D10","name":"Future","service":"someday-added","tint":"moss"},
         {"id":"0B5E1C2A-1111-4C1B-9D0B-6F7A3B1E2D10","name":"Known","service":"telegram","tint":"moss"}]
        """
        try Data(json.utf8).write(to: file)

        let store = SpaceStore(fileURL: file)
        #expect(store.spaces.map(\.name) == ["Known"])

        store.add(Space(name: "New", service: .x, tint: .pine))
        let saved = try String(contentsOf: file, encoding: .utf8)
        #expect(saved.contains("someday-added"))
        #expect(SpaceStore(fileURL: file).spaces.map(\.name) == ["Known", "New"])
    }

    @Test func otherWebsitesAreNamedAfterTheirHost() {
        let store = SpaceStore(fileURL: nil)
        #expect(store.suggestedName(for: .custom, address: URL(string: "https://www.notion.so/page")) == "notion.so")
        #expect(store.suggestedName(for: .custom, address: nil) == "Other Website")
    }

    @Test func monogramsUseTheFirstTwoWords() {
        #expect(Space(name: "Work Chat", service: .slack, tint: .pine).monogram == "WC")
        #expect(Space(name: "personal", service: .slack, tint: .pine).monogram == "P")
        #expect(Space(name: "WhatsApp 2", service: .whatsApp, tint: .pine).monogram == "W2")
        #expect(Space(name: "  ", service: .telegram, tint: .pine).monogram == "T")
    }
}
