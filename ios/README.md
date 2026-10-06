# Alts

An iPhone app for using several accounts of the same site side by side: two WhatsApps, a personal and a work Instagram, three Discords. Each account lives in its own space, and spaces never share cookies or storage.

It is the closest thing to an Android "dual apps" or "app clone" feature that can be built for iPhone and shipped. It is not the same thing, and the rest of this file explains why.

## How app cloning works on Android

Android phones sell five different mechanisms under the name "cloning":

1. **Built-in dual apps** (Samsung Dual Messenger, Xiaomi Dual Apps, OnePlus/Oppo App Cloner, Huawei App Twin). The phone maker creates a hidden Android user (user 95 on Samsung, 999 on Xiaomi and OnePlus) and installs the existing app into it. There is one APK, but the second copy runs under a different Linux UID with its own data folder (`/data/user/999/<package>`). Android itself (`USER_TYPE_PROFILE_CLONE` since Android 12) has a clone profile type for this.
2. **Work profiles** (Shelter, Island, Insular). The same idea built on Android's managed-profile API, so any app can be copied in.
3. **Container apps** (Parallel Space, Dual Space, VirtualApp). The guest app runs inside the host app's process. The host declares hundreds of placeholder activities and permissions, intercepts calls to Android's system services, and redirects file paths. Every "clone" shares the host's UID and permissions, which is why security researchers and banking trojans both like this technique.
4. **Repackaging** (App Cloner by Applisto). The APK is unpacked, given a new package name, re-signed with a different key and reinstalled. Anything tied to the original signing certificate breaks: Google sign-in, Play Integrity, in-app purchases.
5. **Accounts inside the app.** WhatsApp, Instagram, Telegram and X keep several accounts in one install. It is the most reliable option and needs no tricks.

## Why none of that works on iPhone

- **Sandbox.** Every iOS app gets its own container and cannot read or write another app's files. There is no second "user" to install into.
- **Code signing.** iOS only runs code signed by Apple-issued certificates. An app cannot load or run another app's binary, and App Store binaries are FairPlay-encrypted to the buyer's Apple ID.
- **App Review Guideline 2.5.2.** Apps "may not … download, install, or execute code which introduces or changes features or functionality of the app, including other apps." This rule also applies to EU and Japan notarization, so alternative marketplaces don't open the door.
- **Sideloading** a re-signed copy with a changed bundle ID does work for one technical person, but it needs a decrypted IPA (which needs a jailbreak-era exploit), expires every 7 days with a free certificate, loses push notifications, and gets WhatsApp accounts banned for using an unofficial client. It cannot be distributed.

Every "Parallel Space" or "Dual Messenger" app on the App Store is a web browser showing the service's website. Their reviews say so: "it just provided the web based version."

## What Alts does instead

Alts is that kind of app, and says so.

- Each space gets its own persistent `WKWebsiteDataStore(forIdentifier:)` (iOS 17 and later), which keeps cookies, local storage, IndexedDB, caches and service workers separate per space. `IsolationTests` checks cookies, localStorage and IndexedDB against real WebKit, not a mock.
- Sites that turn phones away (WhatsApp Web, Discord, Slack, Messenger) get the desktop site, with the same user agent Safari sends when you ask it for one. Any space can switch with Desktop Site in its menu. WhatsApp still suggests its app first; tap Continue to WhatsApp Web.
- The four spaces you used most recently keep running while Alts is open, even after you switch to another one, so their pages don't reload and their connections stay up. Older ones are released to save memory and reload from their saved data when you come back. Spaces that aren't showing wait in the window behind the app's own screens, because WebKit pauses any page that leaves the window; `OffScreenTests` checks this.
- Spaces can require Face ID, Touch ID or the passcode. While a locked space is showing, a cover goes over the whole screen, sheets included, before iOS takes the app switcher snapshot. When Alts goes to the background, everything locks again and anything a locked space had open (a share sheet, a Safari view, a dialog) is closed. Editing, clearing or deleting a locked space asks first.
- Unread counts are read from page titles, like "(3) WhatsApp", and shown in the list. Spaces with Alerts While Open start in the background when Alts opens (up to four), and Alts posts a notification when one you're not looking at gets new unread items. Locked spaces only check after you unlock them, and their alerts don't say which space they're from. All of this stops when you leave Alts.
- Sign-in popups and links within the same site open in a sheet that shares the space's sign-in, so the web app behind keeps running. Links to other sites open in an in-app Safari view. That view uses one browser profile shared by every space, not the space's own data. Links into other apps ask first.
- Downloads ask first, like Safari, then go to the share sheet, so you can save to Files or Photos. A space that isn't on screen can't start one or show a dialog over another space.
- Each space can be opened from Shortcuts with the Open Space action. Adding that shortcut to the Home Screen gives a space its own icon, the nearest iOS equivalent to a cloned app's icon.
- Spaces show their initials on a colored tile, never a service's logo.

## What doesn't work, and won't

