#!/usr/bin/env bash
# QA harness for Translate Icelandic.
#
# Runs the automated checks that validate the project end-to-end WITHOUT a device:
#   1. JS syntax + Icelandic-detector logic   (scripts/qa/check_js.mjs)
#   2. Config validity (plists, entitlements, JSON)
#   3. Live API contracts                      (scripts/qa/check_apis.py)
#   4. Build (app + extension, simulator)
#   5. Unit tests
#
# Device-only checks (Safari rendering, tap gestures, Facebook feed) live in
# docs/QA.md and must still be run manually before release.
#
# Usage:  scripts/qa.sh [--fast]      # --fast skips the slow Xcode build + tests
# Azure:  AZURE_TRANSLATOR_KEY=... AZURE_TRANSLATOR_REGION=... scripts/qa.sh
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAST=0; [ "${1:-}" = "--fast" ] && FAST=1
FAIL=0
hr(){ printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

hr "1. JS syntax + logic"
if command -v node >/dev/null 2>&1; then
  node "scripts/qa/check_js.mjs" || FAIL=1
else
  echo "  node not found — skipping (install Node to run JS checks)"
fi

hr "1b. Chrome build + manifest"
if command -v node >/dev/null 2>&1; then
  node "scripts/qa/check_chrome.mjs" || FAIL=1
else
  echo "  node not found — skipping (install Node to build/validate the Chrome extension)"
fi

hr "2. Config validity (plists, entitlements, JSON)"
CFG_OK=1
for p in "Translate Icelandic/Info.plist" \
         "Translate Icelandic Extension/Info.plist" \
         "Translate Icelandic/TranslateIcelandic.entitlements" \
         "Translate Icelandic Extension/TranslateIcelandicExtension.entitlements"; do
  if plutil -lint "$p" >/dev/null 2>&1; then echo "  ✓ $p"; else echo "  ✗ $p"; CFG_OK=0; fi
done
if python3 -c 'import json,sys; [json.load(open(f)) for f in sys.argv[1:]]' \
     "Translate Icelandic Extension/Resources/manifest.json" \
     "Translate Icelandic Extension/Resources/_locales/en/messages.json" 2>/dev/null; then
  echo "  ✓ manifest.json + messages.json parse as JSON"
else
  echo "  ✗ manifest.json / messages.json failed to parse"; CFG_OK=0
fi
[ $CFG_OK -eq 1 ] || FAIL=1

hr "3. Live API contracts"
python3 "scripts/qa/check_apis.py" || FAIL=1

if [ $FAST -eq 0 ]; then
  hr "4. Build (app + extension, simulator)"
  if xcodebuild -project "Translate Icelandic.xcodeproj" -scheme "Translate Icelandic" \
       -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
       -configuration Debug CODE_SIGNING_ALLOWED=NO build >/tmp/qa_build.log 2>&1; then
    echo "  ✓ BUILD SUCCEEDED"
  else
    echo "  ✗ BUILD FAILED — tail of /tmp/qa_build.log:"; tail -25 /tmp/qa_build.log; FAIL=1
  fi

  hr "5. Unit tests"
  DEST=$(xcrun simctl list devices available | grep -Eo 'iPhone 1[0-9][^(]*' | head -1 | sed 's/ *$//')
  DEST="${DEST:-iPhone 16}"
  if xcodebuild -project "Translate Icelandic.xcodeproj" -scheme "Translate Icelandic" \
       -sdk iphonesimulator -destination "platform=iOS Simulator,name=$DEST" \
       -only-testing:"Translate IcelandicTests" test >/tmp/qa_test.log 2>&1; then
    echo "  ✓ TESTS PASSED (on $DEST)"
  else
    echo "  ✗ TESTS FAILED — tail of /tmp/qa_test.log:"; tail -25 /tmp/qa_test.log; FAIL=1
  fi
else
  hr "4-5. Build + unit tests"; echo "  - skipped (--fast)"
fi

hr "Result"
if [ $FAIL -eq 0 ]; then
  printf '\033[32mQA: ALL AUTOMATED CHECKS PASSED\033[0m  (then run docs/QA.md on a device)\n'
else
  printf '\033[31mQA: FAILURES ABOVE — see logs\033[0m\n'
fi
exit $FAIL
