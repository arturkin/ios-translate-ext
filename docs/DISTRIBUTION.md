# Distribution

How to get the app onto a phone — before and after the paid Apple Developer account
is verified.

## A. Test on your own iPhone now (free Apple ID, no paid account)

You can side-load to your own device with a **free Apple ID** while the paid account
is being verified. Two limits apply:

- **7-day expiry** — re-run from Xcode about once a week.
- **No App Groups** — free "personal team" provisioning can't use the App Group
  capability, so you must turn it off to build. The app still works: the extension
  falls back to the **baked-in Azure key** (from `Config/Secrets.xcconfig`) and the
  default toggles, and `SharedStore` safely no-ops without the shared container. The
  only thing you lose is in-app settings reaching the extension — fine for testing
  translation, tap-lookup, page-translate and the selection button.

Steps (in Xcode, on the Mac with the iPhone connected — **don't commit these
changes**, they're temporary):

1. Plug in the iPhone and trust the Mac.
2. For **both** targets → *Signing & Capabilities*:
   - Team → your **Personal Team** (your Apple ID); keep "Automatically manage
     signing".
   - Remove the **App Groups** capability (the ⊘ / trash on that section).
   - If signing says the bundle ID is unavailable, change both IDs to something
     unique, e.g. `arturkin.test.Translate-Icelandic` and
     `arturkin.test.Translate-Icelandic.Extension`.
3. Set the run destination to your iPhone → **Run**.
4. On the iPhone: *Settings → General → VPN & Device Management* → trust your
   developer certificate.
5. Enable the extension: *Settings → Apps → Safari → Extensions → Translate
   Icelandic* → on → **Allow on Every Website**.
6. Re-run from Xcode within 7 days when the build expires.

To revert for real distribution: re-add App Groups, restore the original bundle IDs,
set the team back to `P738AB4T7V` (or `git checkout` the project file if you edited
it directly).

> The iOS **Simulator** already runs the full app **with** App Groups and needs no
> account at all (`./scripts/qa.sh`, or build + `xcrun simctl install`). Use it for
> everything except real-device touch gestures.

## B. Unlisted App Store distribution (after the account is verified)

A real App Store app that is **not searchable or listed** — installable only via a
direct link you share. **Never expires.** Requires a one-time App Review.

### One-time setup in App Store Connect

1. Accept any pending agreements (Apple Developer Program License; *Paid Apps* only
   if you ever charge — set the price to **Free**).
2. **Apps → ➕ → New App**: iOS, name *Translate Icelandic*, bundle ID
   `arturkin.Translate-Icelandic`, pick an SKU.
3. Fill the required metadata: description, screenshots, privacy questionnaire,
   category, support URL.

### Build, upload, submit

With signing working in Xcode (team `P738AB4T7V`, automatic):

```sh
./scripts/archive.sh        # archives + exports a signed .ipa into build/export/
```

Then upload the `.ipa` with **Transporter** (Mac App Store) or Xcode's **Organizer**,
or the `xcrun altool` command the script prints (needs an App Store Connect API key).
Or skip the script and use **Xcode → Product → Archive → Distribute App → App Store
Connect → Upload**.

After the build finishes processing:

4. Attach it to the app version and **Submit for Review** (full App Review — stricter
   than TestFlight's beta review).
5. Once **Approved**, request **unlisted distribution**:
   - in App Store Connect on the approved app, choose unlisted availability, **or**
   - file the form at
     <https://developer.apple.com/contact/request/unlisted-app-distribution/>.
6. Apple grants a permanent, unlisted App Store link. Share it only with the people
   you want. Updates go through the same archive → upload → review cycle.

### Caveats

- The **baked-in Azure key** ships inside the build and is shared by everyone who
  installs (one Free F0 quota: 2M chars/month). Keep the link private; rotate the key
  (*Azure → Keys and Endpoint → Regenerate*) if it leaks.
- Unlisted still needs full App Review and complete store metadata — more setup than
  TestFlight, but the result never expires.

## C. Quick comparison

| | Expiry | Who can install | Review | Mac needed by others |
|---|---|---|---|---|
| Free Apple ID (Xcode) | 7 days | your plugged-in device | none | n/a (it's your device) |
| Run from Xcode (paid) | ~1 year | your plugged-in device | none | n/a |
| Ad Hoc (paid) | 1 year | devices you register by UDID | none | no |
| **Unlisted App Store** | **none** | anyone with your link | once | no |
| TestFlight | 90 days/build | invite or link | light beta | no |
