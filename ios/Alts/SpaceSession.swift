import Observation
import SafariServices
import UIKit
import WebKit

/// An unread count read from a page title. "(99+)" is kept as 99 and marked as capped.
struct UnreadCount: Equatable, Sendable {
    var value: Int
    var isCapped: Bool

    var text: String {
        isCapped ? "\(value)+" : "\(value)"
    }

    /// Most messaging sites put the count at the start of the tab title: "(3) WhatsApp", "(99+) Discord".
    static func parse(title: String) -> UnreadCount? {
        guard let match = title.firstMatch(of: #/^\s*\((\d{1,5})(\+?)\)/#), let value = Int(match.1) else { return nil }
        return UnreadCount(value: value, isCapped: !match.2.isEmpty)
    }
}

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
    private(set) var url: URL?
    private(set) var unread: UnreadCount?
    private(set) var isLoading = false
    private(set) var progress = 0.0
    private(set) var canGoBack = false
    private(set) var canGoForward = false
    private(set) var loadError: String?
    var popup: PopupWindow?

    @ObservationIgnored private var observations: [NSKeyValueObservation] = []
    @ObservationIgnored private var downloads: [(download: WKDownload, destination: URL)] = []
    /// Finished downloads and failures that arrived while the space wasn't showing.
    @ObservationIgnored private var heldResults: [Result<URL, Error>] = []
    @ObservationIgnored private var needsReload = false
    @ObservationIgnored private var recentCrashes: [Date] = []
    /// The count last seen or announced, so a title that briefly drops its count doesn't alert twice.
    @ObservationIgnored private var alertedCount = 0
    @ObservationIgnored private var countlessSince: Date?
    /// Resumes an open JavaScript dialog with its cancel value when the dialog is taken away.
    @ObservationIgnored fileprivate var cancelOpenDialog: (@MainActor () -> Void)?
    @ObservationIgnored fileprivate weak var presentedController: UIViewController?

    init(space: Space) {
        self.space = space

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = WKWebsiteDataStore(forIdentifier: space.id)
        configuration.allowsInlineMediaPlayback = true
        configuration.applicationNameForUserAgent = Self.applicationName(desktop: space.desktopSite)
        configuration.defaultWebpagePreferences.preferredContentMode = space.desktopSite ? .desktop : .mobile
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
        observe(\.url) { $0.url = $1 }
        observe(\.isLoading) { $0.isLoading = $1 }
        observe(\.estimatedProgress) { $0.progress = $1 }
        observe(\.canGoBack) { $0.canGoBack = $1 }
        observe(\.canGoForward) { $0.canGoForward = $1 }

        loadStartPage()
    }

    /// True while the page is showing. A space switched away from keeps its web view backstage
    /// in the window, so having a window isn't enough.
    var isOnScreen: Bool {
        Self.isShowing(webView)
    }

