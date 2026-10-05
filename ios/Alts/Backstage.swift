import UIKit

/// Where the web views of spaces that aren't on screen wait: in the window, behind everything else.
///
/// WebKit pauses a page as soon as its view leaves the window, which froze unread counts and
/// alerts for every space except the one showing (`OffScreenTests` caught this). A view back here
/// still has a window, so its page keeps running, but it sits under the app's own opaque content,
/// takes no touches, and is hidden from VoiceOver.
@MainActor
enum Backstage {
    static func keep(_ view: UIView, in window: UIWindow) {
        let stage = window.subviews.lazy.compactMap { $0 as? StageView }.first ?? makeStage(in: window)
        view.removeFromSuperview()
        view.frame = stage.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        stage.addSubview(view)
    }

    static func contains(_ view: UIView) -> Bool {
        view.superview is StageView
    }

    private static func makeStage(in window: UIWindow) -> StageView {
        let stage = StageView(frame: window.bounds)
        stage.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        stage.isUserInteractionEnabled = false
        stage.accessibilityElementsHidden = true
        window.insertSubview(stage, at: 0)
        return stage
    }

    private final class StageView: UIView {}
}
