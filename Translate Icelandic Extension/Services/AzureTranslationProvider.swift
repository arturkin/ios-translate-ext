//
//  AzureTranslationProvider.swift
//  Translate Icelandic Extension
//
//  Default backend: Azure AI Translator (Text Translation v3.0).
//  Free F0 tier covers 2M characters/month, which is plenty for personal reading.
//  Docs: https://learn.microsoft.com/azure/ai-services/translator/
//

import Foundation

struct AzureTranslationProvider: TranslationProvider {
    let key: String
    let region: String?

    private static let endpoint = "https://api.cognitive.microsofttranslator.com/translate"

    func translate(_ texts: [String], from: String, to: String) async throws -> [String] {
        guard !texts.isEmpty else { return [] }

        var comps = URLComponents(string: Self.endpoint)!
        comps.queryItems = [
            URLQueryItem(name: "api-version", value: "3.0"),
            URLQueryItem(name: "from", value: from),
            URLQueryItem(name: "to", value: to),
        ]

        var req = URLRequest(url: comps.url!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(key, forHTTPHeaderField: "Ocp-Apim-Subscription-Key")
        if let region, !region.isEmpty {
            req.setValue(region, forHTTPHeaderField: "Ocp-Apim-Subscription-Region")
        }
        req.timeoutInterval = 15
        req.httpBody = try JSONSerialization.data(withJSONObject: texts.map { ["Text": $0] })

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw TranslationError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401 || http.statusCode == 403 {
                throw TranslationError.http(http.statusCode, "check your Azure key and region")
            }
            throw TranslationError.http(http.statusCode, String(data: data, encoding: .utf8) ?? "")
        }

        // [ { "translations": [ { "text": "...", "to": "en" } ] }, ... ]
        guard let arr = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            throw TranslationError.badResponse
        }
        return arr.map { item in
            let translations = item["translations"] as? [[String: Any]]
            return (translations?.first?["text"] as? String) ?? ""
        }
    }
}
