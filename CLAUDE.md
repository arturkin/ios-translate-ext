# CLAUDE.md

Guidance for working in this repository.

## What this is

A personal-use **Safari Web Extension (iOS 18+)** that translates Icelandic → English on web
pages and offers a tap-a-word "Look Up" (gloss + Wiktionary + BÍN inflections). Manifest V3,
built from Xcode's Safari Extension App template. **Personal use only** — no App Store goals,
keep it minimal.

## Layout

```
Translate Icelandic/                     Host app (SwiftUI settings + onboarding)
  SettingsView.swift                     Key/region entry, toggles, "Test connection"
  SceneDelegate.swift                    Programmatic window → UIHostingController(SettingsView)
  SharedStore.swift                      App Group settings  ⚠️ MIRRORED (see below)
  TranslateIcelandic.entitlements        App Group

Translate Icelandic Extension/
  SafariWebExtensionHandler.swift        Native bridge (async); parses {type,payload}
  MessageRouter.swift                    Dispatch → services; returns {ok, ...}
  Services/TranslationProvider.swift     Pluggable backend protocol + errors
  Services/AzureTranslationProvider.swift   Default backend (Azure Translator v3)
  Services/FallbackTranslationProvider.swift Keyless fallback (MyMemory), sequential
  Services/WiktionaryService.swift       Definitions; lemma fallback for inflected forms
  Services/InflectionService.swift       BÍN inflections via ylhyra.is (search → id)
  Shared/SharedStore.swift               App Group settings  ⚠️ MIRRORED (see below)
  TranslateIcelandicExtension.entitlements  App Group
  Resources/                             Web extension (FLAT — see "Resource layout")
    manifest.json
    messaging.js icelandic.js ui.js pageTranslator.js wordLookup.js content.js  (content scripts, in order)
    background.js                        Service worker: router + cache + native bridge
    popup.html/js/css                    Toolbar quick toggles + backend status
    images/  _locales/                   Folder references (preserved verbatim)
```

## How it fits together

- Content scripts share one isolated world; each file is an IIFE that exposes its API on
  `window.__TI__` (`TI.bg`, `TI.ice`, `TI.ui`, `TI.page`, `TI.word`). `content.js` runs last and
  wires them up.
- **JS never holds the API key and never calls translation/dictionary APIs directly.** Content
  scripts message `background.js`; only the background calls the native handler via
  `browser.runtime.sendNativeMessage`; only the native side (Swift) reads the key and makes
  network requests. This keeps the secret in the App Group and avoids CORS.
- **Message protocol** (`{ type, payload }` → `{ ok, ... }`):
  - `translate` `{texts,from,to}` → `{ok, translations:[String]}`
  - `define` `{word}` → `{ok, entries:[{partOfSpeech, definitions:[String]}], sourceUrl}`
  - `inflect` `{word}` → `{ok, lemma, wordClass, forms:[{label, form}], sourceUrl}`
  - `status` → `{ok, provider, hasKey, region, useWiktionary, useBin, tapToTranslate, autoTranslate}`
  - On failure: `{ ok: false, error }` (JS rejects).
- **Caching** lives in `background.js`: translations are cached in `storage.local` (keyed by
  `from\nto\ntext`, capped, persisted); define/inflect are cached in memory per word.

## Conventions & gotchas

- **Settings storage:** App Group UserDefaults (`group.arturkin.Translate-Icelandic`), not the
  Keychain. Fine for a personal-use, low-value translator key; a shipping app should use the
  Keychain. The app writes; the extension reads.
- **Hard-coded key (env file):** `Config/Secrets.xcconfig` (gitignored; copy from
  `Config/Secrets.example.xcconfig`) feeds `AZURE_TRANSLATOR_KEY`/`AZURE_TRANSLATOR_REGION` into the
  extension's Info.plist (`$(…)`), which `MessageRouter.configuredKey/Region` read as a fallback.
  In-app settings take precedence. Public repo — never commit the real file. A fresh clone without
  it builds fine (the `$(…)` placeholder is guarded) and falls back to MyMemory.
- **`SharedStore.swift` is intentionally duplicated** in both targets and must be kept identical.
  Xcode 16 synchronized folder groups (`PBXFileSystemSynchronizedRootGroup`, objectVersion 77)
  can't share one file across targets without fragile project edits.
- **Synchronized project:** files added under a target folder are auto-included — usually no
  `project.pbxproj` editing needed. Swift files in subfolders compile fine.
- **Resource layout is FLAT.** Web resources in `Resources/` subfolders get path-flattened into
  the bundle (breaking `manifest.json` paths), so all JS/HTML/CSS live at `Resources/` root.
  Exceptions are `images/` and `_locales/`, which are folder references (`explicitFolders`).
- **Icelandic detection** (`icelandic.js`) is a heuristic to skip English and save quota
  (þ/ð/æ are strong signals; plus stopwords + accents). The API still does authoritative
  detection. Tune the word list there, not elsewhere.
- **Tap mode** intercepts plain-text taps only; taps on links/buttons/inputs pass through. It's
  off-limits to hijack navigation.
- After editing Swift, check LSP diagnostics; prefer LSP navigation over grep for code.

## Build & test

```sh
# Full QA harness: JS logic + config + live API contracts + build + unit tests
./scripts/qa.sh
./scripts/qa.sh --fast    # quick checks only (skip Xcode build/tests)

# Or directly:
# Compile app + extension for the simulator (no signing)
xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

# Unit tests (settings contract)
xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:"Translate IcelandicTests" test
```

QA harness: `scripts/qa.sh` (+ `scripts/qa/check_js.mjs`, `check_apis.py`). On-device checklist:
[`docs/QA.md`](docs/QA.md). The harness validates the Icelandic detector, JS syntax, config
validity, the live external-API contracts, the build, and unit tests without a device.

## External APIs

- **Azure Translator** v3 `POST /translate?api-version=3.0&from=is&to=en` — headers
  `Ocp-Apim-Subscription-Key`, `Ocp-Apim-Subscription-Region`. Free F0: 2M chars/month.
- **MyMemory** `GET /get?q=&langpair=is|en` — keyless fallback, rate-limited.
- **Wiktionary** `GET /api/rest_v1/page/definition/{word}` — Icelandic entries under `is`;
  send a descriptive `User-Agent`.
- **BÍN / ylhyra** `GET /api/inflection?search={word}` → lemma + `BIN_id`, then
  `?id={BIN_id}&type=flat` → full paradigm (one entry per form). Falls back to a BÍN page link.
