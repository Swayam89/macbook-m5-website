import Foundation

/// Decides when a page's unread count is news. Titles are all Alts has to go on, and they also
/// lose their count while a page loads, and on sites that flash a message in place of the count.
struct UnreadTracker {
    /// The count last seen or announced.
    private(set) var seenCount = 0
    /// False until the page has shown what was already unread when Alts started watching it.
    private var hasBaseline = false
    /// Set while a new page loads, until it shows a count.
    private var awaitingFirstCount = false
    private var countlessSince: Date?
    private var lastCountAt: Date?

    /// Takes the count from a new title, or nil when the title has none. Returns true when the
    /// count is higher than what was last seen or announced.
    mutating func update(_ count: Int?, at now: Date = .now) -> Bool {
        guard let count else {
            // While a page loads its title has no count yet, which says nothing about what was read.
            if countlessSince == nil && !awaitingFirstCount {
                countlessSince = now
            }
            return false
        }
        let quietFor = countlessSince.map { now.timeIntervalSince($0) } ?? 0
        if awaitingFirstCount {
            awaitingFirstCount = false
            // A new page's first count is what it already had, unless it went half a minute
            // after loading without one.
            if quietFor > 30 {
                seenCount = 0
                hasBaseline = true
            }
        } else if quietFor > 10 {
            // No count for more than a few seconds means everything was read, not a flash.
            seenCount = 0
        }
        let isNew = hasBaseline && count > seenCount
        countlessSince = nil
        lastCountAt = now
        hasBaseline = true
        seenCount = count
        return isNew
    }

    mutating func pageStartedLoading() {
        awaitingFirstCount = true
        countlessSince = nil
    }

    /// Starts the half minute after which a page that loaded without a count is taken to have none.
    mutating func pageFinishedLoading(showing count: Int?, at now: Date = .now) {
        if count == nil && countlessSince == nil {
            countlessSince = now
        }
    }

    /// A load that stopped before a new page arrived, such as a link that turned into a download.
    /// The old page is still showing, so its title still counts.
    mutating func pageStoppedLoading(showing count: Int?, at now: Date = .now) {
        guard awaitingFirstCount else { return }
        awaitingFirstCount = false
        pageFinishedLoading(showing: count, at: now)
    }

    /// The page came on screen, so whatever it shows has been seen.
    mutating func shown(_ count: Int?) {
        guard !awaitingFirstCount else { return }
        seenCount = count ?? 0
        hasBaseline = true
        countlessSince = nil
    }

    /// The page left the screen. What it showed then has been seen.
    mutating func hidden(_ count: Int?, at now: Date = .now) {
        guard !awaitingFirstCount else { return }
        if let count {
            seenCount = count
        } else if let lastCountAt, now.timeIntervalSince(lastCountAt) < 5 {
            // Left while a flashing title showed its message. Keep the count.
        } else {
            // Everything was read, so the next count is new however soon it comes.
            seenCount = 0
            countlessSince = nil
        }
        hasBaseline = true
    }
}
