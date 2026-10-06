import Foundation
import Testing
@testable import Alts

/// When an unread count is worth an alert, with times fixed so nothing depends on the clock.
struct UnreadTrackerTests {
    private func at(_ seconds: Double) -> Date {
        Date(timeIntervalSinceReferenceDate: seconds)
    }

    @Test func whatAPageAlreadyHadIsNotNews() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        #expect(!tracker.update(nil, at: at(0)))
        tracker.pageFinishedLoading(showing: nil, at: at(1))
        #expect(!tracker.update(3, at: at(5)))
        #expect(tracker.update(4, at: at(60)))
    }

    @Test func aReloadDoesNotAnnounceTheSameCountAgain() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        _ = tracker.update(3, at: at(5))

        tracker.pageStartedLoading()
        #expect(!tracker.update(nil, at: at(100)))
        tracker.pageFinishedLoading(showing: nil, at: at(101))
        #expect(!tracker.update(3, at: at(115)), "the same three items, shown again after a reload")

        tracker.pageStartedLoading()
        tracker.pageFinishedLoading(showing: nil, at: at(201))
        #expect(tracker.update(5, at: at(210)), "more than before the reload is news")
    }

    @Test func aPageThatLoadsWithNothingUnreadAnnouncesItsFirstMessage() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        tracker.pageFinishedLoading(showing: nil, at: at(2))
        #expect(tracker.update(1, at: at(40)))
    }

    @Test func readingThenLeavingMakesTheNextMessageNews() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        _ = tracker.update(2, at: at(5))
        tracker.shown(2)
        #expect(!tracker.update(nil, at: at(20)))
        tracker.hidden(nil, at: at(22))
        #expect(tracker.update(1, at: at(25)), "a message three seconds after leaving")
    }

    @Test func aFlashingTitleIsNotAnnouncedAgain() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        _ = tracker.update(1, at: at(5))
        for second in stride(from: 10.0, through: 28, by: 2) {
            #expect(!tracker.update(nil, at: at(second)))
            #expect(!tracker.update(1, at: at(second + 1)))
        }
        // Leaves while the title shows the message instead of the count.
        #expect(!tracker.update(nil, at: at(30)))
        tracker.hidden(nil, at: at(30.5))
        #expect(!tracker.update(1, at: at(31)))
    }

    @Test func aCountThatWasGoneForAWhileIsNewWhenItComesBack() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        _ = tracker.update(2, at: at(5))
        #expect(!tracker.update(nil, at: at(10)))
        #expect(tracker.update(1, at: at(30)), "read somewhere else, then a new message")
    }

    @Test func aLinkThatBecameADownloadDoesNotSilenceTheNextMessage() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        _ = tracker.update(3, at: at(5))
        #expect(!tracker.update(nil, at: at(10)))
        // Taps an attachment: a load starts, then stops when it turns into a download.
        tracker.pageStartedLoading()
        tracker.pageStoppedLoading(showing: nil, at: at(11))
        tracker.hidden(nil, at: at(20))
        #expect(tracker.update(1, at: at(22)))
    }

    @Test func leavingWhileThePageLoadsKeepsItsFirstCountQuiet() {
        var tracker = UnreadTracker()
        tracker.pageStartedLoading()
        tracker.shown(nil)
        tracker.hidden(nil, at: at(1))
        tracker.pageFinishedLoading(showing: nil, at: at(2))
        #expect(!tracker.update(3, at: at(8)))
    }
}
