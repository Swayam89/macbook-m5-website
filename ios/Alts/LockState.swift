import LocalAuthentication
import Observation

/// Which locked spaces are open right now. Everything locks again when the app goes to the background.
@MainActor
@Observable
final class LockState {
    private(set) var unlocked: Set<UUID> = []
    /// True while Alts is asking for Face ID, Touch ID or the passcode. The prompt makes the app
    /// inactive, and that is no reason to cover the screen.
    @ObservationIgnored private(set) var isAuthenticating = false

    /// False when the device has no passcode, in which case there is nothing to lock with.
    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// "Face ID", "Touch ID" or "Optic ID" when it is set up and allowed for Alts, otherwise "Passcode".
    var methodName: String {
        let context = LAContext()
        var error: NSError?
        let canUseBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        // A lockout still means biometrics are set up, so keep the name instead of flickering to Passcode.
        let lockedOut = (error as? LAError)?.code == .biometryLockout
        guard canUseBiometrics || lockedOut else { return "Passcode" }
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Passcode"
        }
    }

    func isUnlocked(_ space: Space) -> Bool {
        !space.requiresUnlock || unlocked.contains(space.id)
    }

    func unlock(_ space: Space) async {
        if await authenticate(reason: "Unlock \(space.name)") {
            unlocked.insert(space.id)
        }
    }

    /// For a space that was just locked from inside it: it stays open until the app leaves the screen.
    func markUnlocked(_ space: Space) {
        unlocked.insert(space.id)
    }

    /// Asks for Face ID, Touch ID or the passcode before something that changes or removes a
    /// locked space. Spaces that aren't locked, or are open right now, pass straight through.
    func confirm(_ space: Space, reason: String) async -> Bool {
        guard !isUnlocked(space) else { return true }
        guard await authenticate(reason: reason) else { return false }
        // Asked once; the space stays open until Alts leaves the screen.
        unlocked.insert(space.id)
        return true
    }

    /// Asks for Face ID, Touch ID or the passcode. With no passcode set there is nothing to check against, so it passes.
    func authenticate(reason: String) async -> Bool {
        if LaunchMode.passesAuthentication { return true }
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return true }
        isAuthenticating = true
        defer { isAuthenticating = false }
        do {
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch {
            return false
        }
    }

    func lockAll() {
        unlocked.removeAll()
    }
}
