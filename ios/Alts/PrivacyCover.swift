import SwiftUI
import UIKit

/// Covers the whole screen, sheets and alerts included, while Alts is in the app switcher or
/// behind Control Center and a locked space is showing. It sits in its own window above the app,
/// because a cover inside the space's view would be drawn under anything presented over it.
@MainActor
enum PrivacyCover {
    private static var window: UIWindow?

    static func show() {
        guard window == nil, let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first else { return }
        let cover = UIWindow(windowScene: scene)
        cover.windowLevel = .alert + 1
        cover.rootViewController = UIHostingController(rootView: CoverView())
        cover.isHidden = false
        window = cover
    }

    static func hide() {
        window?.isHidden = true
        window = nil
    }

    private struct CoverView: View {
        var body: some View {
            Image(systemName: "lock.fill")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(.systemBackground))
                .accessibilityLabel("Locked")
        }
    }
}
