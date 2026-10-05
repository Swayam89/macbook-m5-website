import Foundation

enum WebAddress {
    /// Turns what someone types ("example.com", "http://192.168.1.20:8080") into a URL a space can load.
    /// Returns nil for anything that isn't a plausible http or https address.
    static func url(from text: String) -> URL? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !trimmed.contains(where: \.isWhitespace) else { return nil }

        let candidate = trimmed.contains("://") ? trimmed : "https://" + trimmed
        guard
            let components = URLComponents(string: candidate),
            let scheme = components.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            let host = components.host, !host.isEmpty,
            host.contains(".") || host == "localhost"
        else { return nil }

        return components.url
    }

    /// True when `url` is on the same site as `home`: the same host, or a host under the same parent
    /// domain ("faq.whatsapp.com" for "web.whatsapp.com"). Links that leave the site open in Safari instead.
    static func isSameSite(_ url: URL, as home: URL) -> Bool {
        guard let host = url.host()?.lowercased(), let homeHost = home.host()?.lowercased() else { return false }
        if host == homeHost { return true }

        let labels = homeHost.split(separator: ".")
        let parent = labels.count > 2 ? labels.dropFirst().joined(separator: ".") : homeHost
        return host == parent || host.hasSuffix("." + parent)
    }
}
