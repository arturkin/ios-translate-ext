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

    // Returns true when a SHORT string (a tapped word, a selection, one text node)
    // looks like Icelandic worth translating. Deliberately sensitive: a single þ/ð/æ
    // in a short string is a strong tell. Used per-node by the page translator and on
    // the selection chip — NOT for deciding whether a whole page is Icelandic (that is
    // isLikelyIcelandicPage, which needs a density of signal, not mere presence).
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

    // Returns true only when a PAGE-SIZED sample reads as genuinely Icelandic.
    //
    // This is the strict gate for surfacing the floating "Translate page" button and
    // auto-enabling look-up — it must stay dormant on English pages. The single-char
    // rule that isLikelyIcelandic uses is wrong here: English pages routinely carry a
    // stray þ/ð/æ (a name like "Þór"), an accent ("café", "naïve"), or a token like
    // "var", and one such hit must NOT flip a whole English page to "Icelandic".
    //
    // Real Icelandic running text is DENSE in both function words (og/að/er/í/á/…) and
    // in þ/ð/æ, so we require a real ratio of each, over enough words to be meaningful —
    // not just presence. A predominantly-English page with an island of Icelandic stays
    // below the bar (the user can still force look-up from the popup, or select the
    // Icelandic text to get the chip).
    function isLikelyIcelandicPage(text) {
        if (!text) return false;
        const ws = words(text);
        const n = ws.length;
        if (n < 12) return false;                 // too little text to judge a "page"

        let stop = 0, special = 0;
        for (const w of ws) {
            if (STOPWORDS.has(w)) stop++;
            if (STRONG.test(w)) special++;
        }
        const stopRatio = stop / n;
        const specialRatio = special / n;

        if (stop >= 4 && stopRatio >= 0.06) return true;        // clear function-word density
        if (special >= 5 && specialRatio >= 0.04) return true;  // clear þ/ð/æ density
        // Both present at a moderate level together (handles shorter samples).
        if (stop >= 3 && special >= 3 && stopRatio + specialRatio >= 0.08) return true;
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

    TI.ice = { isLikelyIcelandic, isLikelyIcelandicPage, wordAt };
})();
