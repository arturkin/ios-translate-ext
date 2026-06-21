//
//  MessageRouter.swift
//  Translate Icelandic Extension
//
//  Dispatches messages coming from the web extension's background worker to the
//  appropriate native service and returns a JSON-serializable response dictionary.
//  Every response carries an `ok` flag; on `false`, JS rejects with `error`.
//

import Foundation

enum MessageRouter {
    static func handle(type: String, payload: [String: Any]) async -> [String: Any] {
        do {
            switch type {
            case "translate": return try await translate(payload)
            case "inflect":   return try await InflectionService.inflect(word(payload))
            case "status":    return status()
            default:          return ["ok": false, "error": "unknown message type: \(type)"]
            }
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    private static func word(_ p: [String: Any]) -> String { (p["word"] as? String) ?? "" }

    /// A value baked in at build time via Config/Secrets.xcconfig → Info.plist.
    /// Returns nil when empty or left as an unexpanded `$(…)` placeholder. Tolerates
    /// accidental surrounding quotes in the xcconfig value.
    private static func infoValue(_ key: String) -> String? {
        var v = ((Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if v.count >= 2, v.hasPrefix("\""), v.hasSuffix("\"") {
            v = String(v.dropFirst().dropLast())
        }
        guard !v.isEmpty, !v.hasPrefix("$(") else { return nil }
        return v
    }

    /// In-app settings take precedence; otherwise fall back to the hard-coded build value.
    private static var configuredKey: String? { SharedStore.azureKey ?? infoValue("AzureKey") }
    private static var configuredRegion: String? { SharedStore.azureRegion ?? infoValue("AzureRegion") }

    private static func translate(_ p: [String: Any]) async throws -> [String: Any] {
        let texts = (p["texts"] as? [String]) ?? []
        let from = (p["from"] as? String) ?? "is"
        let to = (p["to"] as? String) ?? "en"

        let provider: TranslationProvider
        if SharedStore.provider == "azure", let key = configuredKey {
            provider = AzureTranslationProvider(key: key, region: configuredRegion)
        } else {
            provider = FallbackTranslationProvider()
        }

        let translations = try await provider.translate(texts, from: from, to: to)
        return ["ok": true, "translations": translations]
    }

    private static func status() -> [String: Any] {
        [
            "ok": true,
            "provider": SharedStore.provider,
            "hasKey": configuredKey != nil,
            "region": configuredRegion ?? "",
            "useWiktionary": SharedStore.useWiktionary,
            "useBin": SharedStore.useBin,
            "tapToTranslate": SharedStore.tapToTranslate,
            "autoTranslate": SharedStore.autoTranslate,
        ]
    }
}
