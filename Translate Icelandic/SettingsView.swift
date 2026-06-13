//
//  SettingsView.swift
//  Translate Icelandic
//
//  The host app is a small control panel: it stores the translation backend
//  settings (shared with the extension via the App Group) and explains how to
//  turn the extension on. The actual translating happens inside Safari.
//

import SwiftUI

struct SettingsView: View {
    @State private var provider = SharedStore.provider
    @State private var apiKey = SharedStore.azureKey ?? ""
    @State private var region = SharedStore.azureRegion ?? ""
    @State private var tapToTranslate = SharedStore.tapToTranslate
    @State private var autoTranslate = SharedStore.autoTranslate
    @State private var useWiktionary = SharedStore.useWiktionary
    @State private var useBin = SharedStore.useBin

    @State private var testing = false
    @State private var testResult: String?
    @State private var saved = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Translation backend") {
                    Picker("Provider", selection: $provider) {
                        Text("Azure Translator").tag("azure")
                        Text("Free (MyMemory)").tag("free")
                    }
                    if provider == "azure" {
                        SecureField("Azure subscription key", text: $apiKey)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Region (e.g. westeurope)", text: $region)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button(testing ? "Testing…" : "Test connection") {
                            Task { await testConnection() }
                        }
                        .disabled(testing || apiKey.trimmingCharacters(in: .whitespaces).isEmpty)
                        if let testResult {
                            Text(testResult).font(.footnote).foregroundStyle(.secondary)
                        }
                    } else {
                        Text("MyMemory is free and keyless but rate-limited and lower quality. Add an Azure key for real reading volume.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }

                Section("Reading & learning") {
                    Toggle("Tap a word to look it up", isOn: $tapToTranslate)
                    Toggle("Auto-translate Icelandic pages", isOn: $autoTranslate)
                    Toggle("Show Wiktionary definitions", isOn: $useWiktionary)
                    Toggle("Show BÍN inflections", isOn: $useBin)
                }

                Section("Enable the extension") {
                    Text("""
                    1. Open Settings → Apps → Safari → Extensions.
                    2. Turn on “Translate Icelandic”.
                    3. Set permission to Allow on Every Website.
                    """)
                    .font(.footnote)
                }

                Section {
                    Text("Personal use only. Text you translate is sent to your chosen translation service; tapped words are also sent to Wiktionary and BÍN.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Translate Icelandic")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(saved ? "Saved ✓" : "Save") { save() }
                }
            }
            // Persist every field as it changes so the extension picks it up and the
            // key can never be silently lost by forgetting to tap Save.
            .onChange(of: provider) { _, _ in save() }
            .onChange(of: apiKey) { _, _ in save() }
            .onChange(of: region) { _, _ in save() }
            .onChange(of: tapToTranslate) { _, _ in save() }
            .onChange(of: autoTranslate) { _, _ in save() }
            .onChange(of: useWiktionary) { _, _ in save() }
            .onChange(of: useBin) { _, _ in save() }
        }
    }

    private func save() {
        SharedStore.provider = provider
        SharedStore.azureKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        SharedStore.azureRegion = region.trimmingCharacters(in: .whitespacesAndNewlines)
        SharedStore.tapToTranslate = tapToTranslate
        SharedStore.autoTranslate = autoTranslate
        SharedStore.useWiktionary = useWiktionary
        SharedStore.useBin = useBin
        saved = true
    }

    private func testConnection() async {
        save()
        testing = true
        testResult = nil
        defer { testing = false }
        do {
            let out = try await translateHallo(
                key: apiKey.trimmingCharacters(in: .whitespacesAndNewlines),
                region: region.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            testResult = "✓ Halló → \(out)"
        } catch {
            testResult = "✗ \(error.localizedDescription)"
        }
    }

    /// Minimal Azure round-trip used only to validate the key/region from the UI.
    private func translateHallo(key: String, region: String) async throws -> String {
        var comps = URLComponents(string: "https://api.cognitive.microsofttranslator.com/translate")!
        comps.queryItems = [
            URLQueryItem(name: "api-version", value: "3.0"),
            URLQueryItem(name: "from", value: "is"),
            URLQueryItem(name: "to", value: "en"),
        ]
        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "Ocp-Apim-Subscription-Key")
        if !region.isEmpty {
            req.setValue(region, forHTTPHeaderField: "Ocp-Apim-Subscription-Region")
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: [["Text": "Halló"]])

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw NSError(domain: "Azure", code: -1, userInfo: [NSLocalizedDescriptionKey: "No response"])
        }
        guard (200..<300).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "Azure", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: "HTTP \(http.statusCode) \(body.prefix(160))"])
        }
        guard let arr = try JSONSerialization.jsonObject(with: data) as? [[String: Any]],
              let text = (arr.first?["translations"] as? [[String: Any]])?.first?["text"] as? String else {
            throw NSError(domain: "Azure", code: -2, userInfo: [NSLocalizedDescriptionKey: "Unexpected response"])
        }
        return text
    }
}

#Preview {
    SettingsView()
}
