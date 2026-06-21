# QA checklist

## Automated harness (run this first)

```sh
./scripts/qa.sh            # JS logic + config + live API contracts + build + unit tests
./scripts/qa.sh --fast     # skip the Xcode build/tests (quick checks only)
# Optionally validate the default backend too:
AZURE_TRANSLATOR_KEY=… AZURE_TRANSLATOR_REGION=… ./scripts/qa.sh
```

This validates everything that doesn't need a device: the Icelandic-detector logic (both the
short-string and the strict page-level gate), JS syntax, plist/entitlement/JSON validity, the live
external-API contracts (MyMemory, BÍN), the build, and the unit tests. Run it before the manual
pass below and before signing off.

## On-device checklist

Run this on your iPhone too — the parts a harness can't cover (Safari rendering, selection gestures,
Facebook's dynamic feed). The goal is to confirm the full path works end to end on both a
server-rendered site and a dynamic one.

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
| 4  | Select a word (long-press → native selection) | A "🇮🇸 Look up" chip appears by the selection; **the selection is not wiped and the OS callout/copy still works**. Tap the chip → popover shows the gloss, an "Open in Glosbe ↗" link, and a "Show inflection table" disclosure |
| 5  | In the popover, tap **Show inflection table** | BÍN table loads on demand (not before); for an inflected form (e.g. `hússins`, `hestinum`) the lemma line resolves (`hús`, `hestur`) and the full paradigm shows |
| 5b | Drag to select text / scroll while look-up is on | Selecting, extending and copying behave exactly like a normal page — the chip never blocks or hijacks the gesture |
| 6  | Select a phrase | Chip says "Translate"; tapping it shows a translation popover for the whole selection |
| 7  | Open an English page (e.g. a stray Icelandic name/accent present) | **No floating button, no chip** — the strict page gate keeps it dormant; the popup toggle can still force look-up on |
| 7b | Mixed Icelandic/English page with page-translate on | English text is left untouched (per-node detector) |
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

All rows (1–12, incl. 5b/7b) pass on at least one SSR site **and** on Facebook; selecting/copying
text is never blocked (5b); the button/chip stay dormant on English pages (7); special characters
are correct; no console errors; caching verified (row 10). Then it's good for daily personal use.
