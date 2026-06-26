# Release status — pick up here

> **Working note, intentionally uncommitted.** Tracks where the App Store
> submission stands so we can resume after Apple review. Delete once both apps
> are live as unlisted.

_Last updated: 2026-06-21_

## v1.1 — in progress (this change)

Version bumped **1.0 → 1.1**, build **1 → 2** (iOS + macOS `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION`
across all targets; Safari `Resources/manifest.json` and Chrome `chrome/src/manifest.json` → `"1.1"`).

Four fixes (all automated QA + an in-browser e2e of the shared content scripts passed):
1. **Stricter page detection** — the floating button / look-up now gate on a new density-based
   `isLikelyIcelandicPage()` (needs a real ratio of stopwords and/or þ/ð/æ), so a stray accent or
   name no longer flips an English page. (`icelandic.js`, `content.js`)
2. **Lazy BÍN inflections** — the table is hidden behind a "Show inflection table" disclosure and
   only fetched on tap; the panel opens fast. (`wordLookup.js`)
3. **Glosbe replaces Wiktionary** — the panel now links to `glosbe.com/is/en/<word>` instead of
   fetching Wiktionary definitions. The whole `define`/Wiktionary backend was removed (Swift service,
   Chrome service, `define` route, `wiktionary.org` host permission, QA contract).
4. **Selection-first look-up** — no more press-and-hold hijack; the OS selects text natively and a
   "Look up" chip appears beside the selection (tap to open). Selecting/copying is never blocked.

**To ship:** bump is done — just archive + upload + submit each app (see steps below), and for Chrome
run `node scripts/build-chrome.mjs` and upload `chrome/dist/` (zipped) to the Web Store dashboard.
Note: iOS/macOS 1.0 may still be in review — reject the in-review binary first, then submit 1.1.

## Where we are

Both apps are **submitted for App Review** (full review, not TestFlight beta).

| App | Bundle ID | App Store name | Status |
|-----|-----------|----------------|--------|
| iOS (Safari extension inside host app) | `arturkin.Translate-Icelandic-ios` | Translate Icelandic | ⏳ In review |
| macOS (Safari extension inside host app) | `arturkin.Translate-Icelandic.mac` | _(distinct name — set at submit)_ | ⏳ In review |

- Distribution goal: **Unlisted App Store** for both (permanent private link, not searchable).
- Translation key is **baked in** (`Config/Secrets.xcconfig`, region `northeurope`) so reviewers and installers get working translation with no setup. Shared Free F0 quota (2M chars/mo) — keep the links private; rotate via Azure → Keys and Endpoint → Regenerate if leaked.

## ▶ Next step once an app is APPROVED: request unlisted distribution

Do this **per app** (iOS and macOS are separate records).

1. In **App Store Connect → your app → App Information**, copy the **Apple ID** (the numeric ID, e.g. `6471234567`).
2. Go to the unlisted request form: <https://developer.apple.com/contact/request/unlisted-app-distribution/>
   - Sign in with the Account Holder Apple ID.
   - Enter the app's **Apple ID (number)** and submit. (You can request unlisted for an already-approved app or one not yet released.)
3. Apple reviews the unlisted request separately — typically **a few days**. When granted, you get a **permanent App Store link** that works only for people you share it with; the app stays out of search/charts.
4. **Release:** prefer **manual release** on the approved version so it doesn't go fully public before the unlisted grant lands. After the grant, release it — it'll be link-only.

> Updates later go through the same loop: bump build number → archive → upload → submit → (no need to re-request unlisted; it sticks).

## If an app gets REJECTED (most likely cause)

Safari-extension apps often bounce because the reviewer can't find/enable the extension. Add this to **App Review Notes** and resubmit (no code change needed):

> This app installs a Safari extension. To test: Settings → Apps → Safari → Extensions (iOS) / Safari → Settings → Extensions (macOS) → enable "Translate Icelandic" → Allow on Every Website. The translation key is pre-configured. Visit an Icelandic site (e.g. ruv.is), tap the 🇮🇸 button to translate the page, or press-and-hold a word to look it up.

## Loose ends in the working tree (not blocking review)

- `main` is **1 commit ahead of `origin/main`** — not pushed. `git push` when ready (public repo).
- `chrome/src/manifest.json` — pre-existing, unrelated change, still uncommitted. Commit separately if wanted.
- `screenshots/mac-01.png` — the macOS screenshot, untracked. Add to the repo if you want it tracked.
- This file (`docs/RELEASE-STATUS.md`) — uncommitted by design.

## What's already shipped to `main` (commit 33573ed)

- iOS app icon (full-bleed opaque 1024px flag) — was missing, a hard blocker.
- Bundle IDs + App Group renamed to the `-ios` namespace (base names were globally taken).
- iOS app set to **iPhone-only**.
- `manifest.json`: `background.persistent = false` (Safari iOS/iPadOS validation; shared with macOS ext).
- App Store screenshots under `screenshots/`.
