# On-device QA checklist

Run this on your iPhone before relying on the extension. The goal is to confirm the full path
works end to end on both a server-rendered site and a dynamic one.

## Setup

1. In Xcode: select your team for both targets, confirm the App Group entitlement resolves, pick
   your connected iPhone (iOS 18+), and **Run** the host app.
2. In the app: paste the Azure **Key** + **Region**, **Save**, then **Test connection** →
   expect `✓ Halló → Hello`.
3. On the iPhone: **Settings → Apps → Safari → Extensions → Translate Icelandic** → enable it and
   set permission to **Allow on Every Website**.

## Functional test matrix

Test sites — SSR Icelandic news: `ruv.is`, `mbl.is`, `visir.is`. Dynamic: `m.facebook.com`.

| #  | Test | Expected |
|----|------|----------|
| 1  | Toolbar → **Translate this page** on / off | Icelandic replaced by English in place; toggling off reverts to the original text |
| 2  | Scroll the Facebook feed with page-translate on | Newly loaded posts get translated (MutationObserver) |
| 3  | Scroll a long article | On-screen text translates first; no freeze or jank (IntersectionObserver) |
| 4  | Tap a word | Popover shows gloss + Wiktionary definition + BÍN inflection table |
| 5  | Tap an inflected form (e.g. `hússins`, `hestinum`) | Lemma resolves (`hús`, `hestur`); definition + full paradigm shown |
| 6  | Select a phrase | Translation popover for the whole selection |
| 7  | Mixed Icelandic/English page | English text is left untouched (detector) |
| 8  | Special characters `þ ð æ ö á é í ó ú ý` | Render correctly everywhere, not garbled |
| 9  | Before entering a key vs after | MyMemory fallback translates with no key; after saving an Azure key the popup shows "Backend: Azure" |
| 10 | Re-translate the same text | Served from cache (no new network request — watch the Web Inspector network tab) |
| 11 | Facebook's aggressive CSS | Popover and toolbar render correctly (Shadow DOM isolation) |
| 12 | Airplane mode, or a deliberately wrong key | Graceful error toast on the page; clear message from **Test connection** in the app |

## Debugging

- **JavaScript:** Mac Safari → **Develop → [your iPhone]** → inspect the page, and separately the
  extension's background page, for `console` logs and network activity.
- **Native (Swift):** **Console.app** → filter by the extension process for `os_log` output; or
  watch the Xcode console while attached.

## Acceptance before "release"

Rows 1–12 pass on at least one SSR site **and** on Facebook; special characters are correct;
no console errors; caching verified (row 10). Then it's good for daily personal use.
