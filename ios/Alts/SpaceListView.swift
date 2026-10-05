import SwiftUI

struct SpaceListView: View {
    @Environment(SpaceStore.self) private var store
    @Environment(SessionCache.self) private var sessions
    @State private var isAdding = false
    @State private var editing: Space?
    @State private var deleting: Space?

    var body: some View {
        List {
            ForEach(store.spaces) { space in
                NavigationLink(value: space.id) {
                    SpaceRow(space: space, unreadCount: sessions.existingSession(for: space.id)?.unreadCount)
                }
                .swipeActions {
                    Button("Delete", systemImage: "trash") {
                        deleting = space
                    }
                    .tint(.red)
                    Button("Edit", systemImage: "slider.horizontal.3") {
                        editing = space
                    }
                }
                .contextMenu {
                    Button("Edit Space", systemImage: "slider.horizontal.3") {
                        editing = space
                    }
                    Button("Delete", systemImage: "trash", role: .destructive) {
                        deleting = space
                    }
                }
            }
            .onMove { store.move(fromOffsets: $0, toOffset: $1) }
        }
        .overlay {
            if store.spaces.isEmpty {
                ContentUnavailableView {
                    Label("No Spaces", systemImage: "square.on.square")
                } description: {
                    Text("A space is a separate, signed-in copy of a site. Add one for each account you want to keep open.")
                } actions: {
                    Button("Add Space") {
                        isAdding = true
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Spaces")
        .toolbar {
            if !store.spaces.isEmpty {
                ToolbarItem(placement: .topBarLeading) {
                    EditButton()
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Add Space", systemImage: "plus") {
                    isAdding = true
                }
            }
        }
        .sheet(isPresented: $isAdding) {
            SpaceForm(mode: .add)
        }
        .sheet(item: $editing) { space in
            SpaceForm(mode: .edit(space))
        }
        .confirmationDialog(
            "Delete \u{201C}\(deleting?.name ?? "")\u{201D}?",
            isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }),
            titleVisibility: .visible,
            presenting: deleting
        ) { space in
            Button("Delete Space", role: .destructive) {
                sessions.erase(space.id)
                store.remove(id: space.id)
            }
        } message: { _ in
            Text("This signs you out and erases everything the site saved in this space.")
        }
    }
}

struct SpaceRow: View {
    let space: Space
    let unreadCount: Int?

    var body: some View {
        HStack(spacing: 12) {
            SpaceTile(space: space)
            VStack(alignment: .leading, spacing: 2) {
                Text(space.name)
                HStack(spacing: 4) {
                    if space.requiresUnlock {
                        Image(systemName: "lock.fill")
                            .imageScale(.small)
                    }
                    Text(space.siteName)
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if let unreadCount, unreadCount > 0 {
                Text(unreadCount, format: .number)
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(Color(.systemBackground))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 1)
                    .background(.tint, in: .capsule)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        var parts = [space.name, space.siteName]
        if space.requiresUnlock { parts.append("Locked") }
        if let unreadCount, unreadCount > 0 { parts.append("\(unreadCount) unread") }
        return parts.joined(separator: ", ")
    }
}

/// The square with a space's initials. Spaces never show a service's own logo.
struct SpaceTile: View {
    let space: Space
    @ScaledMetric private var size: CGFloat

    init(space: Space, size: CGFloat = 40) {
        self.space = space
        _size = ScaledMetric(wrappedValue: size, relativeTo: .body)
    }

    var body: some View {
        Text(space.monogram)
            .font(.system(size: size * 0.4, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(space.tint.color, in: .rect(cornerRadius: size * 0.26, style: .continuous))
            .accessibilityHidden(true)
    }
}

extension Tint {
    var color: Color {
        switch self {
        case .graphite: Color(red: 0.36, green: 0.37, blue: 0.40)
        case .moss: Color(red: 0.37, green: 0.48, blue: 0.23)
        case .brick: Color(red: 0.71, green: 0.28, blue: 0.18)
        case .ochre: Color(red: 0.62, green: 0.43, blue: 0.08)
        case .harbor: Color(red: 0.18, green: 0.42, blue: 0.55)
        case .plum: Color(red: 0.48, green: 0.28, blue: 0.44)
        case .clay: Color(red: 0.61, green: 0.39, blue: 0.28)
        case .pine: Color(red: 0.18, green: 0.42, blue: 0.33)
        }
    }
}
