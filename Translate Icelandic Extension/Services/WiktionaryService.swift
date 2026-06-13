//
//  WiktionaryService.swift
//  Translate Icelandic Extension
//
//  Looks up the English-language definition of an Icelandic word via Wiktionary's
//  REST definition endpoint. Tapped words are usually inflected (e.g. "hússins"),
//  which won't have their own page, so on a miss we resolve the lemma through BÍN
//  and try again.
//

import Foundation

enum WiktionaryService {
    private static let userAgent = "TranslateIcelandic/1.0 (personal Safari extension)"

    static func define(_ word: String) async throws -> [String: Any] {
        let trimmed = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return ["ok": true, "entries": [[String: Any]](), "sourceUrl": ""] }

        var term = trimmed
        var entries = try await fetchEntries(term)

        if entries.isEmpty, trimmed != trimmed.lowercased() {
            term = trimmed.lowercased()
            entries = try await fetchEntries(term)
        }
        if entries.isEmpty,
           let lemma = await InflectionService.lemma(trimmed),
           lemma.lowercased() != trimmed.lowercased() {
            term = lemma
            entries = try await fetchEntries(term)
            if entries.isEmpty, lemma != lemma.lowercased() {
                term = lemma.lowercased()
                entries = try await fetchEntries(term)
            }
        }
        // No link when nothing matched, so the UI doesn't offer a dead 404 link.
        return ["ok": true, "entries": entries, "sourceUrl": entries.isEmpty ? "" : pageURL(term)]
    }

    private static func fetchEntries(_ term: String) async throws -> [[String: Any]] {
        let enc = term.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? term
        guard let url = URL(string: "https://en.wiktionary.org/api/rest_v1/page/definition/\(enc)") else { return [] }
        var req = URLRequest(url: url)
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")
        req.timeoutInterval = 12

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw TranslationError.badResponse }
        if http.statusCode == 404 { return [] }
        guard (200..<300).contains(http.statusCode) else { throw TranslationError.http(http.statusCode, "") }

        guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let isArr = obj["is"] as? [[String: Any]] else {
            return [] // no Icelandic section on this page
        }
        var out: [[String: Any]] = []
        for entry in isArr {
            let pos = entry["partOfSpeech"] as? String ?? ""
            let defs = (entry["definitions"] as? [[String: Any]])?.compactMap { d -> String? in
                guard let raw = d["definition"] as? String else { return nil }
                let clean = stripHTML(raw)
                return clean.isEmpty ? nil : clean
            } ?? []
            if !defs.isEmpty { out.append(["partOfSpeech": pos, "definitions": defs]) }
        }
        return out
    }

    private static func pageURL(_ term: String) -> String {
        let enc = term.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? term
        return "https://en.wiktionary.org/wiki/\(enc)#Icelandic"
    }

    private static func stripHTML(_ s: String) -> String {
        var t = s
        // Drop <style>/<script> blocks entirely — Wiktionary inlines template CSS
        // (e.g. ".mw-parser-output .object-usage-tag{...}") that would otherwise
        // leak into the definition text once the surrounding tags are removed.
        t = t.replacingOccurrences(of: "(?is)<(style|script)[^>]*>.*?</\\1\\s*>",
                                   with: "", options: .regularExpression)
        t = t.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        let entities = ["&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " "]
        for (k, v) in entities { t = t.replacingOccurrences(of: k, with: v) }
        // Collapse the whitespace the removed markup leaves behind.
        t = t.replacingOccurrences(of: "[ \\t\\n\\r]+", with: " ", options: .regularExpression)
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
