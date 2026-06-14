# Translate Icelandic

A **Safari Web Extension (iOS 18+ and macOS)** — with a **desktop Chrome build** too — that
translates **Icelandic → English** on any website, and lets you **tap a word to look it up**
(gloss + dictionary definition + full inflection table) while you learn the language.

> Safari is distributed through the App Store by **invite only** — see [Releasing](#releasing).
> The Chrome build is loaded unpacked — see [Chrome (desktop)](#chrome-desktop).

## Features

- **Translate this page** — replaces Icelandic text with English in place (toggle to revert).
  Lazy-translates on scroll (`IntersectionObserver`) and keeps up with dynamic content
  (`MutationObserver`). A lightweight Icelandic detector skips English text to save quota.
- **Floating translate button** — a 🇮🇸 button appears on Icelandic pages; tap to translate the
  whole page, tap again to restore the original.
- **Tap a word** → a Shadow-DOM popover with:
  - an instant English **gloss** (your translation backend),
  - the **Wiktionary** definition (with lemma resolution for inflected forms),
  - the full **BÍN** declension/conjugation table (Database of Modern Icelandic Inflection).
  - First tap highlights the word, second tap opens the panel — so a stray tap never interrupts.
- **Select a phrase** → a **Translate selection** chip appears; tap it for a quick translation.
- **Pluggable translation backend** — Azure by default, with a keyless free fallback.

## Architecture

The API key and all network calls live in the **native handler (Swift)** — never in JavaScript.
That keeps the key in the App Group container, sidesteps CORS, and reuses iOS networking.

```
Web page (any site, incl. Facebook)
  │  tap word / select text / "translate page"
  ▼
content scripts            messaging.js · icelandic.js · ui.js (Shadow DOM) ·
(isolated world)           pageTranslator.js · wordLookup.js · content.js
  │  browser.runtime.sendMessage({ type, payload })
  ▼
background.js              router + translation cache (storage.local) + native bridge
  │  browser.runtime.sendNativeMessage(...)
  ▼
SafariWebExtensionHandler.swift → MessageRouter
  ├─ translate → AzureTranslationProvider  |  FallbackTranslationProvider (MyMemory)
  ├─ define    → WiktionaryService          (en.wiktionary.org REST)
  └─ inflect   → InflectionService          (ylhyra.is BÍN/DMII API; BÍN link fallback)
        ↑ reads settings from the shared App Group (written by the host app)
```

The **host app** is a small SwiftUI settings screen: enter the Azure key/region, choose the
backend, toggle features, and read the steps to enable the extension. Settings are stored in the
App Group `group.arturkin.Translate-Icelandic`, which the extension reads.

## Setup

### 1. Get a free Azure Translator key (recommended)

1. Sign in to the [Azure portal](https://portal.azure.com) (free account; a card is required to
   register but the tier below is free).
2. **Create a resource → "Translator"** (a.k.a. Azure AI Translator).
3. Choose the **Free F0** pricing tier (**2M characters/month**).
4. Open the resource → **Keys and Endpoint**. Copy **Key 1** and the **Region/Location**
   (e.g. `westeurope`).

> No key yet? The extension still works using the keyless **MyMemory** fallback — lower quality
> and rate-limited, but fine for trying it out.

#### Optional: bake the key into builds (env file)

To ship a build that works without each user entering a key, copy the env template and fill it in.
The real file is **gitignored**, so your key never gets committed (this repo is public):

```sh
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig
# then edit Config/Secrets.xcconfig:
#   AZURE_TRANSLATOR_KEY = <your key>
#   AZURE_TRANSLATOR_REGION = westeurope
```

The extension reads these at build time (via its Info.plist) as a fallback; a key entered in the
app still takes precedence. Rebuild after editing.

> **Note:** a baked-in key is embedded in the distributed build and shared by everyone you invite,
> drawing on the same Free F0 quota. Keep the invite list to people you trust, and rotate the key
> (**Keys and Endpoint → Regenerate**) if it's ever exposed.

### 2. Build & run

1. Open `Translate Icelandic.xcodeproj` in Xcode.
2. Select your team (**Signing & Capabilities** → Team) for both the **Translate Icelandic** and
   **Translate Icelandic Extension** targets. Both already declare the App Group
   `group.arturkin.Translate-Icelandic`.
3. Pick your iPhone (iOS 18+) as the run destination and **Run**.
4. In the app: paste the Azure **Key** + **Region**, tap **Save**, then **Test connection**
   (expect `✓ Halló → Hello`).

### 3. Enable in Safari

On the iPhone: **Settings → Apps → Safari → Extensions → Translate Icelandic** → turn it on and
set permission to **Allow on Every Website**.

## Activating & using all features

### Enable the extension (first run)

1. **Install** — from TestFlight (the invite path) or from Xcode onto your iPhone. This installs
   the app *and* the embedded extension.
2. **Turn it on** — On the iPhone: **Settings → Apps → Safari → Extensions → Translate Icelandic**
   → toggle it **on**. (You can also do this from Safari: tap the **Extensions** button — the
   puzzle-piece icon in the toolbar — or the page/format menu next to the address bar →
   **Manage Extensions**.)
3. **Grant access** — In that same extension screen set **Permissions** to **Allow on Every
   Website** (or allow per-site the first time you visit one). Without this the popup toggles stay
   greyed out and nothing happens on the page.
4. **Add your key** — Open the **Translate Icelandic** app, paste your Azure **Key** + **Region**
   (they save automatically), then tap **Test connection** (expect `✓ Halló → Hello`). Skip this
   to use the free MyMemory fallback or if the build already ships with a key.

### Using it on a page

- **Floating 🇮🇸 button** — appears bottom-right on Icelandic pages. Tap to translate the whole page
  in place; it turns into ↩ to restore the original. Keeps up with dynamic feeds (new posts
  translate as they load) and translates on-screen text first as you scroll.
- **Tap a word** (tap mode on) → first tap highlights the word, second tap opens a popover with the
  English **gloss**, the **Wiktionary** definition, and the **BÍN inflection table**. Tapping an
  inflected form (e.g. *hússins*) resolves the lemma (*hús*); **More on Wiktionary ↗** /
  **Full table on BÍN ↗** open the full entries. Links and buttons on the page still work — only
  plain-text taps are intercepted.
- **Select a phrase** → a **Translate selection** chip appears (bottom-right, clear of iOS's own
  selection menu); tap it to translate the whole selection.
- **The toolbar popup** (Safari Extensions button → Translate Icelandic) mirrors the same toggles
  and shows the active backend (**Azure** or **free fallback**).
- **App settings** (in the host app): backend + key/region, **Provider** (Azure or free),
  **Auto-translate Icelandic pages** (off by default), and the **Wiktionary / BÍN** look-up sources.

Translations are cached on-device, so re-reading a page or revisiting words doesn't re-hit the API.

### Troubleshooting

- **Toggles greyed out / "Not available on this page"** → the extension lacks permission for this
  site; allow it from the popup or set **Allow on Every Website**. Some pages (`about:`, the App
  Store, Apple domains) can't be extended.
- **Shows "free fallback" when you expected Azure** → the key isn't saved or is wrong; re-open the
  app and run **Test connection**.
- **A lookup or page-translate shows an error** → the translation/dictionary service timed out or
  rejected the request. For Azure, an `HTTP 401`/`403` means the key or region is wrong.

## Chrome (desktop)

The same extension runs in desktop **Chrome** (and Chromium browsers — Edge, Brave, Opera). It
reuses the identical content scripts, popup, Icelandic detector and Shadow-DOM UI; only the backend
differs. Chrome has no native app, so the background **service worker** calls the translation and
dictionary APIs directly with `fetch()` (cross-origin is allowed via `host_permissions`). Mozilla's
`webextension-polyfill` provides the `browser.*` API, so the shared code runs unchanged.

> **iOS/Android Chrome can't run extensions** — Chrome on mobile has no extension support at all.
> On iOS the only route to extensions is a Safari Web Extension (above). The Chrome build is
> desktop-only.

### Build & load

```sh
# Optional: bake in your Azure key (gitignored, mirrors Config/Secrets.xcconfig).
cp chrome/config.example.js chrome/config.local.js
#   then edit chrome/config.local.js → azureKey / azureRegion
#   (skip this to use the keyless MyMemory fallback)

node scripts/build-chrome.mjs        # assembles chrome/dist/
```

Then in Chrome: open **`chrome://extensions`** → enable **Developer mode** (top-right) → **Load
unpacked** → select the **`chrome/dist`** folder. Pin it from the puzzle-piece menu. After editing
any source, re-run the build and hit **Reload** on the extension card.

> Same caveat as the Safari build: a baked key ships inside `chrome/dist` and shares one Azure F0
> quota. `chrome/dist/` and `chrome/config.local.js` are gitignored — never commit them.

### How the desktop build is assembled

Content scripts stay single-source in `Translate Icelandic Extension/Resources/`;
`scripts/build-chrome.mjs` copies them into `chrome/dist/` alongside the Chrome-only files in
`chrome/src/` (the MV3 manifest, the `background.js` service worker, and the JS ports of the four
services in `chrome/src/services/`). Edit a content script once and both platforms pick it up.

## Swapping the translation backend

The backend is a single seam: implement `TranslationProvider` and wire it into
`MessageRouter.translate(_:)`. See
`Translate Icelandic Extension/Services/AzureTranslationProvider.swift` for the reference
implementation and `FallbackTranslationProvider.swift` for the keyless option. The Chrome build
mirrors this seam in JavaScript — `chrome/src/services/*.js` ported 1:1 from the Swift services,
dispatched in `chrome/src/background.js`.

## Testing

```sh
./scripts/qa.sh            # JS logic + config + live API contracts + build + unit tests
./scripts/qa.sh --fast     # quick checks only (skip the Xcode build/tests)
AZURE_TRANSLATOR_KEY=… AZURE_TRANSLATOR_REGION=… ./scripts/qa.sh   # also exercise Azure
```

The harness validates everything that doesn't need a device — the Icelandic detector, JS syntax,
the **Chrome build + manifest** (`scripts/qa/check_chrome.mjs` assembles `chrome/dist/` and checks
the MV3 manifest, `host_permissions`, and that every referenced file resolves), plist/entitlement/
JSON validity, the live external-API contracts (MyMemory, Wiktionary, BÍN), the build, and the unit
tests. Run it before every release. Then do the on-device pass in
[`docs/QA.md`](docs/QA.md) (Safari rendering, tap gestures, Facebook's feed) — the parts a harness
can't cover.

## Releasing

The app is distributed **by invite only** — there's no public, searchable App Store listing. Two
Apple-native ways to do that, both via [App Store Connect](https://appstoreconnect.apple.com):

### TestFlight (recommended for an invite list)

1. In Xcode, set both targets to **Release** signing with your distribution team, then
   **Product → Archive**.
2. In the Organizer, **Distribute App → App Store Connect → Upload**.
3. In App Store Connect → **TestFlight**, add testers:
   - **Internal testers** (members of your team, up to 100) — instant.
   - **External testers** (up to 10,000) — add people by email or share a **public link** you keep
     private; the first build needs a quick Beta App Review.
4. Invitees install the **TestFlight** app and accept the invite. Builds expire after 90 days, so
   re-upload to keep the group running.

### Unlisted app distribution (a permanent install link)

If you want a non-expiring install instead of TestFlight, request **unlisted distribution** for the
app in App Store Connect (App → **Distribution**). The app is reviewed and published, but it's only
reachable through a direct link you share — never searchable or featured.

### Updating

Bump `MARKETING_VERSION`/build number, re-run `./scripts/qa.sh`, then re-archive and upload.

## Privacy

Text you translate is sent to your chosen translation service (Azure or MyMemory). Words you tap
are also sent to Wiktionary and the BÍN inflection API. Translations are cached locally to reduce
repeat calls. Nothing else leaves the device.

## Limitations & roadmap

- **Safari only** — doesn't cover native apps (Facebook app, Messenger) or text inside images.
- Icelandic isn't supported by Apple's on-device translation/OCR, so a network call is always
  required.
- BÍN inflections come from the community `ylhyra.is` API; if it's unavailable, the popover links
  out to [BÍN](https://bin.arnastofnun.is).
- **Roadmap:** optional screenshot/Share-extension OCR mode for native apps; a saved-words list.
