import Foundation
import Testing
import WebKit
@testable import Alts

@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)))
struct WebsiteDataTests {
    /// The launch cleanup only removes data for spaces that were deliberately deleted. Data that
    /// merely isn't in the list, for example because the list failed to load, must survive it.
    @Test func dataThatWasNeverDeletedSurvivesTheLaunchCleanup() async throws {
        let id = UUID()
        do {
            let store = WKWebsiteDataStore(forIdentifier: id)
            let cookie = try #require(HTTPCookie(properties: [
                .domain: "alts.test", .path: "/", .name: "session", .value: "kept",
                .expires: Date.now.addingTimeInterval(3600),
            ]))
            await store.httpCookieStore.setCookie(cookie)
        }
        let before = await WKWebsiteDataStore.allDataStoreIdentifiers
        try #require(before.contains(id), "the test store should exist on disk")

        await WebsiteData.removePending()
        let afterCleanup = await WKWebsiteDataStore.allDataStoreIdentifiers
        #expect(afterCleanup.contains(id))

        WebsiteData.markForRemoval(id)
        await WebsiteData.removePending()
        let afterRemoval = await WKWebsiteDataStore.allDataStoreIdentifiers
        #expect(!afterRemoval.contains(id))
    }
}
