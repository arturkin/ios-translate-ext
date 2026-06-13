//
//  InflectionService.swift
//  Translate Icelandic Extension
//
//  Icelandic is heavily inflected, so for a learner the declension/conjugation
//  table is the most useful "Look Up" content. Data comes from BÍN (the Database
//  of Modern Icelandic Inflection) via the free ylhyra.is JSON API.
//
//  Two-step lookup: `search=<word>` resolves the lemma + BÍN id (works for any
//  inflected form); `id=<BIN_id>` returns the full paradigm. On failure we still
//  return a link to the BÍN web page so the user can see the table there.
//

import Foundation

enum InflectionService {
    private static let api = "https://ylhyra.is/api/inflection"
    private static let userAgent = "TranslateIcelandic/1.0 (personal Safari extension)"

    static func inflect(_ word: String) async throws -> [String: Any] {
        let trimmed = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ["ok": true, "lemma": "", "wordClass": "", "forms": [[String: String]](), "sourceUrl": ""]
        }

        let search = try await results(query: [("search", trimmed), ("type", "flat")])
        // Note: must test for NSNumber, not `!= nil` — a JSON `null` BIN_id decodes to
        // NSNull (which is non-nil), and would be selected over a later valid entry.
        guard let first = search.first(where: { ($0["BIN_id"] as? NSNumber) != nil }) else {
            return ["ok": true, "lemma": trimmed, "wordClass": "",
                    "forms": [[String: String]](), "sourceUrl": binURL(trimmed)]
        }

        let lemma = (first["base_word"] as? String) ?? trimmed
        let cats = (first["word_categories"] as? [Any])?.compactMap { $0 as? String } ?? []
        let wordClass = cats.joined(separator: " · ")

        var forms: [[String: String]] = []
        if let id = (first["BIN_id"] as? NSNumber)?.intValue {
            let all = try await results(query: [("id", "\(id)"), ("type", "flat")])
            var seen = Set<String>()
            for f in all {
                guard let form = f["inflectional_form"] as? String else { continue }
                let labelParts = (f["inflectional_form_categories"] as? [Any])?.compactMap { $0 as? String } ?? []
                let label = labelParts.joined(separator: " · ")
                let dedupeKey = label + "\u{1}" + form
                if seen.insert(dedupeKey).inserted {
                    forms.append(["label": label, "form": form])
                }
            }
        }
        return ["ok": true, "lemma": lemma, "wordClass": wordClass, "forms": forms, "sourceUrl": binURL(lemma)]
    }

    /// Best-effort lemma resolution for an inflected form; nil on any failure.
    static func lemma(_ word: String) async -> String? {
        let trimmed = word.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let search = try? await results(query: [("search", trimmed), ("type", "flat")])
        return search?.first(where: { $0["base_word"] != nil })?["base_word"] as? String
    }

    private static func results(query: [(String, String)]) async throws -> [[String: Any]] {
        var comps = URLComponents(string: api)!
        comps.queryItems = query.map { URLQueryItem(name: $0.0, value: $0.1) }
        guard let url = comps.url else { return [] }
        var req = URLRequest(url: url)
        req.setValue(userAgent, forHTTPHeaderField: "User-Agent")

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw TranslationError.badResponse
        }
        let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (obj?["results"] as? [[String: Any]]) ?? []
    }

    private static func binURL(_ word: String) -> String {
        let enc = word.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? word
        return "https://bin.arnastofnun.is/leit/\(enc)"
    }
}
