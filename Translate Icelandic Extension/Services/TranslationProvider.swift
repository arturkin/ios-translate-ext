//
//  TranslationProvider.swift
//  Translate Icelandic Extension
//
//  The pluggable translation seam. Add a new backend by conforming to this
//  protocol and wiring it up in MessageRouter.translate(_:).
//

import Foundation

protocol TranslationProvider: Sendable {
    /// Translate `texts` and return results aligned to the input order.
    func translate(_ texts: [String], from: String, to: String) async throws -> [String]
}

enum TranslationError: LocalizedError {
    case notConfigured
    case http(Int, String)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "Translation backend is not configured."
        case .http(let code, let body):
            let detail = body.isEmpty ? "" : ": \(body.prefix(200))"
            return "Translation service returned HTTP \(code)\(detail)"
        case .badResponse:
            return "Unexpected response from the translation service."
        }
    }
}
