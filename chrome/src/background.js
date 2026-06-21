// background.js — Chrome service worker. THE PLATFORM SEAM.
//
// In the Safari build the equivalent file relays every request to the native Swift handler via
// browser.runtime.sendNativeMessage, and Swift reads the key + makes the network calls. Chrome has
// no native app, so this worker calls the four web APIs directly with fetch() (allowed cross-origin
// from the worker via manifest host_permissions — no CORS, no DOM needed). Everything else is the
// same as the Safari background.js: the message router, the persisted translation cache, the
// per-word inflect memo cache, and the never-cache-empty rules.

import "./browser-polyfill.min.js"; // sets globalThis.browser (promise-based browser.* in Chrome)
import { azureTranslate } from "./services/azure.js";
import { myMemoryTranslate } from "./services/mymemory.js";
import { binInflect } from "./services/inflection.js";
import { getSettings, hasAzureKey, statusResponse } from "./services/settings.js";

const CACHE_KEY = "trcache";
const CACHE_MAX = 3000;

const trCache = new Map();   // "is\nen\ntext" -> translated string
const inflCache = new Map(); // word -> inflect response

const cacheReady = (async () => {
    try {
        const stored = await browser.storage.local.get(CACHE_KEY);
        const obj = stored && stored[CACHE_KEY];
        if (obj) for (const k of Object.keys(obj)) trCache.set(k, obj[k]);
    } catch (_) { /* fresh start */ }
})();

let saveTimer = null;
function saveCacheSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(async () => {
        saveTimer = null;
        // Trim to the most-recent CACHE_MAX entries (Map keeps insertion order).
        while (trCache.size > CACHE_MAX) trCache.delete(trCache.keys().next().value);
        const obj = {};
        for (const [k, v] of trCache) obj[k] = v;
        try { await browser.storage.local.set({ [CACHE_KEY]: obj }); } catch (_) { /* ignore */ }
    }, 1000);
}

const ck = (from, to, text) => from + "\n" + to + "\n" + text;

// The seam: translate via the configured backend (Azure when a key is baked, else MyMemory).
async function translateTexts(texts, from, to) {
    return hasAzureKey()
        ? azureTranslate(texts, from, to, getSettings())
        : myMemoryTranslate(texts, from, to);
}

async function doTranslate(p) {
    await cacheReady;
    const texts = (p && p.texts) || [];
    const from = (p && p.from) || "is";
    const to = (p && p.to) || "en";
    const out = new Array(texts.length);
    const needIdx = [];
    texts.forEach((t, i) => {
        const hit = trCache.get(ck(from, to, t));
        if (hit !== undefined) out[i] = hit;
        else needIdx.push(i);
    });

    if (needIdx.length) {
        const uniq = [];
        const seen = new Set();
        for (const i of needIdx) {
            const t = texts[i];
            if (!seen.has(t)) { seen.add(t); uniq.push(t); }
        }
        const translated = await translateTexts(uniq, from, to);
        uniq.forEach((t, k) => {
            const tr = translated[k];
            // Only cache real translations — never an empty string (a parse miss or
            // provider failure), which would otherwise poison the cache permanently.
            if (typeof tr === "string" && tr !== "") trCache.set(ck(from, to, t), tr);
        });
        saveCacheSoon();
        for (const i of needIdx) {
            const v = trCache.get(ck(from, to, texts[i]));
            out[i] = (v !== undefined) ? v : texts[i]; // fall back to source on miss
        }
    }
    return { ok: true, translations: out };
}

async function cached(map, key, fn, worthCaching) {
    if (map.has(key)) return map.get(key);
    const r = await fn();
    // Don't memoize empty/negative results, so a transient miss (e.g. a 404 blip)
    // can be retried instead of being stuck for the lifetime of the worker.
    if (!worthCaching || worthCaching(r)) map.set(key, r);
    return r;
}

function handle(msg) {
    switch (msg.type) {
        case "translate":
            return doTranslate(msg.payload);
        case "inflect": {
            const word = (msg.payload && msg.payload.word) || "";
            return cached(inflCache, word,
                () => binInflect(word),
                (r) => Array.isArray(r.forms) && r.forms.length > 0);
        }
        case "status":
            return Promise.resolve(statusResponse());
        default:
            return Promise.resolve({ ok: false, error: "unknown type: " + msg.type });
    }
}

browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return; // not one of ours
    // Promise.resolve so a synchronous throw in handle() still becomes a rejected
    // response instead of hanging the caller until its timeout. The webextension-polyfill
    // makes a returned Promise reply correctly in Chrome (raw chrome.* would not).
    try {
        return Promise.resolve(handle(msg)).catch((e) => ({ ok: false, error: e.message }));
    } catch (e) {
        return Promise.resolve({ ok: false, error: e.message });
    }
});
