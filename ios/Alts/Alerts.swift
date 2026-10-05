import Foundation
import UserNotifications

/// Local notifications for unread counts that go up while Alts is open.
///
/// This is the only kind of alert a web-based app can offer on iOS. Web Push doesn't reach
/// web views inside apps, and once iOS suspends Alts nothing runs until it's opened again.
@MainActor
enum Alerts {
    static func requestPermission() async -> Bool {
        do {
            return try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
        } catch {
            return false
        }
    }

    static func post(for space: Space, unread: UnreadCount) {
        let content = UNMutableNotificationContent()
        if space.requiresUnlock {
            // A locked space's name and activity stay private, including on the Lock Screen.
            content.title = "Alts"
            content.body = "A locked space has new activity."
        } else {
            content.title = space.name
            content.body = "\(unread.text) unread"
        }
        content.sound = .default
        content.threadIdentifier = space.id.uuidString
        content.userInfo = ["space": space.id.uuidString]

        // Reusing the space's ID replaces its previous alert instead of stacking a new one per message.
        let request = UNNotificationRequest(identifier: space.id.uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    /// Clears a space's alert once it has been seen, or when the space is deleted.
    static func remove(for spaceID: UUID) {
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [spaceID.uuidString])
    }
}

/// Shows alerts while the app is in front and opens the right space when one is tapped.
///
/// UserNotifications calls these methods off the main thread, and finishing an async version
/// off the main thread crashes in UIKit, so the conformance is main-actor isolated.
@MainActor
final class NotificationRouter: NSObject {
    static let shared = NotificationRouter()
}

extension NotificationRouter: @preconcurrency UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard
            let raw = response.notification.request.content.userInfo["space"] as? String,
            let id = UUID(uuidString: raw),
            SpaceStore.savedSpaces().contains(where: { $0.id == id })
        else { return }
        Navigator.shared.show(id)
    }
}
