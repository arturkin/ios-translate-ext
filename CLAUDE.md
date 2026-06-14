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

chrome/                                  Desktop-Chrome build (Chromium: Edge/Brave/Opera too)
  src/manifest.json                      MV3; service_worker + host_permissions (no nativeMessaging)
  src/background.js                      Service worker: SAME router/cache as Safari; native() seam
                                           replaced by direct fetch() to the services below
  src/services/azure.js mymemory.js wiktionary.js inflection.js   JS ports of the Swift services
  src/services/settings.js               Baked-config + defaults → status response
  src/package.json                       {"type":"module"} for Node tooling only (not shipped)
  config.example.js                      Tracked template; copy to config.local.js (gitignored)
  vendor/browser-polyfill.min.js         Mozilla webextension-polyfill (MPL-2.0), vendored
  dist/                                  Build output (gitignored) — load this unpacked
scripts/build-chrome.mjs                 Assembles chrome/dist/ from Resources/ + chrome/src/
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

## Chrome build (the seam)

- **`background.js` is the only platform-specific file.** Content scripts, popup, detector, UI,
  `_locales`, icons, the message protocol, and the cache logic are **shared verbatim** with Safari —
  single-source in `Translate Icelandic Extension/Resources/`. The Chrome `background.js` is a
  structural copy of the Safari one with the `native()` seam (`sendNativeMessage` → Swift) swapped
  for direct `fetch()` to `chrome/src/services/*.js` (ports of the Swift services). Service workers
  may fetch cross-origin via `host_permissions` — no CORS, no native app.
- **Don't fork the content scripts.** Edit them in `Resources/` and rebuild; `scripts/build-chrome.mjs`
  copies them into `chrome/dist/`. The only build-time transform is injecting the polyfill `<script>`
  into `popup.html`.
- **`webextension-polyfill` is required**, not cosmetic: Chrome exposes `chrome.*` (not `browser.*`)
  and — unlike Safari — a Chrome `onMessage` listener that *returns a Promise* does **not** reply.
  The polyfill provides `browser.*` and the promise-returning-listener behaviour the shared code
  depends on. It's loaded first in `content_scripts`, `import`ed at the top of the SW, and injected
  into `popup.html` by the build.
- **No native side ⇒ no SharedStore/App Group.** The key/region are **baked** from
  `chrome/config.local.js` (gitignored; mirrors `Config/Secrets.xcconfig`) into `chrome/dist/config.js`
  at build time; feature toggles use `SharedStore`'s defaults in `services/settings.js`. No key →
  MyMemory fallback. There is **no options/settings UI** in Chrome (popup per-session toggles only).
- **`User-Agent` can't be set from `fetch()`** (forbidden header); the Swift services' descriptive UA
  is dropped — the browser's own UA satisfies Wiktionary/ylhyra.
- **Action icon must be PNG** in Chrome (`images/icon-*.png`), not Safari's `toolbar-icon.svg`.

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
- **Look-up mode** is a **press-and-hold resolved on RELEASE**: hold a word in place ~350ms
  (`PRESS_MS`) then lift to open the look-up; a quick tap passes straight through to the page, so
  it never hijacks normal taps/navigation (works on over-clickable layouts like Facebook). The
  decision happens in `onPointerUp` (always delivered) — at `PRESS_MS` we only highlight the word
  (`armHold`); we **never open the popover or block selection mid-gesture**, so dragging selects
  text natively and there is nothing to undo. A finger move >10px (`MOVE_TOL`) turns the press into
  a scroll/selection drag. On a hold-release look-up we clear iOS's transient single-word selection
  (`removeAllRanges`, so its callout doesn't linger) and briefly eat the synthesized
  click/`contextmenu` (`suppressSynthetic`). `selectionchange`/`touchend` are gated on `pressActive`
  so the selection chip waits for the press to resolve. While active it force-enables `user-select`
  and `stopPropagation`s page `selectstart` handlers (never `preventDefault`) so drag-selection works
  where sites block it. **Auto-enabled only on likely-Icelandic pages** (gated in `content.js` via
  `looksIcelandic()`), so it stays dormant on English sites; the popup toggle can force it on any
  page. All its listeners are added/removed together in `TI.word.setEnabled`.

  *Why release-based:* firing during the hold and blocking the native `selectstart` half-engaged
  iOS selection then cancelled it (drag never re-selected), and iOS captures the touch during
  selection so `pointermove` stopped arriving (the popover wouldn't close). Deciding on release and
  never blocking selection sidesteps both.
- After editing Swift, check LSP diagnostics; prefer LSP navigation over grep for code.

## Build & test

```sh
# Full QA harness: JS logic + config + live API contracts + build + unit tests
./scripts/qa.sh
./scripts/qa.sh --fast    # quick checks only (skip Xcode build/tests)

# Chrome build (desktop) — assembles chrome/dist/, then Load unpacked in chrome://extensions
node scripts/build-chrome.mjs

# Or directly:
# Compile app + extension for the simulator (no signing)
xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

# Unit tests (settings contract)
xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:"Translate IcelandicTests" test
```

QA harness: `scripts/qa.sh` (+ `scripts/qa/check_js.mjs`, `check_chrome.mjs`, `check_apis.py`).
On-device checklist: [`docs/QA.md`](docs/QA.md). The harness validates the Icelandic detector, JS
syntax, the Chrome build + MV3 manifest (`check_chrome.mjs`: builds `chrome/dist/`, checks
`host_permissions` and that every referenced file resolves), config validity, the live external-API
contracts, the build, and unit tests without a device.

## External APIs

- **Azure Translator** v3 `POST /translate?api-version=3.0&from=is&to=en` — headers
  `Ocp-Apim-Subscription-Key`, `Ocp-Apim-Subscription-Region`. Free F0: 2M chars/month.
- **MyMemory** `GET /get?q=&langpair=is|en` — keyless fallback, rate-limited.
- **Wiktionary** `GET /api/rest_v1/page/definition/{word}` — Icelandic entries under `is`;
  send a descriptive `User-Agent`.
- **BÍN / ylhyra** `GET /api/inflection?search={word}` → lemma + `BIN_id`, then
  `?id={BIN_id}&type=flat` → full paradigm (one entry per form). Falls back to a BÍN page link.
