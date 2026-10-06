import Foundation
import Testing
import UIKit
import WebKit
@testable import Alts

@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)))
struct WebsiteDataTests {
    /// The launch cleanup only removes data for spaces that were deliberately deleted. Data that
    /// merely isn't in the list, for example because the list failed to load, must survive it.
    @Test func dataThatWasNeverDeletedSurvivesTheLaunchCleanup() async throws {
        let id = UUID()
        defer { WebsiteData.forget(id) }
        try await storeSomething(in: id)

        let before = await WKWebsiteDataStore.allDataStoreIdentifiers
        try #require(before.contains(id), "the test store should exist on disk")

        await WebsiteData.removePending()
        let after = await WKWebsiteDataStore.allDataStoreIdentifiers
        #expect(after.contains(id))
    }

    @Test func aDeletedSpacesDataIsRemoved() async throws {
        let id = UUID()
        defer { WebsiteData.forget(id) }
        try await storeSomething(in: id)

        WebsiteData.markForRemoval(id)
        await WebsiteData.erase(spaceID: id)

        let remaining = await WKWebsiteDataStore.allDataStoreIdentifiers
        #expect(!remaining.contains(id))
        #expect(WebsiteData.pendingRemovals()[id] == nil)
    }

    @Test func erasingASpaceThatNeverStoredAnythingFinishesQuickly() async {
        let id = UUID()
        defer { WebsiteData.forget(id) }
        WebsiteData.markForRemoval(id)
        let started = Date.now

        await WebsiteData.erase(spaceID: id)

        #expect(WebsiteData.pendingRemovals()[id] == nil)
        #expect(Date.now.timeIntervalSince(started) < 3)
    }

    /// A removal that keeps failing, or crashes, is tried on at most three launches.
    @Test func launchRemovalsGiveUpAfterThreeTries() async {
        let id = UUID()
        defer { WebsiteData.forget(id) }
        WebsiteData.markForRemoval(id)
        // Pretend three launches already tried.
        for _ in 0..<3 {
            var pending = WebsiteData.pendingRemovals()
            pending[id] = (pending[id] ?? 0) + 1
            try? JSONEncoder().encode(pending).write(to: URL.applicationSupportDirectory.appending(path: "pending-removals.json"))
        }

        await WebsiteData.removePending()

        #expect(WebsiteData.pendingRemovals()[id] == nil)
    }

    /// Writes a cookie through a real page, so WebKit has its network process running for the store
    /// the way it does in the app, then closes the page so nothing holds the store.
    private func storeSomething(in id: UUID) async throws {
        let window = try TestWindow.make()
        defer { window.isHidden = true }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: id)
        var webView: WKWebView? = WKWebView(frame: window.bounds, configuration: configuration)
        window.rootViewController?.view.addSubview(webView!)
        webView?.loadHTMLString("<!doctype html><title>t</title>", baseURL: URL(string: "https://alts.test/"))
        _ = try await webView?.callAsyncJavaScript(
            "document.cookie = 'session=kept; max-age=3600; path=/'; return document.cookie;",
            contentWorld: .page
        )
        webView?.removeFromSuperview()
        webView = nil
        try await Task.sleep(for: .seconds(1))
    }
}
