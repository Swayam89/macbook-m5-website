import SwiftUI

/// Adding a space, or editing one. The site can't change after a space is created, since its data belongs to that site.
struct SpaceForm: View {
    enum Mode {
        case add
        case edit(Space)
    }

    let mode: Mode

    @Environment(SpaceStore.self) private var store
    @Environment(SessionCache.self) private var sessions
    @Environment(LockState.self) private var locks
    @Environment(Navigator.self) private var navigator
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.scenePhase) private var scenePhase

    @State private var service: Service = .whatsApp
    @State private var name = ""
    @State private var address = ""
    @State private var tint: Tint = Tint.allCases.randomElement() ?? .graphite
    @State private var requiresUnlock = false
    @State private var desktopSite = Service.whatsApp.prefersDesktopSite
    @State private var alertsWhileOpen = false
    @State private var alertsDenied = false
    @State private var dataCleared = false
    @State private var confirmingClear = false
    @State private var confirmingDelete = false
    @State private var confirmingDiscard = false
    @State private var isSaving = false
    /// The values the form opened with, to tell whether anything changed.
    @State private var initial: [String] = []

    init(mode: Mode) {
        self.mode = mode
        if case .edit(let space) = mode {
            _service = State(initialValue: space.service)
            _name = State(initialValue: space.name)
            _address = State(initialValue: space.customURL?.absoluteString ?? "")
            _tint = State(initialValue: space.tint)
            _requiresUnlock = State(initialValue: space.requiresUnlock)
            _desktopSite = State(initialValue: space.desktopSite)
            _alertsWhileOpen = State(initialValue: space.alertsWhileOpen)
        }
    }

    private var original: Space? {
        if case .edit(let space) = mode { space } else { nil }
    }

    private var suggestedName: String {
        original?.name ?? store.suggestedName(for: service, address: WebAddress.url(from: address))
    }

    private var addressIsInvalid: Bool {
        service == .custom && WebAddress.url(from: address) == nil
    }

    private var canSave: Bool {
        !isSaving && !addressIsInvalid
    }

    private var snapshot: [String] {
        [service.rawValue, name, address, tint.rawValue, "\(requiresUnlock)", "\(desktopSite)", "\(alertsWhileOpen)"]
    }

    private var hasChanges: Bool {
        !initial.isEmpty && snapshot != initial
    }

    var body: some View {
        NavigationStack {
            Form {
                siteSection

                Section("Name") {
                    TextField("Name", text: $name, prompt: Text(suggestedName))
                        .accessibilityIdentifier("name-field")
                }

                Section("Color") {
                    TintPicker(selection: $tint)
                }

                Section {
                    Toggle("Require \(locks.methodName)", isOn: $requiresUnlock)
                        .disabled(!locks.isAvailable)
                    Toggle("Desktop Site", isOn: $desktopSite)
                    Toggle("Alerts While Open", isOn: $alertsWhileOpen)
                } footer: {
                    optionsFooter
                }

                if let original {
                    Section {
                        Button("Clear Website Data") {
                            confirmingClear = true
                        }
                        .disabled(dataCleared)
                        Button("Delete Space", role: .destructive) {
                            confirmingDelete = true
                        }
                    } footer: {
                        if dataCleared {
                            Text("Signed out. \(original.name) opens on its home page next time.")
                        } else {
                            Text("Clear Website Data signs you out of \(original.siteName) but keeps the space. Delete Space removes both.")
                        }
                    }
                }
            }
            .navigationTitle(original == nil ? "New Space" : "Edit Space")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(hasChanges)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        if hasChanges {
                            confirmingDiscard = true
                        } else {
                            dismiss()
                        }
                    }
                    .confirmationDialog("Discard your changes?", isPresented: $confirmingDiscard) {
                        Button("Discard Changes", role: .destructive) {
                            dismiss()
                        }
                        Button("Keep Editing", role: .cancel) {}
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(original == nil ? "Add" : "Done") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .onAppear {
                if initial.isEmpty {
                    initial = snapshot
                }
            }
            .onChange(of: service) { _, newService in
                desktopSite = newService.prefersDesktopSite
            }
            .onChange(of: scenePhase) { _, phase in
                // A locked space's settings close when Alts leaves the screen, like the space itself.
                if phase == .background, original?.requiresUnlock == true {
                    dismiss()
                }
            }
            .onChange(of: alertsWhileOpen) { _, isOn in
                guard isOn else { return }
                Task {
                    let granted = await Alerts.requestPermission()
                    if !granted {
                        alertsWhileOpen = false
                        alertsDenied = true
                    }
                }
            }
            .confirmationDialog("Clear website data?", isPresented: $confirmingClear, titleVisibility: .visible) {
                Button("Clear Data", role: .destructive) {
                    Task { await clearData() }
                }
            } message: {
                Text("You'll be signed out of \(original?.siteName ?? "the site") in this space.")
            }
            .confirmationDialog(
                "Delete \u{201C}\(original?.name ?? "")\u{201D}?",
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button("Delete Space", role: .destructive) {
                    Task { await delete() }
                }
            } message: {
                Text("This signs you out and erases everything the site saved in this space.")
            }
        }
    }

    @ViewBuilder
    private var siteSection: some View {
        if let original {
            Section {
                LabeledContent("Site", value: original.startURL?.host() ?? original.siteName)
            } footer: {
                Text("The site can't be changed after a space is created, because its sign-in belongs to that site.")
            }
        } else {
            Section {
                Picker("Site", selection: $service) {
                    ForEach(Service.allCases) { service in
                        Text(service.displayName).tag(service)
                    }
                }
                .pickerStyle(.navigationLink)
                .accessibilityIdentifier("site-picker")

                if service == .custom {
                    TextField("Address", text: $address, prompt: Text("example.com"))
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("address-field")
                }
            } footer: {
                if service == .custom && !address.isEmpty && addressIsInvalid {
                    Text("Enter a web address, like example.com.")
                } else if let caveat = service.caveat {
                    Text(caveat)
                }
            }
        }
    }

    @ViewBuilder
    private var optionsFooter: some View {
        if alertsDenied {
            VStack(alignment: .leading, spacing: 6) {
                Text("Notifications are turned off for Alts.")
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        openURL(url)
                    }
                }
                .font(.footnote)
            }
        } else if !locks.isAvailable {
            Text("To lock a space, set a passcode in Settings first.")
        } else {
            Text(Self.alertsExplanation)
        }
    }

    static let alertsExplanation = "Alerts While Open tells you when this space has new unread items while you're using Alts, including in another space. Locked spaces only check after you unlock them. iOS doesn't let Alts check once you leave it."

    private func save() async {
        isSaving = true
        defer { isSaving = false }

        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalName = trimmed.isEmpty ? suggestedName : trimmed

        guard let original else {
            let space = Space(
                name: finalName,
                service: service,
                customURL: service == .custom ? WebAddress.url(from: address) : nil,
                tint: tint,
                requiresUnlock: requiresUnlock,
                desktopSite: desktopSite,
                alertsWhileOpen: alertsWhileOpen
            )
            store.add(space)
            dismiss()
            return
        }

        // Turning a lock off needs the same check as opening the space.
        if original.requiresUnlock && !requiresUnlock {
            guard await locks.authenticate(reason: "Turn off the lock for \(original.name)") else { return }
        }

        var space = original
        space.name = finalName
        space.tint = tint
        space.requiresUnlock = requiresUnlock
        space.desktopSite = desktopSite
        space.alertsWhileOpen = alertsWhileOpen
        if !original.requiresUnlock && requiresUnlock && navigator.path.last == original.id {
            // Locking a space from inside it shouldn't throw you out of it. It locks when you leave Alts.
            locks.markUnlocked(space)
        }
        store.update(space)
        dismiss()
    }

    private func clearData() async {
        guard let original, await locks.confirm(original, reason: "Clear website data for \(original.name)") else { return }
        await sessions.clearData(for: original)
        dataCleared = true
    }

    private func delete() async {
        guard let original, await locks.confirm(original, reason: "Delete \(original.name)") else { return }
        navigator.close(original.id)
        sessions.erase(original.id)
        store.remove(id: original.id)
        dismiss()
    }
}

struct TintPicker: View {
    @Binding var selection: Tint

    var body: some View {
        // Two rows of four keeps every swatch at least 44 points wide on the smallest iPhone.
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 4), spacing: 4) {
            ForEach(Tint.allCases, id: \.self) { tint in
                Button {
                    selection = tint
                } label: {
                    Circle()
                        .fill(tint.color)
                        .strokeBorder(Color.primary.opacity(0.15), lineWidth: 1)
                        .frame(width: 32, height: 32)
                        .overlay {
                            if tint == selection {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tint.name)
                .accessibilityAddTraits(tint == selection ? .isSelected : [])
            }
        }
        .padding(.vertical, 2)
    }
}
