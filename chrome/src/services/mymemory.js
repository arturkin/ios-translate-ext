// services/mymemory.js — keyless fallback backend (MyMemory).
//
// JS port of FallbackTranslationProvider.swift. Used when no Azure key is baked in, so a fresh
// clone with no config still translates. Texts are sent one at a time to stay within the
// anonymous rate limit; on a per-item failure the original text is returned so the background
// cache layer can detect and retry it later (it never caches a source==translation no-op as a hit
// only because doTranslate caches non-empty strings — see background.js).

const ENDPOINT = "https://api.mymemory.translated.net/get";

// texts: string[] -> string[] aligned to input order.
export async function myMemoryTranslate(texts, from, to) {
    const langpair = `${from}|${to}`;
    const out = [];
    let lastErr = null;
    let anyOk = false;

    for (const text of texts) {
        try {
            out.push(await translateOne(text, langpair));
            anyOk = true;
        } catch (e) {
            lastErr = e;
            out.push(text); // fall back to the source text
        }
    }

    // Only surface an error if every request failed — partial successes still return.
    if (!anyOk && texts.length && lastErr) throw lastErr;
    return out;
}

async function translateOne(text, langpair) {
    const url =
        `${ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(langpair)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Translation service returned HTTP ${res.status}`);
    let obj;
    try {
        obj = await res.json();
    } catch {
        throw new Error("Unexpected response from the translation service.");
    }
    const tr = obj?.responseData?.translatedText;
    if (typeof tr !== "string") {
        throw new Error("Unexpected response from the translation service.");
    }
    return tr;
}
