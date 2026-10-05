import Foundation
import Observation
import UIKit

/// Keeps the most recently used spaces alive so switching between them is instant.
///
/// Every live web view has its own WebContent process, and a heavy web app can take a few
/// hundred megabytes, so only `limit` sessions stay alive. Older ones are torn down. Coming
/// back to one is a page load, not a new sign-in, because the space's data store keeps the cookies.
@MainActor
@Observable
final class SessionCache {
    private(set) var sessions: [UUID: SpaceSession] = [:]

    @ObservationIgnored private var recent: [UUID] = []
    @ObservationIgnored private let limit: Int

    init(limit: Int = 4) {
        self.limit = limit
        _ = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.trim(to: 1)
            }
        }
    }

    func existingSession(for id: UUID) -> SpaceSession? {
        sessions[id]
    }

    @discardableResult
    func session(for space: Space) -> SpaceSession {
        if let existing = sessions[space.id] {
            touch(space.id)
            return existing
        }
        let session = SpaceSession(space: space)
        sessions[space.id] = session
        touch(space.id)
        trim(to: limit)
        return session
    }

    /// Brings live sessions in line with the saved spaces after an edit, a reorder or a delete.
    func sync(with spaces: [Space]) {
        for (id, session) in sessions {
            guard let space = spaces.first(where: { $0.id == id }) else {
                discard(id)
                continue
            }
            if space.desktopSite != session.space.desktopSite {
                // The content mode and user agent are fixed when a web view is created.
                discard(id)
            } else if space != session.space {
                session.update(space)
            }
        }
    }

    func discard(_ id: UUID) {
        sessions.removeValue(forKey: id)?.tearDown()
        recent.removeAll { $0 == id }
    }

    /// Deletes a space's website data. The space itself is removed from `SpaceStore` by the caller.
    func erase(_ id: UUID) {
        discard(id)
        Task {
            await WebsiteData.erase(spaceID: id)
        }
    }

    /// Signs a space out of everything and reloads its home page.
    func clearData(for space: Space) async {
        await WebsiteData.clear(spaceID: space.id)
        sessions[space.id]?.loadStartPage()
    }

    private func touch(_ id: UUID) {
        recent.removeAll { $0 == id }
        recent.append(id)
    }

    /// Discards the least recently used sessions, never the one on screen.
    private func trim(to count: Int) {
        for id in recent where recent.count > count {
            if sessions[id]?.isOnScreen == true { continue }
            discard(id)
        }
    }
}
