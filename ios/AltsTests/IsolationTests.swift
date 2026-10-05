import Foundation
import Testing
import UIKit
import WebKit
@testable import Alts

/// The whole app rests on one promise: two spaces never share a login. These tests check it
/// against real WebKit, not a mock.
@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)))
struct IsolationTests {
    @Test func cookiesStayInTheirOwnSpace() async throws {
        let first = WKWebsiteDataStore(forIdentifier: UUID())
        let second = WKWebsiteDataStore(forIdentifier: UUID())
        let cookie = try #require(HTTPCookie(properties: [
            .domain: "alts.test",
            .path: "/",
            .name: "session",
            .value: "first-account",
            .secure: "TRUE",
            .expires: Date.now.addingTimeInterval(3600),
        ]))

        await first.httpCookieStore.setCookie(cookie)

        let inFirst = await first.httpCookieStore.allCookies()
        let inSecond = await second.httpCookieStore.allCookies()
        #expect(inFirst.contains { $0.name == "session" && $0.value == "first-account" })
        #expect(!inSecond.contains { $0.name == "session" })
    }

    @Test func localStorageStaysInItsSpaceAndPersistsWithinIt() async throws {
        let firstID = UUID()
        let secondID = UUID()
        let window = try TestWindow.make()
        defer { window.isHidden = true }

        let writer = try await page(in: firstID, on: window)
        let written = try await writer.callAsyncJavaScript(
            "localStorage.setItem('account', 'first'); return localStorage.getItem('account');",
            contentWorld: .page
        )
        #expect(written as? String == "first")

        let otherSpace = try await page(in: secondID, on: window)
        let seenElsewhere = try await otherSpace.callAsyncJavaScript(
            "return localStorage.getItem('account');",
            contentWorld: .page
        )
        #expect(seenElsewhere == nil || seenElsewhere is NSNull)

        // A fresh web view on the same space, like a space reopened after its session was discarded.
        let reopened = try await page(in: firstID, on: window)
        let seenAgain = try await reopened.callAsyncJavaScript(
            "return localStorage.getItem('account');",
            contentWorld: .page
        )
        #expect(seenAgain as? String == "first")
    }

    @Test func eachSessionUsesItsSpacesDataStore() throws {
        let space = Space(name: "Test", service: .custom, customURL: URL(string: "about:blank"), tint: .moss)
        let session = SpaceSession(space: space)
        defer { session.tearDown() }
        #expect(session.webView.configuration.websiteDataStore.identifier == space.id)
    }

    @Test func desktopSpacesAskForTheDesktopSite() throws {
        let desktop = SpaceSession(space: Space(name: "D", service: .custom, customURL: URL(string: "about:blank"), tint: .moss, desktopSite: true))
        let mobile = SpaceSession(space: Space(name: "M", service: .custom, customURL: URL(string: "about:blank"), tint: .moss, desktopSite: false))
        defer {
            desktop.tearDown()
            mobile.tearDown()
        }
        #expect(desktop.webView.configuration.defaultWebpagePreferences.preferredContentMode == .desktop)
        #expect(desktop.webView.configuration.applicationNameForUserAgent?.contains("Mobile") == false)
        #expect(mobile.webView.configuration.applicationNameForUserAgent?.contains("Mobile/15E148") == true)
    }

    /// Loads a blank page on a fixed https origin, so localStorage has somewhere to live.
    private func page(in spaceID: UUID, on window: UIWindow) async throws -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: spaceID)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 320, height: 480), configuration: configuration)
        window.rootViewController?.view.addSubview(webView)
        let waiter = NavigationWaiter()
        webView.navigationDelegate = waiter
        webView.loadHTMLString("<!doctype html><title>t</title>", baseURL: URL(string: "https://alts.test/"))
        try await waiter.wait()
        return webView
    }
}

@MainActor
private final class NavigationWaiter: NSObject, WKNavigationDelegate {
    private var continuation: CheckedContinuation<Void, Error>?
    private var result: Result<Void, Error>?

    struct TimedOut: Error, CustomStringConvertible {
        var description: String { "The test page didn't finish loading within 30 seconds" }
    }

    func wait() async throws {
        if let result { return try result.get() }
        let timer = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(30))
            } catch {
                return
            }
            self?.finish(.failure(TimedOut()))
        }
        defer { timer.cancel() }
        try await withCheckedThrowingContinuation { self.continuation = $0 }
    }

    private func finish(_ result: Result<Void, Error>) {
        guard self.result == nil else { return }
        self.result = result
        continuation?.resume(with: result)
        continuation = nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finish(.success(()))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(.failure(error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(.failure(error))
    }
}
