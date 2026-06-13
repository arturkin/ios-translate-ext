// wordLookup.js — the learning feature: tap a word (or select a phrase) to get an
// instant English gloss plus a deeper "Look Up" panel (Wiktionary definition +
// BÍN inflection table).
//
// Tapping is gated behind a toggle so it never hijacks normal browsing. When the
// toggle is on, a tap on plain text looks the word up (and is swallowed), while
// taps on links/buttons pass straight through.

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

    function renderDefinition(sec, r) {
        const entries = (r && r.entries) || [];
        if (!entries.length) {
            sec.appendChild(mk("div", "muted", "No Wiktionary entry."));
        } else {
            for (const e of entries.slice(0, 4)) {
                const d = mk("div", "def");
                if (e.partOfSpeech) d.appendChild(mk("span", "pos", e.partOfSpeech));
                d.appendChild(document.createTextNode((e.definitions || []).slice(0, 3).join("; ")));
                sec.appendChild(d);
            }
        }
        if (r && r.sourceUrl) sec.appendChild(linkOut("More on Wiktionary ↗", r.sourceUrl));
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

    // Full single-word panel: gloss + definition + inflections.
    function lookupWord(word, rect) {
        const { body } = TI.ui.open(rect);
        body.appendChild(mk("div", "headword", word));
        const lemmaEl = mk("div", "lemma", "");
        body.appendChild(lemmaEl);
        const glossEl = mk("div", "gloss");
        glossEl.appendChild(TI.ui.spinner());
        body.appendChild(glossEl);

        TI.bg.translate([word], "is", "en")
            .then((t) => { glossEl.textContent = (t && t[0]) || "—"; })
            .catch((e) => { glossEl.textContent = ""; glossEl.appendChild(mk("span", "err", e.message)); });

        const S = TI.settings || {};
        if (S.useWiktionary !== false) {
            const sec = section(body, "Definition");
            const loading = mk("div", "muted");
            loading.appendChild(TI.ui.spinner());
            sec.appendChild(loading);
            TI.bg.define(word)
                .then((r) => { loading.remove(); renderDefinition(sec, r); })
                .catch(() => { loading.remove(); sec.appendChild(mk("div", "muted", "No definition found.")); });
        }
        if (S.useBin !== false) {
            const sec = section(body, "Inflections");
            const loading = mk("div", "muted");
            loading.appendChild(TI.ui.spinner());
            sec.appendChild(loading);
            TI.bg.inflect(word)
                .then((r) => {
                    loading.remove();
                    if (r.lemma && r.lemma.toLowerCase() !== word.toLowerCase()) {
                        lemmaEl.textContent = "from " + r.lemma + (r.wordClass ? " · " + r.wordClass : "");
                    } else if (r.wordClass) {
                        lemmaEl.textContent = r.wordClass;
                    }
                    renderInflection(sec, r);
                })
                .catch(() => { loading.remove(); sec.appendChild(mk("div", "muted", "No inflections found.")); });
        }
    }

    // Lightweight phrase panel: just the gloss.
    function lookupPhrase(text, rect) {
        const { body } = TI.ui.open(rect);
        const head = mk("div", "lemma", text.length > 80 ? text.slice(0, 80) + "…" : text);
        body.appendChild(head);
        const glossEl = mk("div", "gloss");
        glossEl.appendChild(TI.ui.spinner());
        body.appendChild(glossEl);
        TI.bg.translate([text], "is", "en")
            .then((t) => { glossEl.textContent = (t && t[0]) || "—"; })
            .catch((e) => { glossEl.textContent = ""; glossEl.appendChild(mk("span", "err", e.message)); });
    }

    function caretWord(x, y) {
        let node = null, offset = 0;
        if (document.caretPositionFromPoint) {
            const p = document.caretPositionFromPoint(x, y);
            if (!p) return null;
            node = p.offsetNode; offset = p.offset;
        } else if (document.caretRangeFromPoint) {
            const r = document.caretRangeFromPoint(x, y);
            if (!r) return null;
            node = r.startContainer; offset = r.startOffset;
        } else {
            return null;
        }
        if (!node || node.nodeType !== Node.TEXT_NODE) return null;
        const info = TI.ice.wordAt(node.nodeValue, offset);
        if (!info) return null;
        const range = document.createRange();
        range.setStart(node, info.start);
        range.setEnd(node, info.end);
        return { word: info.word, rect: range.getBoundingClientRect() };
    }

    const INTERACTIVE = 'a, button, input, textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"]';

    function onClick(e) {
        if (!tapEnabled) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;             // selection handler owns this
        if (e.target.closest && e.target.closest(INTERACTIVE)) return;
        const hit = caretWord(e.clientX, e.clientY);
        if (!hit || !hit.word) return;
        e.preventDefault();
        e.stopPropagation();
        lookupWord(hit.word, hit.rect);
    }

    let selTimer = null;
    function onSelectionEnd() {
        if (!tapEnabled) return;
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) return;
            const text = sel.toString().trim();
            if (text.length < 2 || !TI.ice.isLikelyIcelandic(text)) return;
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (/\s/.test(text)) lookupPhrase(text, rect);
            else lookupWord(text, rect);
        }, 20);
    }

    function setEnabled(on) {
        on = !!on;
        if (on === tapEnabled) return;
        tapEnabled = on;
        if (on) {
            document.addEventListener("click", onClick, true);
            document.addEventListener("mouseup", onSelectionEnd, true);
            document.addEventListener("touchend", onSelectionEnd, true);
        } else {
            document.removeEventListener("click", onClick, true);
            document.removeEventListener("mouseup", onSelectionEnd, true);
            document.removeEventListener("touchend", onSelectionEnd, true);
            TI.ui.hide();
        }
    }

    TI.word = { setEnabled, get enabled() { return tapEnabled; } };
})();
