import Foundation
import WebKit
import os

/// Erasing and sweeping the per-space website data stores.
@MainActor
enum WebsiteData {
    private static let log = Logger(subsystem: "com.swayam89.alts", category: "website-data")

    /// Deletes a space's cookies, storage and caches from disk.
    ///
    /// WebKit refuses while anything still holds the store, and web views release it a moment
    /// after they're torn down, so this retries with a short backoff. Anything still left over
    /// is caught by `sweepOrphans` on the next launch.
    static func erase(spaceID: UUID) async {
        for attempt in 0..<6 {
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: spaceID)
                return
            } catch {
                log.info("Data store still in use (attempt \(attempt + 1)): \(error.localizedDescription, privacy: .public)")
                try? await Task.sleep(for: .milliseconds(250 << attempt))
            }
        }
    }

    /// Removes stores whose space no longer exists, for example after the app was closed mid-delete.
    static func sweepOrphans(keeping ids: Set<UUID>) async {
        for id in await WKWebsiteDataStore.allDataStoreIdentifiers where !ids.contains(id) {
            do {
                try await WKWebsiteDataStore.remove(forIdentifier: id)
            } catch {
                log.error("Could not remove orphaned store: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Signs a space out of everything by clearing its data while keeping the space itself.
    static func clear(spaceID: UUID) async {
        let store = WKWebsiteDataStore(forIdentifier: spaceID)
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast)
    }
}
