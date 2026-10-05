import Foundation
import WebKit
import os

/// Erasing and clearing the per-space website data stores.
@MainActor
enum WebsiteData {
    private static let log = Logger(subsystem: "com.swayam89.alts", category: "website-data")

    /// Spaces whose data still has to be deleted. A store is only ever deleted after its space was
    /// deliberately removed and written here first, never because it seems to be missing from the
    /// list: a list that failed to load must not cost anyone their sign-ins.
    private static var pendingFileURL: URL {
        URL.applicationSupportDirectory.appending(path: "pending-removals.json")
    }

    /// Records that a space's data must go. Call before removing the space from the list.
    static func markForRemoval(_ spaceID: UUID) {
        var pending = pendingRemovals()
        pending.insert(spaceID)
        savePendingRemovals(pending)
    }

    /// Deletes a space's cookies, storage and caches from disk.
    ///
    /// WebKit refuses while anything still holds the store, and web views release it a moment
    /// after they're torn down, so this retries with a short backoff. Anything still left is
    /// retried on the next launch by `removePending()`.
    static func erase(spaceID: UUID) async {
        for attempt in 0..<6 {
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: spaceID)
                var pending = pendingRemovals()
                pending.remove(spaceID)
                savePendingRemovals(pending)
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
        for id in pendingRemovals() {
            await erase(spaceID: id)
        }
    }

    /// Signs a space out of everything by clearing its data while keeping the space itself.
    /// The caller must make sure no web view is using the store, or the page could write back.
    static func clear(spaceID: UUID) async {
        let store = WKWebsiteDataStore(forIdentifier: spaceID)
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }

    private static func pendingRemovals() -> Set<UUID> {
        guard let data = try? Data(contentsOf: pendingFileURL) else { return [] }
        return (try? JSONDecoder().decode(Set<UUID>.self, from: data)) ?? []
    }

    private static func savePendingRemovals(_ ids: Set<UUID>) {
        do {
            if ids.isEmpty {
                try? FileManager.default.removeItem(at: pendingFileURL)
                return
            }
            try FileManager.default.createDirectory(
                at: pendingFileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try JSONEncoder().encode(ids).write(to: pendingFileURL, options: .atomic)
        } catch {
            log.error("Could not record pending removals: \(error.localizedDescription, privacy: .public)")
        }
    }
}
