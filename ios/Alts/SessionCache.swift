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
    /// Spaces with Alerts While Open, started in the background so they can alert before they're opened.
    @ObservationIgnored private var pinned: Set<UUID> = []
    /// The list last given to `keepRunning`, to start the alert spaces again after a memory warning.
    @ObservationIgnored private var lastSpaces: [Space] = []
    @ObservationIgnored private var memoryWarnings = 0
    @ObservationIgnored private let limit: Int
    @ObservationIgnored private let recoveryDelay: Duration

    init(limit: Int = 4, recoveryDelay: Duration = .seconds(60)) {
        self.limit = limit
        self.recoveryDelay = recoveryDelay
        _ = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.didReceiveMemoryWarning()
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
        trim(to: limit, keeping: space.id)
        return session
    }

    /// Starts the spaces that have Alerts While Open turned on, up to `limit`, and keeps them running
    /// backstage so their unread counts and alerts work before anyone opens them. Locked spaces wait
    /// until they're unlocked, and an Alerts While Open space stops being kept once the setting is off.
    func keepRunning(_ spaces: [Space]) {
        lastSpaces = spaces
        let wanted = spaces.filter { $0.alertsWhileOpen && !$0.requiresUnlock }.prefix(limit)
        pinned = Set(wanted.map(\.id))
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ ($0 as? UIWindowScene)?.keyWindow })
            .first
        else { return }
        for space in wanted where sessions[space.id] == nil && !clearing.contains(space.id) {
            let session = SpaceSession(space: space)
            sessions[space.id] = session
            recent.insert(space.id, at: 0)
            // Nobody is looking at it, so it can't play sound or video until it's opened.
            session.webView.setAllMediaPlaybackSuspended(true, completionHandler: {})
            Backstage.keep(session.webView, in: window)
        }
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

    /// Releases everything but the space on screen. The alert spaces start again once a minute
    /// passes without another warning, so alerts pause instead of stopping until Alts is reopened.
    private func didReceiveMemoryWarning() {
        trim(to: 1, includingPinned: true)
        memoryWarnings += 1
        let warning = memoryWarnings
        Task { [weak self, recoveryDelay] in
            try? await Task.sleep(for: recoveryDelay)
            guard let self, self.memoryWarnings == warning else { return }
            self.keepRunning(self.lastSpaces)
        }
    }

    private func touch(_ id: UUID) {
        recent.removeAll { $0 == id }
        recent.append(id)
    }

    /// Releases the least recently used sessions until `count` are left. Spaces kept for alerts don't
    /// count and stay, except on a memory warning. Never releases the space being opened, the one on
    /// screen, one that is still downloading (that would cancel the download), or one holding a finished
    /// download it hasn't shown yet (the file would be lost).
    private func trim(to count: Int, keeping kept: UUID? = nil, includingPinned: Bool = false) {
        let candidates = recent.filter { includingPinned || !pinned.contains($0) }
        var remaining = candidates.count
        for id in candidates where remaining > count {
            guard id != kept, let session = sessions[id], !session.isOnScreen,
                  !session.hasActiveDownloads, !session.hasHeldResults else { continue }
            discard(id)
            remaining -= 1
        }
    }
}
