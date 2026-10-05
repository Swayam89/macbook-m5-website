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

    @State private var service: Service = .whatsApp
    @State private var name = ""
    @State private var address = ""
    @State private var tint: Tint = Tint.allCases.randomElement() ?? .graphite
    @State private var requiresUnlock = false
    @State private var desktopSite = Service.whatsApp.prefersDesktopSite
    @State private var alertsWhileOpen = false
    @State private var alertsDenied = false
    @State private var confirmingClear = false
    @State private var confirmingDelete = false
    @State private var isSaving = false

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
        original?.name ?? store.suggestedName(for: service)
    }

    private var canSave: Bool {
        !isSaving && (service != .custom || WebAddress.url(from: address) != nil)
    }

    var body: some View {
        NavigationStack {
            Form {
                if original == nil {
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
                        if let caveat = service.caveat {
                            Text(caveat)
                        }
                    }
                }

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
                        Button("Delete Space", role: .destructive) {
                            confirmingDelete = true
                        }
                    } footer: {
                        Text("Clearing signs \(original.name) out and keeps the space. Deleting removes both.")
                    }
                }
            }
            .navigationTitle(original == nil ? "New Space" : "Edit Space")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(original == nil ? "Add" : "Done") {
                        Task { await save() }
                    }
                    .disabled(!canSave)
                }
            }
            .onChange(of: service) { _, newService in
                desktopSite = newService.prefersDesktopSite
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
                    guard let original else { return }
                    Task {
                        await sessions.clearData(for: original)
                        dismiss()
                    }
                }
            } message: {
                Text("You'll be signed out of \(original?.siteName ?? "the site") in this space.")
            }
            .confirmationDialog("Delete this space?", isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Delete Space", role: .destructive) {
                    guard let original else { return }
                    navigator.close(original.id)
                    sessions.erase(original.id)
                    store.remove(id: original.id)
                    dismiss()
                }
            } message: {
                Text("This signs you out and erases everything the site saved in this space.")
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
            Text("Alerts While Open tells you when this space has new unread items while Alts is open. iOS doesn't let it check in the background.")
        }
    }

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
        store.update(space)
        dismiss()
    }
}

struct TintPicker: View {
    @Binding var selection: Tint

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 44), spacing: 4)], spacing: 4) {
            ForEach(Tint.allCases, id: \.self) { tint in
                Button {
                    selection = tint
                } label: {
                    Circle()
                        .fill(tint.color)
                        .frame(width: 30, height: 30)
                        .overlay {
                            if tint == selection {
                                Image(systemName: "checkmark")
                                    .font(.footnote.bold())
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(width: 44, height: 44)
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
