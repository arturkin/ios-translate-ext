#!/usr/bin/env node
// Validates the Chrome build without a browser:
//   1. Runs scripts/build-chrome.mjs (assembles chrome/dist/).
//   2. Checks the produced manifest.json is a sane MV3 Chrome manifest with the right backend
//      shape and host_permissions for all four APIs.
//   3. Asserts every file the manifest references actually exists in dist/.
//   4. Syntax-checks (`node --check`) every .js in dist/ as ESM (via dist/package.json).
//
// This is the Chrome analogue of check_js.mjs; the live API contracts are covered by check_apis.py
// (the JS services hit the same endpoints the Swift services do).

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DIST = join(ROOT, "chrome", "dist");
const BUILD = join(ROOT, "scripts", "build-chrome.mjs");

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✓ " + m); pass++; };
const bad = (m) => { console.log("  ✗ " + m); fail++; };

// 1. Build.
console.log("Chrome build:");
try {
    execFileSync(process.execPath, [BUILD], { stdio: "pipe" });
    ok("scripts/build-chrome.mjs assembled chrome/dist/");
} catch (e) {
    const msg = e.stderr ? e.stderr.toString().trim().split("\n").pop() : e.message;
    bad("build failed — " + msg);
    console.log(`\nChrome checks: ${pass} passed, ${fail} failed`);
    process.exit(1); // nothing else is meaningful without a build
}

// 2. Manifest shape.
console.log("manifest.json (MV3 Chrome):");
let manifest = null;
try {
    manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
    ok("parses as JSON");
} catch (e) {
    bad("does not parse: " + e.message);
}

const REQUIRED_HOSTS = [
    "https://api.cognitive.microsofttranslator.com/*",
    "https://api.mymemory.translated.net/*",
    "https://en.wiktionary.org/*",
    "https://ylhyra.is/*",
];

if (manifest) {
    manifest.manifest_version === 3
        ? ok("manifest_version is 3")
        : bad(`manifest_version is ${manifest.manifest_version}, want 3`);

    const sw = manifest.background?.service_worker;
    sw === "background.js"
        ? ok("background.service_worker = background.js")
        : bad(`background.service_worker = ${JSON.stringify(sw)}, want "background.js"`);

    manifest.background?.type === "module"
        ? ok('background.type = "module"')
        : bad('background.type is not "module" (ESM imports would fail)');

    const hosts = manifest.host_permissions || [];
    const missing = REQUIRED_HOSTS.filter((h) => !hosts.includes(h));
    missing.length === 0
        ? ok("host_permissions covers all four API origins")
        : bad("host_permissions missing: " + missing.join(", "));

    const cs = manifest.content_scripts?.[0]?.js || [];
    cs[0] === "browser-polyfill.min.js"
        ? ok("content_scripts load the polyfill first")
        : bad("content_scripts[0].js is not browser-polyfill.min.js (browser.* would be undefined)");

    manifest.permissions?.includes("nativeMessaging")
        ? bad("permissions still requests nativeMessaging (no native host in Chrome)")
        : ok("no stale nativeMessaging permission");
}

// 3. Referenced files exist.
console.log("referenced files exist in dist/:");
if (manifest) {
    const refs = new Set();
    for (const j of manifest.content_scripts?.flatMap((c) => c.js || []) || []) refs.add(j);
    if (manifest.background?.service_worker) refs.add(manifest.background.service_worker);
    if (manifest.action?.default_popup) refs.add(manifest.action.default_popup);
    for (const v of Object.values(manifest.icons || {})) refs.add(v);
    const di = manifest.action?.default_icon;
    if (typeof di === "string") refs.add(di);
    else for (const v of Object.values(di || {})) refs.add(v);

    for (const r of [...refs].sort()) {
        existsSync(join(DIST, r)) ? ok(r) : bad(r + " — referenced but missing");
    }

    // The popup page's own <script src> must resolve too (the build injects the polyfill there).
    try {
        const html = readFileSync(join(DIST, manifest.action?.default_popup || "popup.html"), "utf8");
        for (const m of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) {
            existsSync(join(DIST, m[1])) ? ok("popup script " + m[1]) : bad("popup script missing: " + m[1]);
        }
    } catch (e) {
        bad("could not read popup.html: " + e.message);
    }
}

// 4. Locale messages the manifest's __MSG_*__ placeholders need.
console.log("_locales/en/messages.json:");
try {
    const msgs = JSON.parse(readFileSync(join(DIST, "_locales", "en", "messages.json"), "utf8"));
    msgs.extension_name?.message && msgs.extension_description?.message
        ? ok("extension_name + extension_description present")
        : bad("extension_name / extension_description missing (manifest __MSG_*__ would not resolve)");
} catch (e) {
    bad("missing or invalid: " + e.message);
}

// 5. Syntax-check every dist .js as ESM.
console.log("dist JS syntax (ESM):");
function walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".js")) {
            try {
                execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
                ok(p.slice(DIST.length + 1));
            } catch (e) {
                const msg = e.stderr ? e.stderr.toString().split("\n").find(Boolean) : e.message;
                bad(`${p.slice(DIST.length + 1)} — ${msg}`);
            }
        }
    }
}
walk(DIST);

console.log(`\nChrome checks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
