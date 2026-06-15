//
//  SharedStore.swift
//  Translate Icelandic
//
//  Settings shared between the host app (which writes them) and the Safari
//  extension (which reads them) via an App Group container.
//
//  ⚠️ MIRRORED FILE: identical copies live in both targets
//  ("Translate Icelandic/SharedStore.swift" and
//  "Translate Icelandic Extension/Shared/SharedStore.swift"). Two targets in a
//  synchronized Xcode project can't share one file without fragile project edits,
//  so we intentionally duplicate this small, stable file. Keep them identical.
//

import Foundation

enum SharedStore {
    /// App Group used to share settings between the app and the extension.
    static let appGroupID = "group.arturkin.Translate-Icelandic-ios"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupID) ?? .standard
    }

    enum Key {
        static let azureKey = "azureKey"
        static let azureRegion = "azureRegion"
        static let provider = "provider"            // "azure" | "free"
        static let useWiktionary = "useWiktionary"
        static let useBin = "useBin"
        static let tapToTranslate = "tapToTranslate"
        static let autoTranslate = "autoTranslate"
    }

    private static func boolOr(_ key: String, _ fallback: Bool) -> Bool {
        defaults.object(forKey: key) == nil ? fallback : defaults.bool(forKey: key)
    }

    private static func cleaned(_ key: String) -> String? {
        let v = defaults.string(forKey: key)?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (v?.isEmpty ?? true) ? nil : v
    }

    static var azureKey: String? {
        get { cleaned(Key.azureKey) }
        set { defaults.set(newValue, forKey: Key.azureKey) }
    }

    static var azureRegion: String? {
        get { cleaned(Key.azureRegion) }
        set { defaults.set(newValue, forKey: Key.azureRegion) }
    }

    static var provider: String {
        get { defaults.string(forKey: Key.provider) ?? "azure" }
        set { defaults.set(newValue, forKey: Key.provider) }
    }

    static var useWiktionary: Bool {
        get { boolOr(Key.useWiktionary, true) }
        set { defaults.set(newValue, forKey: Key.useWiktionary) }
    }

    static var useBin: Bool {
        get { boolOr(Key.useBin, true) }
        set { defaults.set(newValue, forKey: Key.useBin) }
    }

    static var tapToTranslate: Bool {
        get { boolOr(Key.tapToTranslate, true) }
        set { defaults.set(newValue, forKey: Key.tapToTranslate) }
    }

    static var autoTranslate: Bool {
        get { boolOr(Key.autoTranslate, false) }
        set { defaults.set(newValue, forKey: Key.autoTranslate) }
    }
}
