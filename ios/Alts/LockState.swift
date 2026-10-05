import LocalAuthentication
import Observation

/// Which locked spaces are open right now. Everything locks again when the app goes to the background.
@MainActor
@Observable
final class LockState {
    private(set) var unlocked: Set<UUID> = []

    /// False when the device has no passcode, in which case there is nothing to lock with.
    var isAvailable: Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    /// "Face ID", "Touch ID", "Optic ID", or "Passcode" on devices without biometrics.
    var methodName: String {
        let context = LAContext()
        _ = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
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

    /// Asks for Face ID, Touch ID or the passcode. With no passcode set there is nothing to check against, so it passes.
    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return true }
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
