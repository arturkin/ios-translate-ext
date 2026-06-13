#!/usr/bin/env python3
"""Live integration checks for the external APIs the native handler depends on.

These hit the REAL keyless services with the same requests the Swift services
make, and assert the response SHAPES the parsers rely on. They catch external
API drift (renamed fields, dropped Icelandic data) that a pure unit test can't.
Requires network. Azure is checked only when AZURE_TRANSLATOR_KEY is set.
"""
import json
import os
import subprocess
import sys
import urllib.parse

UA = "TranslateIcelandic/1.0 (personal Safari extension; QA harness)"
TIMEOUT = 25
passed = failed = 0


def ok(m):
    global passed
    passed += 1
    print("  ✓ " + m)


def bad(m):
    global failed
    failed += 1
    print("  ✗ " + m)


def curl(url, post_body=None, headers=None):
    """Fetch via curl (uses the system trust store; avoids Python CA-bundle issues).
    Returns (http_status:int, body:str). Raises on transport failure."""
    cmd = ["curl", "-sS", "--max-time", str(TIMEOUT), "-A", UA, "-w", "\n%{http_code}"]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    if post_body is not None:
        cmd += ["-X", "POST", "--data-binary", post_body]
    cmd.append(url)
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or f"curl exit {res.returncode}")
    out = res.stdout
    nl = out.rfind("\n")
    status = int(out[nl + 1:].strip() or 0)
    return status, out[:nl]


def get(url):
    return curl(url)


def post_json(url, body, headers):
    h = {"Content-Type": "application/json"}
    h.update(headers)
    return curl(url, post_body=json.dumps(body), headers=h)


# 1) MyMemory — FallbackTranslationProvider parse path.
print("MyMemory (free fallback) — responseData.translatedText:")
try:
    q = urllib.parse.urlencode({"q": "Halló", "langpair": "is|en"})
    _, body = get("https://api.mymemory.translated.net/get?" + q)
    t = json.loads(body).get("responseData", {}).get("translatedText")
    if isinstance(t, str) and t.strip():
        ok(f"present: 'Halló' → '{t}'")
    else:
        bad("responseData.translatedText missing/empty — FallbackTranslationProvider would fail")
except Exception as e:
    bad(f"request failed: {e}")

# 2) Wiktionary — WiktionaryService: Icelandic section under "is".
print("Wiktionary definition endpoint — 'is' section shape:")
try:
    _, body = get("https://en.wiktionary.org/api/rest_v1/page/definition/" + urllib.parse.quote("hestur"))
    d = json.loads(body)
    isarr = d.get("is")
    if isinstance(isarr, list) and isarr and isarr[0].get("definitions"):
        defn = isarr[0]["definitions"][0].get("definition", "")
        ok(f"'is' entries[0].partOfSpeech='{isarr[0].get('partOfSpeech')}', def='{defn[:38]}…'")
    else:
        bad("'is' section / definitions[].definition missing — WiktionaryService would return empty")
except Exception as e:
    bad(f"request failed: {e}")

# 3) Inflected-form lemma fallback chain (WiktionaryService + InflectionService.lemma).
print("Inflected-form lemma fallback ('hússins' → lemma 'hús'):")
try:
    inflected_code, _ = get("https://en.wiktionary.org/api/rest_v1/page/definition/" + urllib.parse.quote("hússins"))
    q = urllib.parse.urlencode({"search": "hússins", "type": "flat"})
    _, body = get("https://ylhyra.is/api/inflection?" + q)
    res = json.loads(body).get("results", [])
    lemma = res[0].get("base_word") if res else None
    if lemma == "hús":
        ok(f"BÍN resolves lemma 'hús' (raw inflected lookup returned HTTP {inflected_code})")
    else:
        bad(f"lemma resolution failed (got {lemma!r}) — inflected-form definitions would break")
except Exception as e:
    bad(f"request failed: {e}")

# 4) ylhyra search → BIN_id  (InflectionService step 1).
print("BÍN/ylhyra search → base_word + BIN_id:")
bin_id = None
try:
    q = urllib.parse.urlencode({"search": "hestur", "type": "flat"})
    _, body = get("https://ylhyra.is/api/inflection?" + q)
    res = json.loads(body).get("results", [])
    first = next((r for r in res if isinstance(r.get("BIN_id"), int)), None)
    if first and first.get("base_word") and isinstance(first.get("word_categories"), list):
        bin_id = first["BIN_id"]
        ok(f"'hestur' → base_word '{first['base_word']}', BIN_id {bin_id}, categories {first['word_categories']}")
    else:
        bad("search missing BIN_id/base_word/word_categories — InflectionService would degrade to lemma-only")
except Exception as e:
    bad(f"request failed: {e}")

# 5) ylhyra by id → full paradigm  (InflectionService step 2).
print("BÍN/ylhyra full paradigm by id → inflectional_form rows:")
try:
    the_id = bin_id if bin_id is not None else 6179
    q = urllib.parse.urlencode({"id": str(the_id), "type": "flat"})
    _, body = get("https://ylhyra.is/api/inflection?" + q)
    res = json.loads(body).get("results", [])
    forms = [r for r in res if r.get("inflectional_form") and isinstance(r.get("inflectional_form_categories"), list)]
    if len(forms) >= 4:
        s = forms[0]
        ok(f"id {the_id} → {len(forms)} forms (e.g. '{s['inflectional_form']}' = {s['inflectional_form_categories']})")
    else:
        bad(f"id {the_id} returned {len(forms)} usable forms — inflection table would be empty/short")
except Exception as e:
    bad(f"request failed: {e}")

# 6) Azure — only when a key is provided.
print("Azure Translator (AzureTranslationProvider):")
key = os.environ.get("AZURE_TRANSLATOR_KEY")
region = os.environ.get("AZURE_TRANSLATOR_REGION", "")
if not key:
    print("  - skipped (set AZURE_TRANSLATOR_KEY [+ AZURE_TRANSLATOR_REGION] to test the default backend)")
else:
    try:
        url = "https://api.cognitive.microsofttranslator.com/translate?" + urllib.parse.urlencode(
            {"api-version": "3.0", "from": "is", "to": "en"})
        headers = {"Ocp-Apim-Subscription-Key": key}
        if region:
            headers["Ocp-Apim-Subscription-Region"] = region
        _, body = post_json(url, [{"Text": "Halló"}], headers)
        t = json.loads(body)[0]["translations"][0]["text"]
        ok(f"'Halló' → '{t}'")
    except Exception as e:
        bad(f"Azure request failed: {e}")

print(f"\nAPI checks: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
