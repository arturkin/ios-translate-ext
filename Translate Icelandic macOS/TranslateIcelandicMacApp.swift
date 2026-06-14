//  TranslateIcelandicMacApp.swift
//  Minimal macOS host app. Its only job is to let you enable the Safari extension
//  and jump to Safari's settings — the extension itself (shared verbatim with the
//  iOS target: same Resources/ web code + same Swift handler/services) does all the
//  translation, look-up and page-translate work.
//
//  This host has no key-entry UI by design (the "minimal enabler" choice): the
//  macOS extension reads its Azure key from the baked-in Config/Secrets.xcconfig
//  (via Info.plist), and the popup toggles drive the rest. If you ever want in-app
//  settings on Mac, reuse the iOS SettingsView here behind an App Group.

import SwiftUI
import SafariServices

// Must match the macOS extension target's PRODUCT_BUNDLE_IDENTIFIER.
private let extensionBundleID = "arturkin.Translate-Icelandic.mac.Extension"

@main
struct TranslateIcelandicMacApp: App {
    var body: some Scene {
        WindowGroup("Translate Icelandic") {
            EnablerView()
                .frame(width: 460, height: 300)
        }
    }
}

struct EnablerView: View {
    @State private var status = "Checking…"

    var body: some View {
        VStack(spacing: 16) {
            Text("Translate Icelandic")
                .font(.title).bold()
            Text("Icelandic → English for Safari. Enable the extension below, then turn it on for the sites you read.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Text(status)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Open Safari Extension Settings…") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleID) { _ in }
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(32)
        .onAppear(perform: refresh)
    }

    private func refresh() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleID) { state, _ in
            DispatchQueue.main.async {
                guard let state else {
                    status = "Open Safari settings to find and enable the extension."
                    return
                }
                status = state.isEnabled
                    ? "Extension is ON in Safari. Open an Icelandic page and hold a word to look it up."
                    : "Extension is installed but OFF — enable it in Safari, then allow it on the sites you read."
            }
        }
    }
}
