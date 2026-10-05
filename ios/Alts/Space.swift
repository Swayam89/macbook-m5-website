import Foundation

/// One isolated copy of a site, signed in to its own account.
///
/// `id` is also the identifier of the space's `WKWebsiteDataStore`. That store is what keeps
/// two spaces of the same service from seeing each other's cookies and storage.
struct Space: Identifiable, Hashable, Sendable {
    let id: UUID
    var name: String
    var service: Service
    /// Only used when `service` is `.custom`.
    var customURL: URL?
    var tint: Tint
    var requiresUnlock: Bool
    var desktopSite: Bool
    var pageZoom: Double
    var alertsWhileOpen: Bool
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        service: Service,
        customURL: URL? = nil,
        tint: Tint,
        requiresUnlock: Bool = false,
        desktopSite: Bool? = nil,
        pageZoom: Double = 1,
        alertsWhileOpen: Bool = false,
        createdAt: Date = .now
    ) {
        self.id = id
        self.name = name
        self.service = service
        self.customURL = customURL
        self.tint = tint
        self.requiresUnlock = requiresUnlock
        self.desktopSite = desktopSite ?? service.prefersDesktopSite
        self.pageZoom = pageZoom
        self.alertsWhileOpen = alertsWhileOpen
        self.createdAt = createdAt
    }

    var startURL: URL? {
        service.homeURL ?? customURL
    }

    /// "WhatsApp", or the host of a custom site without its "www.".
    var siteName: String {
        guard service == .custom else { return service.displayName }
        guard let host = customURL?.host() else { return service.displayName }
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }

    /// One or two characters for the tile, taken from the name: "Work Chat" gives "WC".
    var monogram: String {
        let words = name.split(whereSeparator: \.isWhitespace)
            .filter { $0.first?.isLetter == true || $0.first?.isNumber == true }
        switch words.count {
        case 0: return String(siteName.prefix(1)).uppercased()
        case 1: return String(words[0].prefix(1)).uppercased()
        default: return (String(words[0].prefix(1)) + String(words[1].prefix(1))).uppercased()
        }
    }
}

extension Space: Codable {
    private enum CodingKeys: String, CodingKey {
        case id, name, service, customURL, tint, requiresUnlock, desktopSite, pageZoom, alertsWhileOpen, createdAt
    }

    /// Every field after `service` has a fallback, so files written by older builds keep loading.
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        service = try container.decode(Service.self, forKey: .service)
        customURL = try container.decodeIfPresent(URL.self, forKey: .customURL)
        tint = try container.decodeIfPresent(Tint.self, forKey: .tint) ?? .graphite
        requiresUnlock = try container.decodeIfPresent(Bool.self, forKey: .requiresUnlock) ?? false
        desktopSite = try container.decodeIfPresent(Bool.self, forKey: .desktopSite) ?? service.prefersDesktopSite
        pageZoom = try container.decodeIfPresent(Double.self, forKey: .pageZoom) ?? 1
        alertsWhileOpen = try container.decodeIfPresent(Bool.self, forKey: .alertsWhileOpen) ?? false
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt) ?? .now
    }
}

enum Tint: String, Codable, CaseIterable, Sendable {
    case graphite, moss, brick, ochre, harbor, plum, clay, pine

    var name: String {
        rawValue.capitalized
    }
}

extension Tint {
    /// An unknown tint decodes as graphite rather than failing the whole list.
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Tint(rawValue: raw) ?? .graphite
    }
}

/// Safari's zoom steps, so the menu behaves like the one people already know.
enum PageZoom {
    static let steps: [Double] = [0.5, 0.75, 0.85, 1, 1.15, 1.25, 1.5, 1.75, 2]

    static func smaller(than zoom: Double) -> Double? {
        steps.last { $0 < zoom - 0.001 }
    }

    static func larger(than zoom: Double) -> Double? {
        steps.first { $0 > zoom + 0.001 }
    }
}
