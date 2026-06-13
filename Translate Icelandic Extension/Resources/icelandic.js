// icelandic.js — language heuristics and word segmentation.
//
// We translate Icelandic, not English, so before sending text to the (metered)
// translation API we cheaply guess whether a string is likely Icelandic. This is
// a heuristic, not a classifier: the goal is to skip the obviously-English text on
// mixed pages (Facebook, comment threads) and save quota. The API still does the
// authoritative detection.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    // þ, ð, æ almost never occur in English — their presence is a strong signal.
    const STRONG = /[þðæÞÐÆ]/;
    const ACCENTED = /[áéíóúýöÁÉÍÓÚÝÖ]/g;
    const IS_LETTER = /[a-záéíóúýöþðæA-ZÁÉÍÓÚÝÖÞÐÆ]/;

    // High-frequency Icelandic function words. A couple of these in a sentence is
    // a reliable tell even without special characters.
    const STOPWORDS = new Set([
        "og", "að", "er", "ekki", "það", "við", "sem", "á", "í", "með", "til",
        "en", "um", "hann", "hún", "var", "hafa", "þú", "ég", "þetta", "eða",
        "fyrir", "þegar", "þeir", "þær", "þau", "hér", "þar", "nú", "svo", "líka",
        "bara", "mjög", "allt", "alla", "líf", "fólk", "maður", "góður", "vera",
        "verið", "kemur", "koma", "gera", "gert", "sagði", "segir", "frá", "yfir"
    ]);

    function words(text) {
        return text.toLowerCase().split(/[^a-záéíóúýöþðæ]+/).filter(Boolean);
    }

    // Returns true when `text` looks like Icelandic worth translating.
    function isLikelyIcelandic(text) {
        if (!text) return false;
        const letters = (text.match(/[a-záéíóúýöþðæA-ZÁÉÍÓÚÝÖÞÐÆ]/g) || []).length;
        if (letters < 2) return false;
        if (STRONG.test(text)) return true;

        const ws = words(text);
        if (!ws.length) return false;

        let stop = 0;
        for (const w of ws) if (STOPWORDS.has(w)) stop++;
        const accents = (text.match(ACCENTED) || []).length;

        if (stop >= 2) return true;
        if (stop >= 1 && accents >= 1) return true;
        if (ws.length >= 4 && stop / ws.length >= 0.25) return true;
        return false;
    }

    // Locale-aware word segmentation, used to find the word under a tap. Falls back
    // to a regex split where Intl.Segmenter is unavailable.
    let segmenter = null;
    function getSegmenter() {
        if (segmenter !== null) return segmenter;
        try {
            segmenter = new Intl.Segmenter("is", { granularity: "word" });
        } catch (_) {
            segmenter = false;
        }
        return segmenter;
    }

    // Given a text string and a character offset, return the word (and its bounds)
    // that contains that offset, or null.
    function wordAt(text, offset) {
        if (!text) return null;
        const seg = getSegmenter();
        if (seg) {
            for (const s of seg.segment(text)) {
                if (!s.isWordLike) continue;
                const start = s.index;
                const end = s.index + s.segment.length;
                if (offset >= start && offset <= end) {
                    return { word: s.segment, start, end };
                }
            }
            return null;
        }
        // Fallback: expand around the offset over letter characters.
        let start = offset, end = offset;
        while (start > 0 && IS_LETTER.test(text[start - 1])) start--;
        while (end < text.length && IS_LETTER.test(text[end])) end++;
        if (end <= start) return null;
        return { word: text.slice(start, end), start, end };
    }

    TI.ice = { isLikelyIcelandic, wordAt };
})();
