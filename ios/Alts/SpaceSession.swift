import Observation
import SafariServices
import UIKit
import WebKit

/// The live web view for one space, plus the state the UI shows about it.
///
/// Sessions outlive the screen that shows them (see `SessionCache`), so switching between
/// spaces doesn't reload the page or drop a WebSocket.
@MainActor
@Observable
final class SpaceSession: NSObject {
    private(set) var space: Space
    let webView: WKWebView

    private(set) var title = ""
    private(set) var unreadCount: Int?
    private(set) var isLoading = false
    private(set) var progress = 0.0
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    private(set) var loadError: String?
    var popup: PopupWindow?

    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    @ObservationIgnored private var downloads: [(download: WKDownload, destination: URL)] = []
    @ObservationIgnored private var needsReload = false

    init(space: Space) {
        self.space = space

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: space.id)
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = Self.applicationName(desktop: space.desktopSite)
        configuration.defaultWebpagePreferences.preferredContentMode = space.desktopSite ? .desktop : .recommended
        webView = WKWebView(frame: .zero, configuration: configuration)

        super.init()

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.pageZoom = space.pageZoom
        #if DEBUG
        webView.isInspectable = true
        #endif

        if space.service.allowsPullToRefresh {
            let refreshControl = UIRefreshControl()
            refreshControl.addTarget(self, action: #selector(pulledToRefresh(_:)), for: .valueChanged)
            webView.scrollView.refreshControl = refreshControl
        }

        observe(\.title) { session, title in
            session.titleChanged(to: title ?? "")
        }
        observe(\.isLoading) { $0.isLoading = $1 }
        observe(\.estimatedProgress) { $0.progress = $1 }
        observe(\.canGoBack) { $0.canGoBack = $1 }
        observe(\.canGoForward) { $0.canGoForward = $1 }

        loadStartPage()
    }

    var isOnScreen: Bool {
        webView.window != nil
    }

    /// Applies edits that don't need a new web view. Changing `desktopSite` does, so `SessionCache` replaces the session for that.
    func update(_ space: Space) {
        self.space = space
        if webView.pageZoom != space.pageZoom {
            webView.pageZoom = space.pageZoom
        }
    }

    func reload() {
        loadError = nil
        if webView.url == nil {
            loadStartPage()
        } else {
            webView.reload()
        }
    }

    /// Back to the service's home page, for example after clearing the space's data.
    func loadStartPage() {
        loadError = nil
        guard let url = space.startURL else { return }
        webView.load(URLRequest(url: url))
    }

    /// Called when the web view is put back on screen.
    func didAttach() {
        if needsReload {
            needsReload = false
            reload()
        }
    }

    func tearDown() {
        observations.forEach { $0.invalidate() }
        observations.removeAll()
        downloads.forEach { $0.download.cancel { _ in } }
        downloads.removeAll()
        popup = nil
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.removeFromSuperview()
    }

    /// Most messaging sites put the unread count at the start of the tab title: "(3) WhatsApp".
    nonisolated static func unreadCount(fromTitle title: String) -> Int? {
        guard let match = title.firstMatch(of: #/^\s*\((\d{1,5})\+?\)/#) else { return nil }
        return Int(match.1)
    }

    private func titleChanged(to newTitle: String) {
        title = newTitle
        let newCount = Self.unreadCount(fromTitle: newTitle)
        if let newCount, newCount > (unreadCount ?? 0), space.alertsWhileOpen, !isOnScreen {
            Alerts.post(for: space, unread: newCount)
        }
        unreadCount = newCount
    }

    private func observe<Value>(
        _ keyPath: KeyPath<WKWebView, Value>,
        _ apply: @escaping @MainActor (SpaceSession, Value) -> Void
    ) {
        let observation = webView.observe(keyPath, options: [.initial, .new]) { [weak self] _, change in
            guard let value = change.newValue else { return }
            MainActor.assumeIsolated {
                guard let self else { return }
                apply(self, value)
            }
        }
        observations.append(observation)
    }

    @objc private func pulledToRefresh(_ control: UIRefreshControl) {
        reload()
        control.endRefreshing()
    }

    /// Appended to WebKit's user agent so sites see the same string Safari sends. Safari's
    /// version number has matched the iOS major version since iOS 17.
    private static func applicationName(desktop: Bool) -> String {
        let version = "\(ProcessInfo.processInfo.operatingSystemVersion.majorVersion).0"
        return desktop ? "Version/\(version) Safari/605.1.15" : "Version/\(version) Mobile/15E148 Safari/604.1"
    }

    private func open(externally url: URL) {
        let scheme = url.scheme?.lowercased()
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(named: "AccentColor")
            webView.topViewController?.present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }

    private func isIgnorable(_ error: Error) -> Bool {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return true }
        // "Frame load interrupted": WebKit reports this when a navigation turns into a download.
        if error.domain == "WebKitErrorDomain" && error.code == 102 { return true }
        return false
    }
}

// MARK: - WKNavigationDelegate

