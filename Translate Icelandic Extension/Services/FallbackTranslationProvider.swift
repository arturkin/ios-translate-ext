//
//  FallbackTranslationProvider.swift
//  Translate Icelandic Extension
//
//  Zero-config backend used when no Azure key is set, so the extension works the
//  moment it's installed. MyMemory is free and keyless but rate-limited and lower
//  quality, so we translate sequentially (one short request per text) to stay
//  within its anonymous limits. Set an Azure key for real reading volume.
//

import Foundation

struct FallbackTranslationProvider: TranslationProvider {
    private static let endpoint = "https://api.mymemory.translated.net/get"

    func translate(_ texts: [String], from: String, to: String) async throws -> [String] {
        let langPair = "\(from)|\(to)"
        var out: [String] = []
        out.reserveCapacity(texts.count)
        var anySucceeded = false
        var lastError: Error?
        for text in texts {
            do {
                out.append(try await translateOne(text, langPair: langPair))
                anySucceeded = true
            } catch {
                // Keep the source text for this item so a single failure (e.g. a
                // MyMemory rate-limit) doesn't discard the rest of the batch. The
                // caller skips source==translation results, so they retry later.
                out.append(text)
                lastError = error
            }
        }
        // If nothing translated at all, surface the error so the user sees a toast.
        if !anySucceeded, let lastError, !texts.isEmpty { throw lastError }
        return out
    }

    private func translateOne(_ text: String, langPair: String) async throws -> String {
        guard !text.isEmpty else { return "" }
        var comps = URLComponents(string: Self.endpoint)!
        comps.queryItems = [
            URLQueryItem(name: "q", value: text),
            URLQueryItem(name: "langpair", value: langPair),
        ]
        let (data, resp) = try await URLSession.shared.data(from: comps.url!)
        guard let http = resp as? HTTPURLResponse else { throw TranslationError.badResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw TranslationError.http(http.statusCode, "")
        }
        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let rd = obj["responseData"] as? [String: Any],
              let translated = rd["translatedText"] as? String else {
            throw TranslationError.badResponse
        }
        return translated
    }
}
