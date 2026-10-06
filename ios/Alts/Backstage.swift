import UIKit

/// Where the web views of spaces that aren't on screen wait: in the window, behind everything else.
///
/// WebKit pauses a page as soon as its view leaves the window, which froze unread counts and
/// alerts for every space except the one showing (`OffScreenTests` caught this). Measured on the
/// iOS 26.5 simulator, a page with a one-second timer ran 8 times in 8 seconds on screen, 8 times
/// back here, and twice when taken out of the window before WebKit suspended it. A view back here
/// sits under the app's own opaque content, takes no touches, and is hidden from VoiceOver.
@MainActor
enum Backstage {
    static func keep(_ view: UIView, in window: UIWindow) {
        let stage = window.subviews.lazy.compactMap { $0 as? StageView }.first ?? makeStage(in: window)
        view.removeFromSuperview()
        view.frame = stage.bounds
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Invisible, because iOS shrinks the screen behind a sheet and would show what's back here.
        // An invisible page runs just as fast (8 ticks in 8 seconds in the same measurement).
        view.alpha = 0
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
