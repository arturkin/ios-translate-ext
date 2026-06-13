# Translate Icelandic

A personal-use **Safari Web Extension for iOS 18+** that translates **Icelandic → English**
on any website, and lets you **tap a word to look it up** (gloss + dictionary definition +
full inflection table) while you learn the language.

> Personal use only. Not intended for the App Store.

## Why an extension (and not a screenshot app)

Apple's on-device frameworks don't cover Icelandic — neither the **Translation** framework
(~30 languages, no Icelandic) nor **Vision** OCR (18 languages, no Icelandic). So translation
*must* go through an external API regardless of approach. A Safari extension reads the real DOM,
handles dynamic sites (Facebook) via a `MutationObserver`, and gives a clean tap-a-word learning
loop — without stacking lossy Icelandic OCR on top of the same API dependency a screenshot app
would still need. (A screenshot/OCR mode could be added later for native apps; see the roadmap.)

## Features

- **Translate this page** — replaces Icelandic text with English in place (toggle to revert).
  Lazy-translates on scroll (`IntersectionObserver`) and keeps up with dynamic content
  (`MutationObserver`). A lightweight Icelandic detector skips English text to save quota.
- **Tap a word** → a Shadow-DOM popover with:
  - an instant English **gloss** (your translation backend),
  - the **Wiktionary** definition (with lemma resolution for inflected forms),
  - the full **BÍN** declension/conjugation table (Database of Modern Icelandic Inflection).
- **Select a phrase** → quick translation popover.
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

#### Optional: bake the key into local builds (env file)

To skip entering the key in the app on every install, copy the env template and fill it in. The
real file is **gitignored**, so your key never gets committed (this repo is public):

```sh
cp Config/Secrets.example.xcconfig Config/Secrets.xcconfig
# then edit Config/Secrets.xcconfig:
#   AZURE_TRANSLATOR_KEY = <your key>
#   AZURE_TRANSLATOR_REGION = westeurope
```

The extension reads these at build time (via its Info.plist) as a fallback; a key entered in the
app still takes precedence. Rebuild after editing.

### 2. Build & run (paid Apple Developer account)

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

1. **Install** — Run the host app from Xcode onto your iPhone. This installs the app *and* the
   embedded extension.
2. **Turn it on** — On the iPhone: **Settings → Apps → Safari → Extensions → Translate Icelandic**
   → toggle it **on**. (You can also do this from Safari: tap the **Extensions** button — the
   puzzle-piece icon in the toolbar — or the page/format menu next to the address bar →
   **Manage Extensions**.)
3. **Grant access** — In that same extension screen set **Permissions** to **Allow on Every
   Website** (or allow per-site the first time you visit one). Without this the popup toggles stay
   greyed out and nothing happens on the page.
4. **Add your key** — Open the **Translate Icelandic** app, paste your Azure **Key** + **Region**
   (they save automatically), then tap **Test connection** (expect `✓ Halló → Hello`). Skip this
   to use the free MyMemory fallback.

### The toolbar popup (per-page controls)

Tap the **Extensions** (puzzle-piece) button in Safari's toolbar → **Translate Icelandic**:

- **Translate this page** — on: replaces Icelandic text with English in place; off: restores the
  original. Keeps up with dynamic feeds (new posts translate as they load) and translates
  on-screen text first as you scroll.
- **Tap a word to look it up** — on by default (see below).
- A status line shows the active backend (**Azure** or **free fallback**).

### Features

- **Tap a word** (tap mode on) → a popover with the English **gloss**, the **Wiktionary**
  definition, and the **BÍN inflection table**. Tapping an inflected form (e.g. *hússins*)
  resolves the lemma (*hús*); **More on Wiktionary ↗** / **Full table on BÍN ↗** open the full
  entries. Links and buttons on the page still work — only plain-text taps are intercepted.
- **Select a phrase** → a popover translating the whole selection.
- **Full-page reading** → the *Translate this page* toggle above.
- **App settings** (in the host app, not the popup): backend + key/region, **Provider** (Azure or
  free), **Auto-translate Icelandic pages** (off by default — turn on to translate without flipping
  the toggle each time), and the **Wiktionary / BÍN** look-up sources.

Translations are cached on-device, so re-reading a page or revisiting words doesn't re-hit the API.

### Troubleshooting

- **Toggles greyed out / "Not available on this page"** → the extension lacks permission for this
  site; allow it from the popup or set **Allow on Every Website**. Some pages (`about:`, the App
  Store, Apple domains) can't be extended.
- **Shows "free fallback" when you expected Azure** → the key isn't saved or is wrong; re-open the
  app and run **Test connection**.
- **App/extension stopped working after a while** → re-run from Xcode (a paid-account build lasts a
  year; a free one expires after 7 days).

## Swapping the translation backend

The backend is a single seam: implement `TranslationProvider` and wire it into
`MessageRouter.translate(_:)`. See
`Translate Icelandic Extension/Services/AzureTranslationProvider.swift` for the reference
implementation and `FallbackTranslationProvider.swift` for the keyless option.

## Testing & releasing

### Test

```sh
./scripts/qa.sh            # JS logic + config + live API contracts + build + unit tests
./scripts/qa.sh --fast     # quick checks only (skip the Xcode build/tests)
AZURE_TRANSLATOR_KEY=… AZURE_TRANSLATOR_REGION=… ./scripts/qa.sh   # also exercise Azure
```

The harness validates everything that doesn't need a device — the Icelandic detector, JS syntax,
plist/entitlement/JSON validity, the live external-API contracts (MyMemory, Wiktionary, BÍN), the
build, and the unit tests. Run it before every release. Then do the on-device pass in
[`docs/QA.md`](docs/QA.md) (Safari rendering, tap gestures, Facebook's feed) — the parts a harness
can't cover.

### Release (personal use)

There's no App Store step — "release" just means putting a longer-lived build on your phone:

1. **Build for Release** — in Xcode, Edit Scheme → Run → Build Configuration → **Release**, or use
   **Product → Archive**.
2. **Install to your iPhone.** With the **paid** developer account the build is signed for **1
   year**, so it keeps working without re-deploying (a free account expires in 7 days).
3. **Update** — bump `MARKETING_VERSION`/build number, re-run `./scripts/qa.sh`, then re-run or
   re-archive to the device.
4. *(Optional)* For over-the-air installs to your own devices, push a build to **TestFlight**
   (internal testing) via App Store Connect — still no public listing required.

## Privacy

Text you translate is sent to your chosen translation service (Azure or MyMemory). Words you tap
are also sent to Wiktionary and the BÍN inflection API. Translations are cached locally to reduce
repeat calls. Nothing else leaves the device. Personal use only.

## Limitations & roadmap

- **Safari only** — doesn't cover native apps (Facebook app, Messenger) or text inside images.
- Icelandic isn't supported by Apple's on-device translation/OCR, so a network call is always
  required.
- BÍN inflections come from the community `ylhyra.is` API; if it's unavailable, the popover links
  out to [BÍN](https://bin.arnastofnun.is).
- **Roadmap:** optional screenshot/Share-extension OCR mode for native apps; a saved-words list.
