#!/usr/bin/env bash
#
# archive.sh — archive + export a signed .ipa for App Store (incl. unlisted)
# distribution. See docs/DISTRIBUTION.md.
#
# Requires an ACTIVE paid Apple Developer account and signing configured in Xcode
# (team P738AB4T7V, automatic signing) — it will NOT work on a free Apple ID.
#
set -euo pipefail
cd "$(dirname "$0")/.."

SCHEME="Translate Icelandic"
ARCHIVE="build/TranslateIcelandic.xcarchive"
EXPORT_DIR="build/export"
OPTS="Config/ExportOptions-unlisted.plist"

echo "==> Archiving (Release, generic iOS device)…"
xcodebuild -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  archive

echo "==> Exporting signed .ipa…"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportOptionsPlist "$OPTS" \
  -exportPath "$EXPORT_DIR" \
  -allowProvisioningUpdates

echo "==> Done. IPA is in $EXPORT_DIR/"
echo
echo "Upload it one of these ways:"
echo "  • Transporter.app (Mac App Store) — drag in the .ipa"
echo "  • Xcode → Window → Organizer → Distribute App"
echo "  • CLI (needs an App Store Connect API key .p8):"
echo "      xcrun altool --upload-app -f \"$EXPORT_DIR\"/*.ipa -t ios \\"
echo "        --apiKey <KEY_ID> --apiIssuer <ISSUER_ID>"