    var hasActiveDownloads: Bool {
        !downloads.isEmpty
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

    /// Try Again after an error, including the one shown when the page keeps crashing.
    func retry() {
        recentCrashes.removeAll()
        reload()
    }

    /// Back to the service's home page.
    func loadStartPage() {
        guard let url = space.startURL else {
            loadError = "This space was made by a newer version of Alts. Update Alts to open it."
            return
        }
        loadError = nil
        webView.load(URLRequest(url: url))
    }

    /// Called each time the page comes on screen.
    func didAttach() {
        alertedCount = unread?.value ?? 0
        countlessSince = nil
        Alerts.remove(for: space.id)
        if needsReload {
            needsReload = false
            reload()
        }
        let held = heldResults
        heldResults.removeAll()
        for result in held {
            deliver(result)
        }
    }

    /// Takes down anything this space put on screen, for when it locks.
    func dismissPresentations() {
        cancelOpenDialog?()
        cancelOpenDialog = nil
        presentedController?.dismiss(animated: false)
        presentedController = nil
        popup = nil
    }

    func tearDown() {
        dismissPresentations()
        observations.forEach { $0.invalidate() }
        observations.removeAll()
        downloads.forEach { $0.download.cancel { _ in } }
        downloads.removeAll()
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.removeFromSuperview()
    }

    private func titleChanged(to newTitle: String) {
        title = newTitle
        let newUnread = UnreadCount.parse(title: newTitle)
        if let newUnread {
            // A title without a count for more than a few seconds means everything was read, not a flash.
            if let countlessSince, countlessSince.timeIntervalSinceNow < -10 {
                alertedCount = 0
            }
            countlessSince = nil
            if newUnread.value > alertedCount, space.alertsWhileOpen, !isOnScreen {
                Alerts.post(for: space, unread: newUnread)
            }
            alertedCount = newUnread.value
        } else if countlessSince == nil {
            countlessSince = .now
        }
        unread = newUnread
    }

    private func observe<Value: Sendable>(
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

    /// On screen, as opposed to waiting backstage or out of the window.
    fileprivate static func isShowing(_ webView: WKWebView) -> Bool {
        webView.window != nil && !Backstage.contains(webView)
    }

    /// Presents only for a web view that is showing, so a space waiting backstage or locked
    /// never puts anything in front of whatever is on screen.
    @discardableResult
    private func present(_ controller: UIViewController, over webView: WKWebView) -> Bool {
        guard Self.isShowing(webView), let presenter = webView.topViewController, presenter.presentedViewController == nil else {
            return false
        }
        presenter.present(controller, animated: true)
        presentedController = controller
        return true
    }

    fileprivate func open(externally url: URL, from webView: WKWebView) {
        guard Self.isShowing(webView) else { return }
        let scheme = url.scheme?.lowercased()
        if scheme == "http" || scheme == "https" {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = UIColor(named: "AccentColor")
            present(safari, over: webView)
            return
        }
        // Like Safari, ask before a page sends someone to another app. Phone links get the system's own prompt.
        if scheme == "tel" {
            UIApplication.shared.open(url)
            return
        }
        Task {
            let answer = await dialog(
                over: webView,
                title: "Open in Another App?",
                message: url.host() ?? url.scheme ?? "",
                actions: [("Cancel", .cancel, false), ("Open", .default, true)]
            )
            if answer.confirmed {
                _ = await UIApplication.shared.open(url)
            }
        }
    }

    fileprivate func deliver(_ result: Result<URL, Error>) {
        switch result {
        case .success(let file):
            // The share sheet covers saving to Files or Photos, and sending the file on.
            let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
            share.popoverPresentationController?.sourceView = webView
            share.popoverPresentationController?.sourceRect = CGRect(x: webView.bounds.midX, y: webView.bounds.midY, width: 1, height: 1)
            share.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
            }
            if !present(share, over: webView) {
                heldResults.append(result)
            }
        case .failure(let error):
            let alert = UIAlertController(title: "Download Failed", message: error.localizedDescription, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .cancel))
            if !present(alert, over: webView) {
                heldResults.append(result)
            }
        }
    }

    fileprivate func record(_ error: Error, for webView: WKWebView) {
        let error = error as NSError
        if error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled { return }
        // 102 "Frame load interrupted": the navigation turned into a download.
        // 204 "Plug-in handled load": a video or audio file is playing in its own document.
        if error.domain == "WebKitErrorDomain" && (error.code == 102 || error.code == 204) { return }

        if webView === self.webView {
            loadError = error.localizedDescription
        } else if webView === popup?.webView {
            popup?.loadError = error.localizedDescription
        }
    }

    fileprivate func clearError(for webView: WKWebView) {
        if webView === self.webView {
            loadError = nil
        } else if webView === popup?.webView {
            popup?.loadError = nil
        }
    }

    fileprivate func addDownload(_ download: WKDownload, to destination: URL) {
        downloads.append((download, destination))
    }

    fileprivate func finishDownload(_ download: WKDownload) -> URL? {
        guard let index = downloads.firstIndex(where: { $0.download === download }) else { return nil }
        return downloads.remove(at: index).destination
    }

    fileprivate func dropDownload(_ download: WKDownload) {
        downloads.removeAll { $0.download === download }
    }

    fileprivate func noteCrash() -> Bool {
        recentCrashes = recentCrashes.filter { $0.timeIntervalSinceNow > -60 } + [.now]
        if recentCrashes.count >= 3 {
            loadError = "This page keeps closing. It may need more memory than iOS allows it."
            return false
        }
        if !isOnScreen {
            needsReload = true
            return false
        }
        return true
    }
}

// MARK: - JavaScript dialogs

private struct DialogAnswer: Sendable {
    var confirmed: Bool
    var text: String?
}

/// Resumes a continuation once, whichever comes first: a button, the dialog being taken away,
/// or UIKit refusing to show it.
@MainActor
private final class ResumeOnce {
    private var continuation: CheckedContinuation<DialogAnswer, Never>?

    init(_ continuation: CheckedContinuation<DialogAnswer, Never>) {
        self.continuation = continuation
    }

    func resume(_ answer: DialogAnswer) {
        continuation?.resume(returning: answer)
        continuation = nil
    }
}

