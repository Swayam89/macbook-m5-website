import Foundation
import Testing
@testable import Alts

struct WebAddressTests {
    @Test(arguments: [
        ("example.com", "https://example.com"),
        ("  notion.so/my-page  ", "https://notion.so/my-page"),
        ("http://192.168.1.20:8080", "http://192.168.1.20:8080"),
        ("localhost:3000", "https://localhost:3000"),
    ])
    func acceptsWhatPeopleType(input: String, expected: String) {
        #expect(WebAddress.url(from: input)?.absoluteString == expected)
    }

    @Test(arguments: ["", "   ", "example", "two words.com", "ftp://example.com", "javascript:alert(1)", "file:///etc/hosts"])
    func rejectsNonsense(input: String) {
        #expect(WebAddress.url(from: input) == nil)
    }

    @Test func sameSiteCoversSubdomainsOfTheParent() throws {
        let home = try #require(URL(string: "https://web.whatsapp.com/"))
        #expect(WebAddress.isSameSite(try #require(URL(string: "https://web.whatsapp.com/send")), as: home))
        #expect(WebAddress.isSameSite(try #require(URL(string: "https://faq.whatsapp.com/123")), as: home))
        #expect(WebAddress.isSameSite(try #require(URL(string: "https://whatsapp.com")), as: home))
        #expect(!WebAddress.isSameSite(try #require(URL(string: "https://notwhatsapp.com")), as: home))
        #expect(!WebAddress.isSameSite(try #require(URL(string: "https://youtube.com/watch?v=1")), as: home))
    }

    @Test func twoLabelHostsDoNotMatchTheirTopLevelDomain() throws {
        let home = try #require(URL(string: "https://x.com/"))
        #expect(WebAddress.isSameSite(try #require(URL(string: "https://x.com/home")), as: home))
        #expect(!WebAddress.isSameSite(try #require(URL(string: "https://other.com")), as: home))
    }
}

struct UnreadCountTests {
    @Test(arguments: [
        ("(3) WhatsApp", 3),
        ("(12) Facebook", 12),
        ("  (1) Home / X", 1),
    ])
    func readsTheLeadingCount(title: String, expected: Int) {
        #expect(UnreadCount.parse(title: title) == UnreadCount(value: expected, isCapped: false))
    }

    @Test func keepsTheCapOnLargeCounts() {
        let count = UnreadCount.parse(title: "(99+) Discord | #general")
        #expect(count == UnreadCount(value: 99, isCapped: true))
        #expect(count?.text == "99+")
    }

    @Test(arguments: ["WhatsApp", "Telegram Web", "Inbox (3)", "(three) unread", ""])
    func ignoresTitlesWithoutOne(title: String) {
        #expect(UnreadCount.parse(title: title) == nil)
    }
}

struct PageZoomTests {
    @Test func stepsFollowSafari() {
        #expect(PageZoom.larger(than: 1) == 1.15)
        #expect(PageZoom.smaller(than: 1) == 0.85)
        #expect(PageZoom.smaller(than: 0.5) == nil)
        #expect(PageZoom.larger(than: 2) == nil)
    }
}
