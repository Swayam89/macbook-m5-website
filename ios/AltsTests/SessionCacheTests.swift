import Foundation
import Testing
@testable import Alts

@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)))
struct SessionCacheTests {
    private func blankSpace(_ name: String, desktop: Bool = false) -> Space {
        Space(name: name, service: .custom, customURL: URL(string: "about:blank"), tint: .graphite, desktopSite: desktop)
    }

    @Test func theLeastRecentlyUsedSessionIsDiscarded() {
        let cache = SessionCache(limit: 2)
        let a = blankSpace("A"), b = blankSpace("B"), c = blankSpace("C")

        cache.session(for: a)
        cache.session(for: b)
        // Reopening a cached space only marks it as used; it doesn't ask for the session again.
        cache.markUsed(a.id)
        cache.session(for: c)

        #expect(cache.existingSession(for: a.id) != nil)
        #expect(cache.existingSession(for: b.id) == nil)
        #expect(cache.existingSession(for: c.id) != nil)
    }

    @Test func theSpaceBeingOpenedIsNeverTheOneReleased() {
        let cache = SessionCache(limit: 1)
        let a = blankSpace("A"), b = blankSpace("B")
        cache.session(for: a)
        cache.session(for: b)
        #expect(cache.existingSession(for: b.id) != nil)
        #expect(cache.existingSession(for: a.id) == nil)
    }

    @Test func reusingASpaceKeepsItsSession() {
        let cache = SessionCache()
        let space = blankSpace("A")
        let first = cache.session(for: space)
        #expect(cache.session(for: space) === first)
    }

    @Test func syncDropsDeletedSpacesAndRebuildsChangedModes() {
        let cache = SessionCache()
        var kept = blankSpace("Kept")
        let deleted = blankSpace("Deleted")
        let original = cache.session(for: kept)
        cache.session(for: deleted)

        kept.desktopSite = true
        cache.sync(with: [kept])

        #expect(cache.existingSession(for: deleted.id) == nil)
        #expect(cache.existingSession(for: kept.id) == nil, "a desktop switch needs a new web view")
        #expect(cache.session(for: kept) !== original)
    }

    @Test func syncAppliesZoomWithoutRebuilding() {
        let cache = SessionCache()
        var space = blankSpace("Zoom")
        let session = cache.session(for: space)

        space.pageZoom = 1.25
        cache.sync(with: [space])

        #expect(cache.existingSession(for: space.id) === session)
        #expect(session.webView.pageZoom == 1.25)
    }
}
