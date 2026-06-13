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

## Usage

- Tap the extension button in Safari's toolbar to toggle **Translate this page** and
  **Tap a word to look it up** for the current page.
- With tap mode on, tap any Icelandic word for the gloss + Look Up panel, or select a phrase to
  translate it. Links and buttons keep working — only plain text taps are intercepted.

## Swapping the translation backend

The backend is a single seam: implement `TranslationProvider` and wire it into
`MessageRouter.translate(_:)`. See
`Translate Icelandic Extension/Services/AzureTranslationProvider.swift` for the reference
implementation and `FallbackTranslationProvider.swift` for the keyless option.

## Testing

- **Unit tests:** `Translate IcelandicTests` (settings contract). Run:
  ```sh
  xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -only-testing:"Translate IcelandicTests" test
  ```
- **On-device QA** before relying on it: see the checklist in
  [`docs/QA.md`](docs/QA.md) — covers SSR sites, Facebook's dynamic feed, tap-a-word,
  inflected-form lemma resolution, the Icelandic/English detector, special characters, the
  free→Azure switch, caching, and error handling.

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
