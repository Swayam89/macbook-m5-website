import XCTest

/// Drives the real app on a simulator. Launches with `-ui-testing`, which keeps the space list
/// in memory so these tests never touch real spaces.
final class AltsUITests: XCTestCase {
    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor
    func testAddingAndOpeningASpace() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.staticTexts["No Spaces"].waitForExistence(timeout: 10))
        attachScreenshot(of: app, named: "1-empty")

        app.buttons["Add Space"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["New Space"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "2-new-space")

        app.staticTexts["Site"].tap()
        // "Other Website" is last in the list and starts below the fold, and lists only build visible rows.
        let otherWebsite = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", "Other Website")).firstMatch
        var swipes = 0
        while !otherWebsite.isHittable && swipes < 4 {
            app.swipeUp()
            swipes += 1
        }
        otherWebsite.tap()

        let address = app.textFields["address-field"]
        XCTAssertTrue(address.waitForExistence(timeout: 5))
        address.tap()
        address.typeText("example.com")

        let name = app.textFields["name-field"]
        name.tap()
        name.typeText("Reading")
        attachScreenshot(of: app, named: "3-custom-site")

        app.navigationBars["New Space"].buttons["Add"].tap()

        let reading = row(named: "Reading", in: app)
        let added = reading.waitForExistence(timeout: 10)
        attachScreenshot(of: app, named: "3b-added")
        XCTAssertTrue(added, "the new space should appear in the list")
        XCTAssertEqual(reading.label, "Reading, example.com")
        reading.tap()

        // The page is real: example.com loaded inside the space's own web view.
        XCTAssertTrue(app.navigationBars["Reading"].waitForExistence(timeout: 10), "the space should open")
        let heading = app.webViews.firstMatch.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "Example Domain")).firstMatch
        let loaded = heading.waitForExistence(timeout: 45)
        attachScreenshot(of: app, named: "4-space-open")
        XCTAssertTrue(loaded, "example.com should load inside the space")

        app.navigationBars.buttons["Actions"].tap()
        attachScreenshot(of: app, named: "5-actions-menu")
    }

    @MainActor
    func testListWithSampleSpaces() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-sample-spaces"]
        app.launch()

        XCTAssertTrue(row(named: "Personal", in: app).waitForExistence(timeout: 10))
        XCTAssertEqual(row(named: "Work", in: app).label, "Work, WhatsApp, Locked")
        attachScreenshot(of: app, named: "6-list")

        row(named: "Shop", in: app).press(forDuration: 1)
        attachScreenshot(of: app, named: "7-context-menu")
        app.buttons["Edit Space"].tap()
        XCTAssertTrue(app.navigationBars["Edit Space"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "8-edit-space")
        app.navigationBars["Edit Space"].buttons["Cancel"].tap()

        app.navigationBars["Spaces"].buttons["Add Space"].tap()
        app.staticTexts["Site"].tap()
        attachScreenshot(of: app, named: "9-site-list")
    }

    @MainActor
    private func row(named name: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "\(name),")).firstMatch
    }

    @MainActor
    private func attachScreenshot(of app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
