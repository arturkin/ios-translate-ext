#!/usr/bin/env node
// Validates the extension's JavaScript without a browser:
//   1. Syntax-checks every content/background/popup script (`node --check`).
//   2. Executes icelandic.js (pure, DOM-free) in a sandbox and asserts the
//      Icelandic detector + word segmentation behave correctly — the logic that
//      decides what gets sent to the metered translation API.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const RES = join(HERE, "..", "..", "Translate Icelandic Extension", "Resources");

const JS_FILES = [
  "messaging.js", "icelandic.js", "ui.js", "pageTranslator.js",
  "wordLookup.js", "content.js", "background.js", "popup.js",
];

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓ " + m); pass++; };
const bad = (m) => { console.log("  ✗ " + m); fail++; };
const eq = (label, got, want) =>
  JSON.stringify(got) === JSON.stringify(want)
    ? ok(`${label} → ${JSON.stringify(got)}`)
    : bad(`${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

console.log("JS syntax:");
for (const f of JS_FILES) {
  try {
    execFileSync(process.execPath, ["--check", join(RES, f)], { stdio: "pipe" });
    ok(f);
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString().split("\n").find(Boolean) : e.message;
    bad(`${f} — ${msg}`);
  }
}

console.log("icelandic.js logic:");
try {
  const code = readFileSync(join(RES, "icelandic.js"), "utf8");
  const sandbox = { window: {}, Intl, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "icelandic.js" });
  const ice = sandbox.window.__TI__ && sandbox.window.__TI__.ice;
  if (!ice) throw new Error("TI.ice was not exported onto window.__TI__");

  // Detector: real Icelandic → true, English → false.
  eq("isLikelyIcelandic('Þetta er íslenskur texti.')", ice.isLikelyIcelandic("Þetta er íslenskur texti."), true);
  eq("isLikelyIcelandic('Ég ætla að fara í búðina.')", ice.isLikelyIcelandic("Ég ætla að fara í búðina."), true);
  eq("isLikelyIcelandic('og að er ekki það')", ice.isLikelyIcelandic("og að er ekki það"), true);
  eq("isLikelyIcelandic('This is plain English text.')", ice.isLikelyIcelandic("This is plain English text."), false);
  eq("isLikelyIcelandic('a')", ice.isLikelyIcelandic("a"), false);
  eq("isLikelyIcelandic('')", ice.isLikelyIcelandic(""), false);

  // Page gate: requires a DENSITY of Icelandic, so a stray þ/accent on an English
  // page must NOT qualify (this is the fix for "the button shows on English sites").
  const isPara = "Þetta er frétt um veðrið á Íslandi. Það verður mjög kalt í dag og á morgun, "
    + "en helgin verður betri. Margir fara til útlanda þegar veturinn kemur. Við þurfum að "
    + "muna eftir því að klæða okkur vel áður en við förum út í kuldann.";
  const enPara = "This is an English news article about travel. Our writer Þóra visited a lovely "
    + "café in the city and wrote about her favorite art. The weather was great and everyone "
    + "had fun during the summer festival downtown this year while the var name stayed put.";
  eq("isLikelyIcelandicPage(real Icelandic paragraph)", ice.isLikelyIcelandicPage(isPara), true);
  eq("isLikelyIcelandicPage(English + stray þ/accent)", ice.isLikelyIcelandicPage(enPara), false);
  eq("isLikelyIcelandicPage('Þetta er gott.')", ice.isLikelyIcelandicPage("Þetta er gott."), false); // too short to judge a page
  eq("isLikelyIcelandicPage('')", ice.isLikelyIcelandicPage(""), false);

  // Word segmentation under a tap offset.
  const w = ice.wordAt("hús og bíll", 1);
  eq("wordAt('hús og bíll', 1).word", w && w.word, "hús");
  const w2 = ice.wordAt("þetta", 3);
  eq("wordAt('þetta', 3).word", w2 && w2.word, "þetta");
} catch (e) {
  bad("icelandic.js load/exec: " + e.message);
}

console.log(`\nJS checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