extension SpaceSession {
    /// Shows an alert over `webView` and waits for an answer. A web view that isn't showing gets the
    /// cancel answer at once, so a page in the background never blocks on a dialog nobody can see.
    fileprivate func dialog(
        over webView: WKWebView,
        title: String,
        message: String,
        actions: [(title: String, style: UIAlertAction.Style, confirms: Bool)],
        textField defaultText: String? = nil
    ) async -> DialogAnswer {
        let cancelled = DialogAnswer(confirmed: false, text: nil)
        guard Self.isShowing(webView), let presenter = webView.topViewController, presenter.presentedViewController == nil else {
            return cancelled
        }
        let answer = await withCheckedContinuation { continuation in
            let once = ResumeOnce(continuation)
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            if let defaultText {
                alert.addTextField { $0.text = defaultText }
            }
            for action in actions {
                alert.addAction(UIAlertAction(title: action.title, style: action.style) { [weak alert] _ in
                    once.resume(DialogAnswer(confirmed: action.confirms, text: alert?.textFields?.first?.text))
                })
            }
            cancelOpenDialog = { once.resume(cancelled) }
            presenter.present(alert, animated: true)
            presentedController = alert
            if alert.presentingViewController == nil {
                once.resume(cancelled)
            }
        }
        cancelOpenDialog = nil
        return answer
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
            // mailto:, tel: and links into other apps. They only open from a link in the page,
            // and only after the person agrees (see open(externally:from:)).
            if navigationAction.navigationType == .linkActivated {
                open(externally: url, from: webView)
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
        clearError(for: webView)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        record(error, for: webView)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        record(error, for: webView)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard webView === self.webView else { return }
        // iOS ends web content that uses too much memory. Reload, but stop if it keeps happening.
        if noteCrash() {
            webView.reload()
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
        // A tapped link to another site opens in a Safari view.
        if navigationAction.navigationType == .linkActivated,
           let url = navigationAction.request.url,
           let home = space.startURL,
           !WebAddress.isSameSite(url, as: home) {
            open(externally: url, from: webView)
            return nil
        }

        // Same-site links and windows opened by script (sign-in popups) get a real web view built from
        // `configuration`, shown in a sheet. It shares this space's data store and keeps `window.opener`,
        // and the web app behind it keeps running instead of being navigated away.
        guard Self.isShowing(webView) else { return nil }
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
        _ = await dialog(over: webView, title: frame.securityOrigin.host, message: message, actions: [("OK", .cancel, true)])
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await dialog(
            over: webView,
            title: frame.securityOrigin.host,
            message: message,
            actions: [("Cancel", .cancel, false), ("OK", .default, true)]
        ).confirmed
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo
    ) async -> String? {
        let answer = await dialog(
            over: webView,
            title: frame.securityOrigin.host,
            message: prompt,
            actions: [("Cancel", .cancel, false), ("OK", .default, true)],
            textField: defaultText ?? ""
        )
        return answer.confirmed ? (answer.text ?? "") : nil
    }
}

// MARK: - WKDownloadDelegate

extension SpaceSession: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String) async -> URL? {
        let name = suggestedFilename.isEmpty ? "Download" : suggestedFilename
        // Like Safari, nothing is saved unless the person agrees, and a space that isn't showing can't ask.
        let answer = await dialog(
            over: download.webView ?? webView,
            title: "Download \u{201C}\(name)\u{201D}?",
            message: response.url?.host() ?? "",
            actions: [("Cancel", .cancel, false), ("Download", .default, true)]
        )
        guard answer.confirmed else { return nil }

        let folder = Downloads.folder.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        let destination = folder.appending(path: name)
        addDownload(download, to: destination)
        return destination
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let destination = finishDownload(download) {
            deliver(.success(destination))
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        dropDownload(download)
        deliver(.failure(error))
    }
}

/// Where downloads wait until they're shared. Emptied at launch, since nothing there is needed after that.
enum Downloads {
    static var folder: URL {
        FileManager.default.temporaryDirectory.appending(path: "Downloads", directoryHint: .isDirectory)
    }

    static func removeLeftovers() {
        try? FileManager.default.removeItem(at: folder)
    }
}

// MARK: - Popup windows

/// A window a site opened with `window.open` or a same-site link, shown in a sheet until it's closed.
@MainActor
@Observable
final class PopupWindow: Identifiable {
    let webView: WKWebView
    private(set) var host = ""
    private(set) var isLoading = false
    var loadError: String?
    @ObservationIgnored private var observations: [NSKeyValueObservation] = []

    init(webView: WKWebView) {
        self.webView = webView
        observations.append(webView.observe(\.url, options: [.initial, .new]) { [weak self] webView, _ in
            MainActor.assumeIsolated {
                self?.host = webView.url?.host() ?? ""
            }
        })
        observations.append(webView.observe(\.isLoading, options: [.initial, .new]) { [weak self] webView, _ in
            MainActor.assumeIsolated {
                self?.isLoading = webView.isLoading
            }
        })
    }
}

extension UIView {
    /// The view controller on top, for presenting from WebKit callbacks. Nil while a presentation is
    /// still animating in or out, because UIKit refuses to present anything then.
    var topViewController: UIViewController? {
        var top = window?.rootViewController
        while let presented = top?.presentedViewController {
            if presented.isBeingPresented || presented.isBeingDismissed {
                return nil
            }
            top = presented
        }
        return top
    }
}
