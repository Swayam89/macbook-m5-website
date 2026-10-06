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
        var announced = false
        tracker.pageStartedLoading()
        announced = tracker.update(nil, at: at(0))
        #expect(!announced)
        tracker.pageFinishedLoading(showing: nil, at: at(1))
        announced = tracker.update(3, at: at(5))
        #expect(!announced)
        announced = tracker.update(4, at: at(60))
        #expect(announced)
    }

    @Test func aReloadDoesNotAnnounceTheSameCountAgain() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        _ = tracker.update(3, at: at(5))

        tracker.pageStartedLoading()
        announced = tracker.update(nil, at: at(100))
        #expect(!announced)
        tracker.pageFinishedLoading(showing: nil, at: at(101))
        announced = tracker.update(3, at: at(115))
        #expect(!announced, "the same three items, shown again after a reload")

        tracker.pageStartedLoading()
        tracker.pageFinishedLoading(showing: nil, at: at(201))
        announced = tracker.update(5, at: at(210))
        #expect(announced, "more than before the reload is news")
    }

    @Test func aPageThatLoadsWithNothingUnreadAnnouncesItsFirstMessage() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        tracker.pageFinishedLoading(showing: nil, at: at(2))
        announced = tracker.update(1, at: at(40))
        #expect(announced)
    }

    @Test func readingThenLeavingMakesTheNextMessageNews() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        _ = tracker.update(2, at: at(5))
        tracker.shown(2)
        announced = tracker.update(nil, at: at(20))
        #expect(!announced)
        tracker.hidden(nil, at: at(22))
        announced = tracker.update(1, at: at(25))
        #expect(announced, "a message three seconds after leaving")
    }

    @Test func aFlashingTitleIsNotAnnouncedAgain() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        _ = tracker.update(1, at: at(5))
        for second in stride(from: 10.0, through: 28, by: 2) {
            announced = tracker.update(nil, at: at(second))
            #expect(!announced)
            announced = tracker.update(1, at: at(second + 1))
            #expect(!announced)
        }
        // Leaves while the title shows the message instead of the count.
        announced = tracker.update(nil, at: at(30))
        #expect(!announced)
        tracker.hidden(nil, at: at(30.5))
        announced = tracker.update(1, at: at(31))
        #expect(!announced)
    }

    @Test func aCountThatWasGoneForAWhileIsNewWhenItComesBack() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        _ = tracker.update(2, at: at(5))
        announced = tracker.update(nil, at: at(10))
        #expect(!announced)
        announced = tracker.update(1, at: at(30))
        #expect(announced, "read somewhere else, then a new message")
    }

    @Test func aLinkThatBecameADownloadDoesNotSilenceTheNextMessage() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        _ = tracker.update(3, at: at(5))
        announced = tracker.update(nil, at: at(10))
        #expect(!announced)
        // Taps an attachment: a load starts, then stops when it turns into a download.
        tracker.pageStartedLoading()
        tracker.pageStoppedLoading(showing: nil, at: at(11))
        tracker.hidden(nil, at: at(20))
        announced = tracker.update(1, at: at(22))
        #expect(announced)
    }

    @Test func leavingWhileThePageLoadsKeepsItsFirstCountQuiet() {
        var tracker = UnreadTracker()
        var announced = false
        tracker.pageStartedLoading()
        tracker.shown(nil)
        tracker.hidden(nil, at: at(1))
        tracker.pageFinishedLoading(showing: nil, at: at(2))
        announced = tracker.update(3, at: at(8))
        #expect(!announced)
    }
}
