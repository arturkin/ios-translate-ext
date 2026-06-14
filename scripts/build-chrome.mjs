#!/usr/bin/env node
// build-chrome.mjs — assemble the desktop-Chrome extension into chrome/dist/.
//
// The content scripts, popup, detector, UI, locales and icons are single-source in the Safari
// extension's Resources/ folder; this copies them verbatim alongside the Chrome-only files
// (manifest, service worker, JS services, vendored webextension-polyfill) and bakes the API key.
//
// Usage:  node scripts/build-chrome.mjs [outDir]      (outDir defaults to chrome/dist)

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, rmSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const RES = join(ROOT, "Translate Icelandic Extension", "Resources");
const SRC = join(ROOT, "chrome", "src");
const VENDOR = join(ROOT, "chrome", "vendor");
const OUT = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, "chrome", "dist");

// Content scripts + popup assets that are shared with the Safari build (copied verbatim).
const SHARED_FILES = [
    "messaging.js", "icelandic.js", "ui.js", "pageTranslator.js", "wordLookup.js", "content.js",
    "popup.js", "popup.css",
];
const SHARED_DIRS = ["_locales", "images"];

function need(path, label) {
    if (!existsSync(path)) throw new Error(`missing ${label}: ${path}`);
    return path;
}

// Fresh output dir.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. Shared content-script / popup files from the Safari Resources/ folder.
for (const f of SHARED_FILES) cpSync(need(join(RES, f), f), join(OUT, f));
for (const d of SHARED_DIRS) cpSync(need(join(RES, d), d), join(OUT, d), { recursive: true });

// 2. popup.html with the polyfill <script> injected before popup.js (Chrome needs browser.* in the
//    popup page; Safari's popup.html stays untouched). This is the one build-time transform.
let popupHtml = readFileSync(need(join(RES, "popup.html"), "popup.html"), "utf8");
if (!popupHtml.includes("browser-polyfill.min.js")) {
    const before = popupHtml;
    popupHtml = popupHtml.replace(
        /(<script\b[^>]*\bsrc=["']popup\.js["'][^>]*><\/script>)/,
        '<script src="browser-polyfill.min.js"></script>\n    $1',
    );
    if (popupHtml === before) {
        throw new Error("could not find the popup.js <script> tag to inject the polyfill before");
    }
}
writeFileSync(join(OUT, "popup.html"), popupHtml);

// 3. Chrome-only source: manifest, service worker, JS services.
cpSync(need(join(SRC, "manifest.json"), "manifest.json"), join(OUT, "manifest.json"));
cpSync(need(join(SRC, "background.js"), "background.js"), join(OUT, "background.js"));
cpSync(need(join(SRC, "services"), "services/"), join(OUT, "services"), { recursive: true });

// 4. Vendored webextension-polyfill.
cpSync(
    need(join(VENDOR, "browser-polyfill.min.js"), "vendor/browser-polyfill.min.js"),
    join(OUT, "browser-polyfill.min.js"),
);

// 5. Bake the config: prefer the gitignored local file, else the tracked example (keyless).
const localCfg = join(ROOT, "chrome", "config.local.js");
const exampleCfg = join(ROOT, "chrome", "config.example.js");
const cfgSrc = existsSync(localCfg) ? localCfg : need(exampleCfg, "config.example.js");
cpSync(cfgSrc, join(OUT, "config.js"));
const baked = cfgSrc === localCfg ? "config.local.js (your key)" : "config.example.js (keyless → MyMemory)";

// 6. package.json so Node tooling parses the SW/services as ESM (Chrome ignores it).
writeFileSync(join(OUT, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2) + "\n");

console.log(`✓ built Chrome extension → ${OUT}`);
console.log(`  config baked from: ${baked}`);
console.log(`  load it: chrome://extensions → Developer mode → Load unpacked → ${OUT}`);
