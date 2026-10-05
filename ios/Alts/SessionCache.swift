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
    /// Spaces whose data is being cleared. No session may start for them until it's done.
    private(set) var clearing: Set<UUID> = []

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

    /// Marks a space as just used, so it is the last to be released.
    func markUsed(_ id: UUID) {
        if sessions[id] != nil {
            touch(id)
        }
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

    /// Deletes a space's website data. Call before removing the space from `SpaceStore`.
    func erase(_ id: UUID) {
        WebsiteData.markForRemoval(id)
        discard(id)
        Alerts.remove(for: id)
        Task {
            await WebsiteData.erase(spaceID: id)
        }
    }

    /// Signs a space out of everything. The page is closed first so it can't write its sign-in
    /// back while the data is being removed, and it reopens fresh on the home page.
    func clearData(for space: Space) async {
        clearing.insert(space.id)
        discard(space.id)
        await WebsiteData.clear(spaceID: space.id)
        clearing.remove(space.id)
    }

    /// Takes down anything a locked space has on screen, such as a share sheet, before the app is put away.
    func dismissPresentations(of isLocked: (Space) -> Bool) {
        for session in sessions.values where isLocked(session.space) {
            session.dismissPresentations()
        }
    }

    private func touch(_ id: UUID) {
        recent.removeAll { $0 == id }
        recent.append(id)
    }

    /// Releases the least recently used sessions. Never the one on screen, and never one that is
    /// still downloading, since that would cancel the download.
    private func trim(to count: Int) {
        for id in recent where recent.count > count {
            guard let session = sessions[id], !session.isOnScreen, !session.hasActiveDownloads else { continue }
            discard(id)
        }
    }
}
