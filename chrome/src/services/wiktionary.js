// services/wiktionary.js — English-Wiktionary definitions for Icelandic words.
//
// JS port of WiktionaryService.swift. Service workers have no DOM, so the definition HTML is
// stripped with the same regex chain the Swift version uses (DOMParser is unavailable here and
// unnecessary). Inflected forms usually 404, so we retry lowercase, then resolve a lemma via BÍN.
//
// As in inflection.js, the descriptive User-Agent the Swift code sends is omitted: `User-Agent`
// is a forbidden fetch header and Wiktionary accepts the browser's own UA.

import { binLemma } from "./inflection.js";

const DEF_ENDPOINT = "https://en.wiktionary.org/api/rest_v1/page/definition/";
const pageLink = (w) => `https://en.wiktionary.org/wiki/${encodeURIComponent(w)}#Icelandic`;

export async function wiktionaryDefine(word) {
    const trimmed = (word || "").trim();
    if (!trimmed) return { ok: true, entries: [], sourceUrl: "" };

    let used = trimmed;
    let entries = await lookup(trimmed);

    // Inflected/cased forms often miss — widen the search.
    if (!entries.length && trimmed !== trimmed.toLowerCase()) {
        used = trimmed.toLowerCase();
        entries = await lookup(used);
    }
    if (!entries.length) {
        const lemma = await binLemma(trimmed);
        if (lemma && lemma !== trimmed) {
            used = lemma;
            entries = await lookup(lemma);
            if (!entries.length && lemma !== lemma.toLowerCase()) {
                used = lemma.toLowerCase();
                entries = await lookup(used);
            }
        }
    }

    return { ok: true, entries, sourceUrl: entries.length ? pageLink(used) : "" };
}

async function lookup(word) {
    const res = await fetch(DEF_ENDPOINT + encodeURIComponent(word), {
        signal: AbortSignal.timeout(12000),
    });
    if (res.status === 404) return []; // no entry — not an error
    if (!res.ok) throw new Error(`Definition service returned HTTP ${res.status}`);
    let data;
    try {
        data = await res.json();
    } catch {
        return [];
    }
    const isArr = data?.is; // Icelandic section only
    if (!Array.isArray(isArr)) return [];
    return isArr
        .map((entry) => ({
            partOfSpeech: entry?.partOfSpeech || "",
            definitions: (Array.isArray(entry?.definitions) ? entry.definitions : [])
                .map((d) => cleanHTML(d?.definition || ""))
                .filter((s) => s.length > 0),
        }))
        .filter((e) => e.definitions.length > 0);
}

// Mirror of the Swift regex cleaning chain: drop style/script, strip tags, decode the handful of
// entities Wiktionary emits, collapse whitespace.
function cleanHTML(html) {
    return html
        .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/[ \t\n\r]+/g, " ")
        .trim();
}
