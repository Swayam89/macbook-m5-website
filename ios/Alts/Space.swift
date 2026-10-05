import Foundation

/// One isolated copy of a web app, signed in to its own account.
///
/// `id` is also the identifier of the space's `WKWebsiteDataStore`, which is what keeps
/// two spaces of the same service from seeing each other's cookies and storage.
struct Space: Identifiable, Codable, Hashable, Sendable {
    let id: UUID
    var name: String
    var service: Service
    /// Only used when `service` is `.custom`.
    var customURL: URL?
    var tint: Tint
    var requiresUnlock: Bool
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        service: Service,
        customURL: URL? = nil,
        tint: Tint,
        requiresUnlock: Bool = false,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.service = service
        self.customURL = customURL
        self.tint = tint
        self.requiresUnlock = requiresUnlock
        self.createdAt = createdAt
    }

    var startURL: URL? {
        service.homeURL ?? customURL
    }

    /// One or two letters for the tile, taken from the space name: "Work Chat" gives "WC".
    var monogram: String {
        let words = name.split(whereSeparator: \.isWhitespace).filter { $0.first?.isLetter == true || $0.first?.isNumber == true }
        switch words.count {
        case 0: return String(service.displayName.prefix(1)).uppercased()
        case 1: return String(words[0].prefix(1)).uppercased()
        default: return (String(words[0].prefix(1)) + String(words[1].prefix(1))).uppercased()
        }
    }
}

enum Tint: String, Codable, CaseIterable, Sendable {
    case graphite, moss, brick, ochre, harbor, plum, clay, pine

    var name: String {
        rawValue.capitalized
    }
}

extension Tint {
    /// Decoding an unknown tint falls back to graphite rather than failing the whole list.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Tint(rawValue: raw) ?? .graphite
    }
}
