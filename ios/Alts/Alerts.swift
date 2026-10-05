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

    static func post(for space: Space, unread: Int) {
        let content = UNMutableNotificationContent()
        content.title = space.name
        content.body = unread == 1 ? "1 unread" : "\(unread) unread"
        content.sound = .default
        content.threadIdentifier = space.id.uuidString
        content.userInfo = ["space": space.id.uuidString]

        // Reusing the space's ID replaces its previous alert instead of stacking a new one per message.
        let request = UNNotificationRequest(identifier: space.id.uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}

/// Shows alerts while the app is in front and opens the right space when one is tapped.
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = NotificationRouter()

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
            let id = UUID(uuidString: raw)
        else { return }
        await MainActor.run {
            Navigator.shared.show(id)
        }
    }
}
