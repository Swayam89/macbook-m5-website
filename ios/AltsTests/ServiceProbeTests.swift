import UIKit
import WebKit
import XCTest
@testable import Alts

/// Loads every built-in service in a real space and attaches a screenshot of what the site
/// shows a signed-out visitor: a login page, a QR code, or a "get the app" wall.
///
/// Sites change without notice, so this records rather than asserts. It only runs when
/// `ALTS_PROBE=1` is set (CI passes `TEST_RUNNER_ALTS_PROBE=1`), because it needs the network.
final class ServiceProbeTests: XCTestCase {
    @MainActor
    func testWhatEachServiceShows() async throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["ALTS_PROBE"] == "1", "Set ALTS_PROBE=1 to run")

        var report: [String] = []
        for service in Service.allCases where service != .custom {
            report.append(try await probe(Space(name: service.displayName, service: service, tint: .graphite), label: service.rawValue))
        }
        // The same desktop-only sites with the mobile site requested, to show why they default to desktop.
        for service in Service.allCases where service.prefersDesktopSite {
            let space = Space(name: service.displayName, service: service, tint: .graphite, desktopSite: false)
            report.append(try await probe(space, label: "\(service.rawValue)-mobile"))
        }

        let summary = XCTAttachment(string: report.joined(separator: "\n"))
        summary.name = "probe-summary"
        summary.lifetime = .keepAlways
        add(summary)
    }

    @MainActor
    private func probe(_ space: Space, label: String) async throws -> String {
        let session = SpaceSession(space: space)
        let window = try TestWindow.make()
        let host = try XCTUnwrap(window.rootViewController?.view)
        session.webView.frame = host.bounds
        session.webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.addSubview(session.webView)

        let deadline = Date.now.addingTimeInterval(25)
        while Date.now < deadline && (session.isLoading || session.webView.url == nil) {
            try await Task.sleep(for: .milliseconds(250))
        }
        // Single-page apps keep drawing after the load event.
        try await Task.sleep(for: .seconds(6))

        let userAgent = (try? await session.webView.callAsyncJavaScript("return navigator.userAgent", contentWorld: .page)) as? String ?? "?"
        let visibleText = (try? await session.webView.callAsyncJavaScript(
            "return ((document.body && document.body.innerText) || '').replace(/\\s+/g, ' ').trim().slice(0, 240)",
            contentWorld: .page
        )) as? String ?? ""
        let line = """
            \(label): url=\(session.webView.url?.absoluteString ?? "nil") title="\(session.title)" error=\(session.loadError ?? "none") stillLoading=\(session.isLoading)
              ua=\(userAgent)
              text=\(visibleText)
            """

        if let image = try? await session.webView.takeSnapshot(configuration: nil) {
            let attachment = XCTAttachment(image: image)
            attachment.name = "probe-\(label)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }

        session.tearDown()
        window.isHidden = true
        return line
    }
}
