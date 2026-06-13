// background.js — the only context allowed to talk to the native app handler.
//
// Responsibilities:
//   • Route content-script requests (translate / define / inflect / status) to the
//     native Swift handler via browser.runtime.sendNativeMessage.
//   • Cache translations (persisted in storage.local) so repeated text and
//     re-translates don't burn Azure quota.
//   • De-duplicate texts within a single translate request.

const NATIVE_APP = "application.id"; // Safari ignores this identifier; any string works.
const CACHE_KEY = "trcache";
const CACHE_MAX = 3000;

const trCache = new Map();             // "is\nen\ntext" -> translated string
const defCache = new Map();            // word -> define response
const inflCache = new Map();           // word -> inflect response

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

async function native(message) {
    let resp;
    try {
        resp = await browser.runtime.sendNativeMessage(NATIVE_APP, message);
    } catch (e) {
        throw new Error("native bridge failed: " + (e && e.message ? e.message : e));
    }
    if (!resp || resp.ok !== true) {
        throw new Error((resp && resp.error) || "native handler error");
    }
    return resp;
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
        const resp = await native({ type: "translate", payload: { texts: uniq, from, to } });
        const translated = resp.translations || [];
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
        case "define": {
            const word = (msg.payload && msg.payload.word) || "";
            return cached(defCache, word,
                () => native({ type: "define", payload: { word } }),
                (r) => Array.isArray(r.entries) && r.entries.length > 0);
        }
        case "inflect": {
            const word = (msg.payload && msg.payload.word) || "";
            return cached(inflCache, word,
                () => native({ type: "inflect", payload: { word } }),
                (r) => Array.isArray(r.forms) && r.forms.length > 0);
        }
        case "status":
            return native({ type: "status", payload: {} });
        default:
            return Promise.resolve({ ok: false, error: "unknown type: " + msg.type });
    }
}

browser.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return; // not one of ours
    // Promise.resolve so a synchronous throw in handle() still becomes a rejected
    // response instead of hanging the caller until its timeout.
    try {
        return Promise.resolve(handle(msg)).catch((e) => ({ ok: false, error: e.message }));
    } catch (e) {
        return Promise.resolve({ ok: false, error: e.message });
    }
});
