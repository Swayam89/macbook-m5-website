import Foundation
import Testing
import UIKit
import WebKit
@testable import Alts

/// Unread counts and Alerts While Open depend on pages that are off screen still running.
/// This measures that against real WebKit with a page whose title counts up once a second.
@MainActor
@Suite(.serialized, .timeLimit(.minutes(4)))
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

    enum Placement: String, CaseIterable {
        case onScreen, backstage, transparent, tiny, hidden, detached
    }

    /// Not a pass/fail check: records how many times a once-a-second timer fires in each place a
    /// web view could wait, so the app can use one WebKit really keeps running. CI prints the line.
    @Test(.timeLimit(.minutes(3))) func measureWherePagesKeepRunning() async throws {
        let window = try TestWindow.make()
        defer { window.isHidden = true }
        var report: [String] = []
        for placement in Placement.allCases {
            report.append("\(placement.rawValue)=\(try await ticks(in: placement, window: window))")
        }
        print("ALTS-MEASURE " + report.joined(separator: " "))
    }

    private func ticks(in placement: Placement, window: UIWindow) async throws -> Int {
        let space = Space(name: placement.rawValue, service: .custom, customURL: URL(string: "about:blank"), tint: .moss)
        let session = SpaceSession(space: space)
        defer { session.tearDown() }
        let root = try #require(window.rootViewController?.view)
        root.addSubview(session.webView)
        session.webView.frame = root.bounds
        session.webView.loadHTMLString(
            "<script>let n = 0; setInterval(() => { n += 1; document.title = '(' + n + ') Ticker'; }, 1000);</script>",
            baseURL: URL(string: "https://alts.test/")
        )
        try await Task.sleep(for: .seconds(2))

        switch placement {
        case .onScreen: break
        case .backstage: Backstage.keep(session.webView, in: window)
        case .transparent: session.webView.alpha = 0
        case .tiny: session.webView.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        case .hidden: session.webView.isHidden = true
        case .detached: session.webView.removeFromSuperview()
        }

        let before = session.unreadCount ?? 0
        try await Task.sleep(for: .seconds(8))
        return (session.unreadCount ?? 0) - before
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
