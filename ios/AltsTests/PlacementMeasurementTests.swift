import UIKit
import WebKit
import XCTest
@testable import Alts

/// Not a pass/fail check. Records how many times a once-a-second timer fires in each place a web
/// view could wait while its space isn't showing, so the app can use a place where WebKit really
/// keeps the page running. CI prints the attached numbers.
final class PlacementMeasurementTests: XCTestCase {
    enum Placement: String, CaseIterable {
        case onScreen, backstage, transparent, tiny, hidden, detached
    }

    @MainActor
    func testWherePagesKeepRunning() async throws {
        let window = try TestWindow.make()
        defer { window.isHidden = true }
        var report: [String] = []
        for placement in Placement.allCases {
            report.append("\(placement.rawValue)=\(try await ticks(in: placement, window: window))")
        }
        let attachment = XCTAttachment(string: report.joined(separator: " "))
        attachment.name = "measure-placements"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func ticks(in placement: Placement, window: UIWindow) async throws -> Int {
        let space = Space(name: placement.rawValue, service: .custom, customURL: URL(string: "about:blank"), tint: .moss)
        let session = SpaceSession(space: space)
        defer { session.tearDown() }
        let root = try XCTUnwrap(window.rootViewController?.view)
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

        let before = session.unread?.value ?? 0
        try await Task.sleep(for: .seconds(8))
        return (session.unread?.value ?? 0) - before
    }
}
