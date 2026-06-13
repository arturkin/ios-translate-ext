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
            case "define":    return try await WiktionaryService.define(word(payload))
            case "inflect":   return try await InflectionService.inflect(word(payload))
            case "status":    return status()
            default:          return ["ok": false, "error": "unknown message type: \(type)"]
            }
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    private static func word(_ p: [String: Any]) -> String { (p["word"] as? String) ?? "" }

    private static func translate(_ p: [String: Any]) async throws -> [String: Any] {
        let texts = (p["texts"] as? [String]) ?? []
        let from = (p["from"] as? String) ?? "is"
        let to = (p["to"] as? String) ?? "en"

        let provider: TranslationProvider
        if SharedStore.provider == "azure", let key = SharedStore.azureKey {
            provider = AzureTranslationProvider(key: key, region: SharedStore.azureRegion)
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
            "hasKey": SharedStore.azureKey != nil,
            "region": SharedStore.azureRegion ?? "",
            "useWiktionary": SharedStore.useWiktionary,
            "useBin": SharedStore.useBin,
            "tapToTranslate": SharedStore.tapToTranslate,
            "autoTranslate": SharedStore.autoTranslate,
        ]
    }
}
