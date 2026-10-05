import Foundation
import Testing
import UIKit
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

        window.rootViewController?.view.addSubview(session.webView)
        session.webView.frame = CGRect(x: 0, y: 0, width: 320, height: 480)
        session.webView.loadHTMLString(
            "<script>let n = 0; setInterval(() => { n += 1; document.title = '(' + n + ') Ticker'; }, 1000);</script>",
            baseURL: URL(string: "https://alts.test/")
        )
        try await Task.sleep(for: .seconds(3))
        #expect((session.unreadCount ?? 0) >= 1, "the page should be ticking while on screen")

        // What SessionCache does when someone switches to another space.
        session.webView.removeFromSuperview()
        #expect(!session.isOnScreen)
        let before = session.unreadCount ?? 0
        try await Task.sleep(for: .seconds(20))
        let after = session.unreadCount ?? 0

        #expect(after - before >= 10, "count went from \(before) to \(after) in 20 seconds off screen")
    }
}
