import Foundation

/// A site Alts knows how to open well. `.custom` covers everything else.
enum Service: String, CaseIterable, Identifiable, Codable, Sendable {
    case whatsApp = "whatsapp"
    case telegram
    case instagram
    case facebook
    case messenger
    case x
    case threads
    case discord
    case slack
    case linkedIn = "linkedin"
    case reddit
    case bluesky
    case custom

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .whatsApp: "WhatsApp"
        case .telegram: "Telegram"
        case .instagram: "Instagram"
        case .facebook: "Facebook"
        case .messenger: "Messenger"
        case .x: "X"
        case .threads: "Threads"
        case .discord: "Discord"
        case .slack: "Slack"
        case .linkedIn: "LinkedIn"
        case .reddit: "Reddit"
        case .bluesky: "Bluesky"
        case .custom: "Other Website"
        }
    }

    var homeURL: URL? {
        switch self {
        case .whatsApp: URL(string: "https://web.whatsapp.com/")
        case .telegram: URL(string: "https://web.telegram.org/k/")
        case .instagram: URL(string: "https://www.instagram.com/")
        case .facebook: URL(string: "https://www.facebook.com/")
        // messenger.com shut down in April 2026 and now redirects here.
        case .messenger: URL(string: "https://www.facebook.com/messages/")
        case .x: URL(string: "https://x.com/")
        case .threads: URL(string: "https://www.threads.com/")
        case .discord: URL(string: "https://discord.com/app")
        case .slack: URL(string: "https://app.slack.com/client")
        case .linkedIn: URL(string: "https://www.linkedin.com/")
        case .reddit: URL(string: "https://www.reddit.com/")
        case .bluesky: URL(string: "https://bsky.app/")
        case .custom: nil
        }
    }

    /// These sites turn phones away, or send them to the App Store, unless they see a desktop browser.
    var prefersDesktopSite: Bool {
        switch self {
        case .whatsApp, .messenger, .discord, .slack: true
        default: false
        }
    }

    /// Feed-style sites get pull to refresh. Chat apps don't, because a stray pull would reload the whole conversation.
    var allowsPullToRefresh: Bool {
        switch self {
        case .whatsApp, .telegram, .messenger, .discord, .slack: false
        default: true
        }
    }

    /// Shown when someone picks the service. Only services with a catch worth knowing up front have one.
    var caveat: String? {
        switch self {
        case .whatsApp:
            "WhatsApp's website works as a linked device, so the account has to stay active on another phone. If it suggests downloading the app, tap Continue to WhatsApp Web, then link it from that phone under Linked Devices. WhatsApp's own app can also hold two accounts."
        case .messenger:
            "Messenger's website closed in 2026, so this opens your messages on facebook.com. You need a Facebook account."
        case .discord, .slack:
            "This loads the desktop site, which is small on a phone. Pinch to zoom, or turn your phone sideways."
        case .custom:
            "Google accounts can't sign in here. Google blocks sign-in inside apps that show web pages."
        default:
            nil
        }
    }
}
