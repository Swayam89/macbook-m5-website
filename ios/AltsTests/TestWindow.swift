import UIKit

/// A real window for web views under test. WebKit treats a view outside any window as hidden,
/// which is not how the app shows a space.
@MainActor
enum TestWindow {
    struct NoScene: Error {}

    static func make() throws -> UIWindow {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else {
            throw NoScene()
        }
        let window = UIWindow(windowScene: scene)
        window.frame = scene.coordinateSpace.bounds
        window.windowLevel = .alert + 1
        window.rootViewController = UIViewController()
        window.makeKeyAndVisible()
        return window
    }
}
