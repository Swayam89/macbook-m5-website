import Foundation
import Observation

/// The navigation path, shared so App Intents and notification taps can open a space.
@MainActor
@Observable
final class Navigator {
    static let shared = Navigator()

    var path: [UUID] = []

    func show(_ id: UUID) {
        path = [id]
    }

    func close(_ id: UUID) {
        path.removeAll { $0 == id }
    }
}
