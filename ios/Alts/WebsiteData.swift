import Foundation
import WebKit
import os

/// Erasing and clearing the per-space website data stores.
@MainActor
enum WebsiteData {
    private static let log = Logger(subsystem: "com.swayam89.alts", category: "website-data")

    /// A launch-time removal is given up after this many tries, so a store WebKit can't remove
    /// (or crashes removing) can never put the app into a crash loop.
    private static let maximumAttempts = 3

    /// Spaces whose data still has to be deleted, with how many launches have tried. A store is only
    /// ever deleted after its space was deliberately removed and written here first, never because it
    /// seems to be missing from the list: a list that failed to load must not cost anyone their sign-ins.
    private static var pendingFileURL: URL {
        URL.applicationSupportDirectory.appending(path: "pending-removals.json")
    }

    /// Records that a space's data must go. Call before removing the space from the list.
    static func markForRemoval(_ spaceID: UUID) {
        var pending = pendingRemovals()
        pending[spaceID] = pending[spaceID] ?? 0
        savePendingRemovals(pending)
    }

    /// Deletes a space's cookies, storage and caches from disk.
    ///
    /// WebKit refuses while anything still holds the store, and web views release it a moment
    /// after they're torn down, so this retries with a short backoff. Anything still left is
    /// retried on a later launch by `removePending()`.
    static func erase(spaceID: UUID) async {
        // remove(forIdentifier:) crashes the app when WebKit's network process isn't running yet,
        // which is the case after launch until a page has loaded (CI's UI tests caught this).
        // Asking any store for its records starts the process, and holding the store keeps it up.
        let starter = WKWebsiteDataStore.nonPersistent()
        defer { withExtendedLifetime(starter) {} }
        _ = await starter.dataRecords(ofTypes: [WKWebsiteDataTypeCookies])

        guard await WKWebsiteDataStore.allDataStoreIdentifiers.contains(spaceID) else {
            // Nothing on disk, for example a space deleted before its page ever loaded.
            forget(spaceID)
            return
        }
        for attempt in 0..<6 {
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: spaceID)
                forget(spaceID)
                return
            } catch {
                log.info("Data store still in use (attempt \(attempt + 1)): \(error.localizedDescription, privacy: .public)")
                if attempt < 5 {
                    try? await Task.sleep(for: .milliseconds(250 << attempt))
                }
            }
        }
    }

    /// Finishes removals that didn't complete before the app was last closed.
    static func removePending() async {
        for (id, attempts) in pendingRemovals() {
            guard attempts < maximumAttempts else {
                log.error("Giving up on removing a data store after \(attempts) launches")
                forget(id)
                continue
            }
            // Counted before trying, so an attempt that never returns still counts.
            var pending = pendingRemovals()
            pending[id] = attempts + 1
            savePendingRemovals(pending)
            await erase(spaceID: id)
        }
    }

    /// Signs a space out of everything by clearing its data while keeping the space itself.
    /// The caller must make sure no web view is using the store, or the page could write back.
    static func clear(spaceID: UUID) async {
        let store = WKWebsiteDataStore(forIdentifier: spaceID)
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }

    /// Drops a space from the pending list without removing anything.
    static func forget(_ spaceID: UUID) {
        var pending = pendingRemovals()
        guard pending.removeValue(forKey: spaceID) != nil else { return }
        savePendingRemovals(pending)
    }

    static func pendingRemovals() -> [UUID: Int] {
        guard let data = try? Data(contentsOf: pendingFileURL) else { return [:] }
        return (try? JSONDecoder().decode([UUID: Int].self, from: data)) ?? [:]
    }

    private static func savePendingRemovals(_ pending: [UUID: Int]) {
        do {
            if pending.isEmpty {
                try? FileManager.default.removeItem(at: pendingFileURL)
                return
            }
            try FileManager.default.createDirectory(
                at: pendingFileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try JSONEncoder().encode(pending).write(to: pendingFileURL, options: .atomic)
        } catch {
            log.error("Could not record pending removals: \(error.localizedDescription, privacy: .public)")
        }
    }
}
