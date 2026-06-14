// services/inflection.js — BÍN inflection tables via the ylhyra API.
//
// JS port of InflectionService.swift. Two-step flow: search the word to get its lemma + BÍN id,
// then fetch the full paradigm by id. Falls back to a BÍN page link when the API has nothing.
//
// Note: the Swift version sends a descriptive User-Agent. `User-Agent` is a forbidden header for
// fetch() in the browser (silently dropped), and ylhyra only blocks blank/library agents, not the
// browser's own UA, so it is simply omitted here.

const API = "https://ylhyra.is/api/inflection";
const binLink = (w) => `https://bin.arnastofnun.is/leit/${encodeURIComponent(w)}`;

export async function binInflect(word) {
    const w = (word || "").trim();
    if (!w) return { ok: true, lemma: "", wordClass: "", forms: [], sourceUrl: "" };

    // Step 1 — resolve lemma + BIN_id.
    const search = await api({ search: w, type: "flat" });
    const results = Array.isArray(search?.results) ? search.results : [];
    const first = results.find((r) => typeof r?.BIN_id === "number");
    if (!first) {
        // No structured match — still hand back a BÍN link the user can open.
        return { ok: true, lemma: w, wordClass: "", forms: [], sourceUrl: binLink(w) };
    }
    const lemma = first.base_word || w;
    const wordClass = Array.isArray(first.word_categories) ? first.word_categories.join(" · ") : "";

    // Step 2 — full paradigm by id.
    const paradigm = await api({ id: String(first.BIN_id), type: "flat" });
    const rows = Array.isArray(paradigm?.results) ? paradigm.results : [];
    const seen = new Set();
    const forms = [];
    for (const r of rows) {
        const form = r?.inflectional_form;
        const cats = r?.inflectional_form_categories;
        if (!form || !Array.isArray(cats)) continue;
        const label = cats.join(" · ");
        const key = label + "" + form;
        if (seen.has(key)) continue;
        seen.add(key);
        forms.push({ label, form });
    }

    return { ok: true, lemma, wordClass, forms, sourceUrl: binLink(lemma) };
}

// Lemma resolution used by the Wiktionary inflected-form fallback. Returns null on any failure.
export async function binLemma(word) {
    try {
        const s = await api({ search: word, type: "flat" });
        return s?.results?.[0]?.base_word ?? null;
    } catch {
        return null;
    }
}

async function api(params) {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API}?${qs}`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error("Unexpected response from the inflection service.");
    return res.json();
}