| Limitation | Why |
| --- | --- |
| No notifications while Alts is closed | Web Push doesn't reach web views inside apps (Apple DTS: "Web Push Notifications will not work in apps with a WKWebView"), and iOS suspends apps about five seconds after they leave the screen. |
| WhatsApp needs another phone | WhatsApp Web is a linked device. The account has to live on a phone, and linked devices sign out if that phone is inactive for 14 days. WhatsApp's own iPhone app has supported two accounts since June 2026, which is better for most people. |
| No Google sign-in | Google blocks sign-in inside embedded web views (`disallowed_useragent`). Gmail, YouTube and "Sign in with Google" buttons won't work. That's why there's no Google preset. |
| Messenger needs Facebook | messenger.com closed in April 2026 and now redirects to facebook.com/messages. |
| Discord and Slack are small | They only serve their desktop sites to phones. Pinch to zoom, use Page Zoom in the menu, or turn the phone sideways. |
| Instagram posting is limited | Instagram's website can't post Reels or go live. |

## Build and run

Alts is an iPhone app. iPads and Apple silicon Macs can run iPhone apps in compatibility mode, but Alts has only been tested on the iPhone simulator.

You need a Mac with Xcode 26 or later. Xcode 27 is current; the App Store has required the iOS 26 SDK since April 2026. The app runs on iOS 17 and later.

1. Open `ios/Alts.xcodeproj`.
2. Select the Alts target, then Signing & Capabilities, and pick your team. Change the bundle identifier from `com.swayam89.alts` if you don't own it.
3. Choose an iPhone or a simulator and press Run.

There are no third-party dependencies. The project uses Xcode's folder-synchronized groups, so new files dropped into `Alts/` are picked up without editing the project.

### Tests

- `AltsTests`: the space list and its file format (including entries it can't read), address and unread-count parsing, the session cache, the launch cleanup that must never delete data it wasn't told to, and isolation between spaces using real WebKit: cookies, localStorage and IndexedDB stay in their own space, and localStorage is still there after a space's page is closed and reopened.
- `OffScreenTests` checks that a space you switched away from keeps running and that a sign-in popup doesn't stay behind after it closes.
- `AltsUITests`: adds a space for example.com, opens it and checks the page loaded, walks the list, context menu and edit screen, deletes a space right after launch, and launches with a deletion left over from last time. Screenshots are attached to the test results.
- `ServiceProbeTests`: loads every built-in site in a real space and attaches a screenshot plus the final URL, title and user agent. It needs the network and only runs when `ALTS_PROBE=1` reaches the test host.

From Terminal:

```sh
cd ios
xcodebuild test -project Alts.xcodeproj -scheme Alts \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO

# The site probe. xcodebuild passes TEST_RUNNER_ variables to the test host without the prefix.
TEST_RUNNER_ALTS_PROBE=1 xcodebuild test -project Alts.xcodeproj -scheme Alts \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:AltsTests/ServiceProbeTests CODE_SIGNING_ALLOWED=NO
```

In Xcode, choose Product, Scheme, Edit Scheme, and add `ALTS_PROBE` with the value `1` under Run, Arguments, Environment Variables. The Test action uses the Run action's variables, so the probe runs the next time you test.

CI (`.github/workflows/ios.yml`) builds once, then runs the unit and UI tests on one simulator at a time. It runs the site probe only when the workflow is started by hand. It currently builds with Xcode 26.6 and tests on the iOS 26.5 simulator, the newest stable pair on GitHub's macOS runners; it has not run on iOS 27 or on a physical iPhone.

## Before submitting to the App Store

These are the review risks, in order of how likely they are to come up:

- **4.2 Minimum functionality.** Apple rejects apps that are "a repackaged website." Alts adds isolation, locking, alerts and Shortcuts on top, which is the argument to make in the review notes.
- **5.2.2 Third-party sites.** Apple can ask for proof you're allowed to show a service's content. A general-purpose browser of sites the user picks is the usual defense. Don't add features that scrape or automate a service.
- **The built-in sites and the desktop user agent are the main 5.2.2 exposure.** Presenting Alts as a browser for sites the person chooses, with presets as shortcuts, is the stronger position.
- **Age rating.** Other Website accepts any address, so answer Yes to Unrestricted Web Access in the age rating questionnaire. That makes the app 16+.
- **4.1(c) and 5.2.1 Names and trademarks.** Don't put "WhatsApp" or any other service's name or logo in the app's name, icon, subtitle or screenshots. Inside the app, plain text names for the sites are normal browser behavior.

## Layout

```
Alts/
  AltsApp.swift          App entry, navigation stack, launch modes for tests
  Space.swift            The space model and its JSON format
  Service.swift          Built-in sites, their addresses and quirks
  SpaceStore.swift       The saved list of spaces
  SpaceSession.swift     One space's WKWebView and everything WebKit asks of it
  SessionCache.swift     Keeps recent sessions alive, releases old ones
  WebsiteData.swift      Erasing and clearing data stores, and finishing deletions after a relaunch
  LockState.swift        Face ID, Touch ID and passcode locks
  Alerts.swift           Local notifications for unread counts
  OpenSpaceIntent.swift  The Shortcuts action
  SpaceListView.swift    The list, rows and tiles
  SpaceForm.swift        Adding and editing a space
  SpaceView.swift        A space on screen, its menu, lock screen and popups
  Backstage.swift        Where spaces that aren't showing keep running
  PrivacyCover.swift     The cover over a locked space in the app switcher
  WebAddress.swift       Turning typed text into an address, same-site checks
  Navigator.swift        Which space is open, so Shortcuts and alerts can open one
AltsTests/               Unit tests, isolation and off-screen tests, the site probe
AltsUITests/             UI tests
Design/                  SVG sources for the app icon
```