extension SpaceSession: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        if navigationAction.shouldPerformDownload {
            return .download
        }
        guard let url = navigationAction.request.url, let scheme = url.scheme?.lowercased() else {
            return .allow
        }
        switch scheme {
        case "http", "https", "about", "blob", "data":
            return .allow
        default:
            // mailto:, tel: and links into other apps. Only follow them when someone tapped the link,
            // so a site can't throw people into the App Store on page load.
            if navigationAction.navigationType == .linkActivated {
                open(externally: url)
            }
            return .cancel
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if navigationResponse.isForMainFrame && !navigationResponse.canShowMIMEType {
            return .download
        }
        if let response = navigationResponse.response as? HTTPURLResponse,
           let disposition = response.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().hasPrefix("attachment") {
            return .download
        }
        return .allow
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView === self.webView {
            loadError = nil
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView, !isIgnorable(error) else { return }
        loadError = error.localizedDescription
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard webView === self.webView, !isIgnorable(error) else { return }
        loadError = error.localizedDescription
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        // iOS kills background web content to free memory. Reload now if someone is looking, otherwise on return.
        if isOnScreen {
            reload()
        } else {
            needsReload = true
        }
    }
}

// MARK: - WKUIDelegate

extension SpaceSession: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        let url = navigationAction.request.url

        // A tapped target="_blank" link: stay in the space if it's the same site, otherwise use Safari.
        if navigationAction.navigationType == .linkActivated, let url {
            if let home = space.startURL, WebAddress.isSameSite(url, as: home) {
                webView.load(navigationAction.request)
            } else {
                open(externally: url)
            }
            return nil
        }

        // A window opened by script, usually a sign-in popup. It needs a real web view built from
        // `configuration` so it shares this space's data store and keeps `window.opener`.
        let child = WKWebView(frame: .zero, configuration: configuration)
        child.navigationDelegate = self
        child.uiDelegate = self
        popup = PopupWindow(webView: child)
        return child
    }

    func webViewDidClose(_ webView: WKWebView) {
        if webView === popup?.webView {
            popup = nil
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
        _ = await presentDialog(over: webView, message: message, host: frame.securityOrigin.host, actions: [("OK", .cancel, true)])
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await presentDialog(over: webView, message: message, host: frame.securityOrigin.host, actions: [("Cancel", .cancel, false), ("OK", .default, true)])
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo
    ) async -> String? {
        guard let presenter = webView.topViewController else { return nil }
        return await withCheckedContinuation { continuation in
            let alert = UIAlertController(title: frame.securityOrigin.host, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in continuation.resume(returning: nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                continuation.resume(returning: alert?.textFields?.first?.text ?? "")
            })
            presenter.present(alert, animated: true)
        }
    }

    private func presentDialog(
        over webView: WKWebView,
        message: String,
        host: String,
        actions: [(title: String, style: UIAlertAction.Style, result: Bool)]
    ) async -> Bool {
        guard let presenter = webView.topViewController else { return false }
        return await withCheckedContinuation { continuation in
            let alert = UIAlertController(title: host, message: message, preferredStyle: .alert)
            for action in actions {
                alert.addAction(UIAlertAction(title: action.title, style: action.style) { _ in
                    continuation.resume(returning: action.result)
                })
            }
            presenter.present(alert, animated: true)
        }
    }
}

// MARK: - WKDownloadDelegate

extension SpaceSession: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let folder = FileManager.default.temporaryDirectory
            .appending(path: "Downloads", directoryHint: .isDirectory)
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        let destination = folder.appending(path: suggestedFilename.isEmpty ? "Download" : suggestedFilename)
        downloads.append((download, destination))
        return destination
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let index = downloads.firstIndex(where: { $0.download === download }) else { return }
        let destination = downloads.remove(at: index).destination

        // The share sheet covers saving to Files or Photos, and sending the file on.
        let share = UIActivityViewController(activityItems: [destination], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = webView
        share.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
        webView.topViewController?.present(share, animated: true)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeAll { $0.download === download }
        guard let presenter = webView.topViewController else { return }
        let alert = UIAlertController(title: "Download Failed", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .cancel))
        presenter.present(alert, animated: true)
    }
}

// MARK: - Popup windows

/// A window a site opened with `window.open`, shown in a sheet until the site closes it.
@MainActor
@Observable
final class PopupWindow: Identifiable {
    let webView: WKWebView
    private(set) var host = ""
    @ObservationIgnored private var observation: NSKeyValueObservation?

    init(webView: WKWebView) {
        self.webView = webView
        observation = webView.observe(\.url, options: [.initial, .new]) { [weak self] webView, _ in
            MainActor.assumeIsolated {
                self?.host = webView.url?.host() ?? ""
            }
        }
    }
}

extension UIView {
    /// The view controller that is currently on top, for presenting alerts and sheets from WebKit callbacks.
    var topViewController: UIViewController? {
        var top = window?.rootViewController
        while let presented = top?.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }
}
