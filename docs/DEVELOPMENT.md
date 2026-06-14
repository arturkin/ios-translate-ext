# Development manual

How to pick this project back up and make changes. Read [`CLAUDE.md`](../CLAUDE.md) once for the
architecture and the list of gotchas; this doc is the *workflow* — where to edit, how to rebuild,
how to debug, on each platform.

## The one mental model

There is **one codebase, three targets**: Safari on iOS, Safari on macOS, and desktop Chrome.

- The **content scripts, popup, Icelandic detector, Shadow-DOM UI, gestures, `_locales` and icons**
  are *shared, single-source* in `Translate Icelandic Extension/Resources/`. Edit them once.
- Everything platform-specific lives behind **one seam: `background.js`**. On Safari it relays to a
  native Swift handler (the Swift side holds the key and makes network calls). On Chrome there is no
  native app, so the Chrome `background.js` calls the web APIs directly with `fetch()`.
- So the **Swift services** (`…/Services/*.swift`) and the **JS services** (`chrome/src/services/*.js`)
  are two implementations of the same four operations — keep them in parity.

```
shared content scripts ──► background.js (the seam) ──► Safari: native Swift services
(Resources/, edit once)                            └─► Chrome: chrome/src/services/*.js (fetch)
```

## Prerequisites

- **Xcode 16+** (Safari targets, objectVersion-77 synchronized folders), signing team `P738AB4T7V`.
- **Node 18+** (Chrome build + the QA harness; `AbortSignal.timeout` needs ≥17.3).
- **Azure key** (optional but recommended) in `Config/Secrets.xcconfig` — copy from
  `Config/Secrets.example.xcconfig`. Both files are described under [Secrets](#secrets).

## Where to make a change

| You want to change… | Edit | Affects | Rebuild |
|---|---|---|---|
| Look-up gesture, popover behavior | `Resources/wordLookup.js` | all 3 | Chrome build + Xcode |
| Page-translate / scroll / dynamic content | `Resources/pageTranslator.js` | all 3 | Chrome build + Xcode |
| The popover / FAB / chip / toast UI | `Resources/ui.js` | all 3 | Chrome build + Xcode |
| Icelandic detection heuristic | `Resources/icelandic.js` | all 3 | Chrome build + Xcode |
| Popup toggles / status line | `Resources/popup.{html,js,css}` | all 3 | Chrome build + Xcode |
| Message routing / cache | `Resources/background.js` **and** `chrome/src/background.js` | split | both |
| Translation/dictionary network calls | `…/Services/*.swift` **and** `chrome/src/services/*.js` | split | both |
| Feature toggle / default | `Shared/SharedStore.swift` (×2, mirrored) + `SettingsView.swift` + `chrome/src/services/settings.js` | split | both |
| Chrome manifest / permissions | `chrome/src/manifest.json` | Chrome | Chrome build |
| Safari manifest | `Resources/manifest.json` | Safari | Xcode |

> **Golden rules.** (1) Never fork a shared content script into `chrome/` — edit it in `Resources/`
> and rebuild. (2) `Shared/SharedStore.swift` is duplicated in both Swift targets and must stay
> **identical**. (3) `Resources/` is **flat** — JS/HTML/CSS live at the root (only `images/` and
> `_locales/` are folders). (4) When you touch one side of the seam, check whether the other side
> needs the same change to stay in parity.

## Iteration loops

### Chrome — the fastest loop (use this for content-script/UI work)

```sh
node scripts/build-chrome.mjs        # assembles chrome/dist/
```

Then in `chrome://extensions` (Developer mode on) press **Reload (⟳)** on the extension card.
First time only: **Load unpacked → chrome/dist**.

Debug:
- **Service worker** (`background.js`, services, fetch): click the **“service worker”** link on the
  card → DevTools.
- **Content scripts** (the page UI): open DevTools on the *web page itself* — logs land in the
  page console.
- **Popup**: right-click the toolbar popup → **Inspect**.

Because the content scripts are shared, anything you verify here is also what ships in Safari.

### Headless JS check (no browser) — fastest of all for pure logic

The JS services are plain ESM and run in Node against the live keyless APIs:

```sh
node scripts/build-chrome.mjs
node --input-type=module -e '
  const d="./chrome/dist/services/";
  const {wiktionaryDefine}=await import(d+"wiktionary.js");
  console.log(await wiktionaryDefine("hússins"));'
```

For the detector and JS syntax: `node scripts/qa/check_js.mjs`. For the Chrome build + manifest:
`node scripts/qa/check_chrome.mjs`.

### Safari iOS

```sh
# compile only (simulator, no signing)
xcodebuild -scheme "Translate Icelandic" -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

Run on a device/simulator from Xcode (scheme **Translate Icelandic**). After install, enable it:
**Settings → Apps → Safari → Extensions → Translate Icelandic → Allow on Every Website**.

Debug:
- **JS**: Mac Safari → **Develop → [your iPhone/Simulator]** → pick the page *and* the extension
  background. (Enable: Mac Safari → Settings → Advanced → Show Develop menu; iPhone → Settings →
  Safari → Advanced → Web Inspector.)
- **Native Swift**: `os_log` in **Console.app**, filtered by the extension process; or the Xcode
  console.

Side-loading with a free Apple ID (7-day, no App Groups) is covered in
[`DISTRIBUTION.md`](DISTRIBUTION.md) §A — those signing edits are temporary, **don't commit them**.

### Safari macOS

```sh
xcodebuild -scheme "Translate Icelandic (macOS)" -configuration Release \
  -destination 'platform=macOS' -derivedDataPath build-mac build
```

Run the macOS app once (it enables the extension). Then in Safari: **Settings → Extensions** → turn
it on. For a dev-signed build you must also do **Develop → Allow Unsigned Extensions** — this
**resets every time Safari launches**, so redo it after each restart. Debug via **Develop → Web
Extension Background Content** and the page inspector.

## Common change recipes

**Tune the look-up gesture.** Edit `PRESS_MS` / `MOVE_TOL` at the top of `Resources/wordLookup.js`.
The decision is made on `pointerup` (see the "Look-up mode" note in `CLAUDE.md` for *why* it's
release-based — don't reintroduce `preventDefault` on `selectstart`). Test the hold-then-drag and
quick-tap paths on a touch device and with a trackpad in Chrome.

**Tune Icelandic detection.** Edit the special-letters / stopword list in `Resources/icelandic.js`.
Add assertions to `scripts/qa/check_js.mjs` (it executes the detector in a sandbox) and run
`node scripts/qa/check_js.mjs`.

**Change a network call or add a provider.** Update **both** sides:
`…/Services/<X>.swift` (+ wire into `MessageRouter`) and `chrome/src/services/<x>.js` (+ dispatch in
`chrome/src/background.js`). Keep the response shape identical (`{ok, …}` per the protocol in
`CLAUDE.md`). Then update the contract test `scripts/qa/check_apis.py` if the endpoint/shape changed,
and run `./scripts/qa.sh` (set `AZURE_TRANSLATOR_KEY` to also exercise Azure).

**Add a feature toggle.** Touch points, in order:
1. `Shared/SharedStore.swift` — add the key + default (**edit both copies, keep identical**).
2. `SettingsView.swift` — add the control.
3. `MessageRouter` `status` response — include the new field.
4. `chrome/src/services/settings.js` — add it to `DEFAULTS` and `statusResponse()`.
5. `Resources/content.js` — read it from `TI.bg.status()` and act on it.
6. `Resources/popup.js`/`popup.html` — if it needs a per-session toggle.

**Change the target language** (e.g. `is→es`). It flows from the callers in `pageTranslator.js` /
`wordLookup.js` (`TI.bg.translate(texts, "is", "en")`) through the protocol; the providers already
take `from`/`to`. Wiktionary/BÍN are Icelandic-specific, so only translation would be retargetable.

## Testing

```sh
./scripts/qa.sh            # JS logic + Chrome build/manifest + config + live APIs + Xcode build + tests
./scripts/qa.sh --fast     # skip the slow Xcode build/tests (great inner loop)
AZURE_TRANSLATOR_KEY=… AZURE_TRANSLATOR_REGION=… ./scripts/qa.sh   # also exercise Azure
```

What runs: `check_js.mjs` (detector + JS syntax), `check_chrome.mjs` (builds `chrome/dist/`,
validates the MV3 manifest / `host_permissions` / referenced files / ESM syntax), plist+JSON
validity, `check_apis.py` (live MyMemory/Wiktionary/BÍN, Azure when keyed), then the Xcode build and
unit tests. Device-only checks (rendering, real touch gestures, Facebook's feed) are the manual
checklist in [`QA.md`](QA.md) — run that before shipping a Safari build.

## Secrets

- **Never commit a key** — the repo is public.
- **Safari** reads `Config/Secrets.xcconfig` (gitignored) at build time as a fallback; in-app
  settings override it. Only `Config/Secrets.example.xcconfig` is tracked.
- **Chrome** bakes `chrome/config.local.js` (gitignored) into `chrome/dist/config.js` at build;
  only `chrome/config.example.js` is tracked. To reuse the Safari key, mirror the two values from
  `Config/Secrets.xcconfig` into `chrome/config.local.js`.
- `chrome/dist/` and `chrome/config.local.js` are gitignored and can't be staged. If a key ever
  leaks, rotate it: **Azure → Keys and Endpoint → Regenerate**.

## Shipping

Safari (TestFlight / unlisted App Store, signing, archive) is in [`DISTRIBUTION.md`](DISTRIBUTION.md)
and the README "Releasing" section. Chrome here is **load-unpacked only** (personal use) — there is
no packed `.crx` or Web Store step; rebuild `chrome/dist` and Reload.

## Before you commit

- Run `./scripts/qa.sh --fast` (or full).
- `git status` — confirm `chrome/dist/`, `chrome/config.local.js`, `Config/Secrets.xcconfig` are
  **not** staged, and that you're not committing temporary signing/entitlements edits from
  device-testing.
- Scan the staged diff for the key (`git diff --cached | grep -i azure`) before pushing — public repo.
