// wordLookup.js — the learning feature: an English gloss plus a deeper "Look Up"
// panel (Glosbe dictionary link + lazy BÍN inflection table) for a selected word,
// and a "Translate" affordance on any text selection.
//
// SELECTION-DRIVEN by design. We do NOT claim the long-press gesture — iOS uses it
// to select text, and stealing it (the old press-and-hold model did) fought normal
// selecting/copying. Instead the OS selects natively and we only surface an optional
// "Look up" chip next to the selection; tapping it opens the panel. Selecting,
// copying and scrolling therefore behave exactly like a normal page.
//
// Gated behind a toggle (auto-on for Icelandic pages, or forced from the popup) so it
// stays dormant elsewhere.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    let tapEnabled = false;

    function mk(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text != null) el.textContent = text;
        return el;
    }

    function section(parent, title) {
        const sec = mk("div", "section");
        sec.appendChild(mk("h4", null, title));
        parent.appendChild(sec);
        return sec;
    }

    function linkOut(text, href) {
        const a = mk("a", "more", text);
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        return a;
    }

    // Glosbe is bilingual (is→en) and handles inflected forms with its own fuzzy
    // matching, so we link the raw word directly — no fetch, no parsing needed.
    function glosbeURL(word) {
        return "https://glosbe.com/is/en/" + encodeURIComponent(word);
    }

    function renderInflection(sec, r) {
        const forms = (r && r.forms) || [];
        if (!forms.length) {
            sec.appendChild(mk("div", "muted", "No inflection data."));
        } else {
            const table = mk("table", "infl");
            for (const f of forms.slice(0, 48)) {
                const tr = document.createElement("tr");
                const th = document.createElement("th");
                th.textContent = f.label || "";
                const td = document.createElement("td");
                td.textContent = f.form || "";
                tr.appendChild(th);
                tr.appendChild(td);
                table.appendChild(tr);
            }
            sec.appendChild(table);
        }
        if (r && r.sourceUrl) sec.appendChild(linkOut("Full table on BÍN ↗", r.sourceUrl));
    }

    // Full single-word panel: gloss + Glosbe link + lazy inflections.
    function lookupWord(word, rect) {
        const { body, reposition } = TI.ui.open(rect);
        body.appendChild(mk("div", "headword", word));
        const lemmaEl = mk("div", "lemma", "");
        body.appendChild(lemmaEl);
        const glossEl = mk("div", "gloss");
        glossEl.appendChild(TI.ui.spinner());
        body.appendChild(glossEl);

        TI.bg.translate([word], "is", "en")
            .then((t) => { glossEl.textContent = (t && t[0]) || "—"; reposition(); })
            .catch((e) => { glossEl.textContent = ""; glossEl.appendChild(mk("span", "err", e.message)); reposition(); });

        const S = TI.settings || {};

        // Dictionary: a direct Glosbe link. No network call on open — the panel stays
        // fast and clean, and Glosbe's bilingual examples are usually more useful than
        // a raw Wiktionary gloss. (Gated by the "dictionary link" setting.)
        if (S.useWiktionary !== false) {
            const sec = section(body, "Dictionary");
            sec.appendChild(linkOut("Open in Glosbe ↗", glosbeURL(word)));
        }

        // Inflections: lazy. The full BÍN table is big and slow to fetch, so by default
        // we show only a "Show inflection table" disclosure; the fetch happens on tap.
        // This keeps the modal cheap to open. The lemma line is filled in once loaded.
        if (S.useBin !== false) {
            const sec = section(body, "Inflections");
            const toggle = mk("button", "disclosure", "Show inflection table");
            toggle.type = "button";
            let loading = false;
            toggle.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (loading) return;
                loading = true;
                toggle.remove();
                const spin = mk("div", "muted");
                spin.appendChild(TI.ui.spinner());
                sec.appendChild(spin);
                reposition();
                TI.bg.inflect(word)
                    .then((r) => {
                        spin.remove();
                        if (r.lemma && r.lemma.toLowerCase() !== word.toLowerCase()) {
                            lemmaEl.textContent = "from " + r.lemma + (r.wordClass ? " · " + r.wordClass : "");
                        } else if (r.wordClass) {
                            lemmaEl.textContent = r.wordClass;
                        }
                        renderInflection(sec, r);
                        reposition();
                    })
                    .catch(() => { spin.remove(); sec.appendChild(mk("div", "muted", "No inflections found.")); reposition(); });
            });
            sec.appendChild(toggle);
        }
    }

    // Lightweight phrase panel: the gloss, plus a Glosbe link for the phrase.
    function lookupPhrase(text, rect) {
        const { body, reposition } = TI.ui.open(rect);
        const head = mk("div", "lemma", text.length > 80 ? text.slice(0, 80) + "…" : text);
        body.appendChild(head);
        const glossEl = mk("div", "gloss");
        glossEl.appendChild(TI.ui.spinner());
        body.appendChild(glossEl);
        TI.bg.translate([text], "is", "en")
            .then((t) => { glossEl.textContent = (t && t[0]) || "—"; reposition(); })
            .catch((e) => { glossEl.textContent = ""; glossEl.appendChild(mk("span", "err", e.message)); reposition(); });

        const S = TI.settings || {};
        if (S.useWiktionary !== false) {
            const sec = section(body, "Dictionary");
            sec.appendChild(linkOut("Open in Glosbe ↗", glosbeURL(text)));
        }
    }

    // --- selection "Look up" chip ---------------------------------------------
    // When the user selects Icelandic text (a word via the native long-press, or a
    // phrase by dragging), surface a chip beside it. Tapping it opens the look-up.
    // We never open anything automatically, so selection/copy/scroll are untouched.

    let selTimer = null;
    function onSelectionEnd() {
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(() => {
            if (TI.ui.visible) return; // a look-up popover is already open
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) { TI.ui.clearSelection(); return; }
            const text = sel.toString().trim();
            const multi = /\s/.test(text);
            // A single deliberately-selected token is almost always a look-up target
            // (the feature only runs on Icelandic pages, or when forced from the popup),
            // and many Icelandic words lack a þ/ð/æ or stopword that isLikelyIcelandic
            // needs — so for one word we only require it to be word-like. Multi-word
            // selections keep the stricter check, to avoid a chip on stray English text.
            const wordLike = (text.match(/[a-záéíóúýöþðæA-ZÁÉÍÓÚÝÖÞÐÆ]/g) || []).length >= 2;
            const worth = multi ? TI.ice.isLikelyIcelandic(text) : wordLike;
            if (text.length < 2 || !worth) { TI.ui.clearSelection(); return; }
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            TI.ui.showSelectionChip(
                rect,
                multi ? "Translate" : "Look up",
                () => { if (multi) lookupPhrase(text, rect); else lookupWord(text, rect); }
            );
        }, 30);
    }

    // Enable/disable the feature. Gated ON only for Icelandic pages (by content.js) or
    // when forced from the popup, so English sites stay untouched. All listeners are
    // added/removed together here.
    function setEnabled(on) {
        on = !!on;
        if (on === tapEnabled) return;
        tapEnabled = on;
        if (on) {
            enableSelectability();
            document.addEventListener("mouseup", onSelectionEnd, true);
            document.addEventListener("touchend", onSelectionEnd, true);
            document.addEventListener("selectionchange", onSelectionEnd);
        } else {
            document.removeEventListener("mouseup", onSelectionEnd, true);
            document.removeEventListener("touchend", onSelectionEnd, true);
            document.removeEventListener("selectionchange", onSelectionEnd);
            disableSelectability();
            TI.ui.clearSelection();
            TI.ui.hide();
        }
    }

    // Counter pages that block text selection (Facebook): force user-select back on
    // and neutralize their capture-phase `selectstart` handlers so a drag can start a
    // selection. We never preventDefault here — the OS selection must run freely so
    // drag-to-select works. Installed only while look-up mode is on.
    function onSelectStart(e) {
        e.stopPropagation();   // beat pages (e.g. Facebook) that cancel text selection
    }
    function enableSelectability() {
        if (!document.getElementById("ti-selectable")) {
            const st = document.createElement("style");
            st.id = "ti-selectable";
            st.textContent = "*:not(input):not(textarea){-webkit-user-select:text !important;user-select:text !important;}";
            (document.head || document.documentElement).appendChild(st);
        }
        document.addEventListener("selectstart", onSelectStart, true);
    }
    function disableSelectability() {
        const st = document.getElementById("ti-selectable");
        if (st) st.remove();
        document.removeEventListener("selectstart", onSelectStart, true);
    }

    TI.word = { setEnabled, get enabled() { return tapEnabled; } };
})();
