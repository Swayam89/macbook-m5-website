import Foundation
import Testing
import UIKit
import WebKit
@testable import Alts

/// Unread counts and Alerts While Open depend on pages that are off screen still running.
/// This measures that against real WebKit with a page whose title counts up once a second.
@MainActor
@Suite(.serialized, .timeLimit(.minutes(2)))
struct OffScreenTests {
    @Test func cachedSpacesKeepRunningOffScreen() async throws {
        let space = Space(name: "Ticker", service: .custom, customURL: URL(string: "about:blank"), tint: .moss)
        let session = SpaceSession(space: space)
        let window = try TestWindow.make()
        defer {
            session.tearDown()
            window.isHidden = true
        }

        let container = WebContainer.ContainerView(frame: window.bounds)
        container.keepsRunningOffScreen = true
        window.rootViewController?.view.addSubview(container)
        container.host(session.webView)
        #expect(session.isOnScreen)

        session.webView.loadHTMLString(
            "<script>let n = 0; setInterval(() => { n += 1; document.title = '(' + n + ') Ticker'; }, 1000);</script>",
            baseURL: URL(string: "https://alts.test/")
        )
        try await Task.sleep(for: .seconds(3))
        #expect((session.unreadCount ?? 0) >= 1, "the page should be ticking while on screen")

        // Switching to another space removes this space's container from the window.
        container.removeFromSuperview()
        #expect(!session.isOnScreen)
        #expect(session.webView.window === window, "the web view should wait backstage, still in the window")

        let before = session.unreadCount ?? 0
        try await Task.sleep(for: .seconds(20))
        let after = session.unreadCount ?? 0
        #expect(after - before >= 10, "count went from \(before) to \(after) in 20 seconds off screen")
    }

    /// Popups are not spaces: closing one must take its web view out of the window.
    @Test func popupsDoNotStayBackstage() throws {
        let window = try TestWindow.make()
        defer { window.isHidden = true }
        let webView = WKWebView(frame: .zero)
        let container = WebContainer.ContainerView(frame: window.bounds)
        window.rootViewController?.view.addSubview(container)
        container.host(webView)

        container.removeFromSuperview()

        #expect(webView.superview == nil)
    }
}
