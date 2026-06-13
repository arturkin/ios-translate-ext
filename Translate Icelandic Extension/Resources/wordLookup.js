// wordLookup.js — the learning feature: tap a word (two taps) for an instant
// English gloss plus a deeper "Look Up" panel (Wiktionary definition + BÍN
// inflection table), and a "Translate" chip on any text selection.
//
// Tapping is gated behind a toggle so it never hijacks normal browsing. When the
// toggle is on, the FIRST tap on a word highlights it and the SECOND tap on the
// same word looks it up (and is swallowed); taps on links/buttons pass through.
// The selection "Translate" chip works regardless of the tap toggle.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    let tapEnabled = false;
    let armed = null;          // { word, rect, range } awaiting a confirming second tap
    let hlStyleAdded = false;

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
            for (const e of entries.slice(0, 6)) {
                const d = mk("div", "def");
                if (e.partOfSpeech) d.appendChild(mk("span", "pos", e.partOfSpeech));
                const defs = (e.definitions || []).slice(0, 6);
                if (defs.length <= 1) {
                    d.appendChild(document.createTextNode(defs[0] || "—"));
                } else {
                    // Multiple senses → show them as a numbered list, not a run-on line.
                    const ol = mk("ol", "defs");
                    for (const def of defs) ol.appendChild(mk("li", null, def));
                    d.appendChild(ol);
                }
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
        if (S.useWiktionary !== false) {
            const sec = section(body, "Definition");
            const loading = mk("div", "muted");
            loading.appendChild(TI.ui.spinner());
            sec.appendChild(loading);
            TI.bg.define(word)
                .then((r) => { loading.remove(); renderDefinition(sec, r); reposition(); })
                .catch(() => { loading.remove(); sec.appendChild(mk("div", "muted", "No definition found.")); reposition(); });
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
                    reposition();
                })
                .catch(() => { loading.remove(); sec.appendChild(mk("div", "muted", "No inflections found.")); reposition(); });
        }
    }

    // Lightweight phrase panel: just the gloss.
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
        return { word: info.word, rect: range.getBoundingClientRect(), range };
    }

    // --- armed-word highlight (first tap) -------------------------------------
    // Uses the CSS Custom Highlight API (Safari/iOS 17.4+) so we never touch the
    // page DOM. A no-op highlight is fine on the rare engine that lacks it.

    function highlightSupported() {
        return typeof window.CSS !== "undefined" && !!CSS.highlights && typeof Highlight !== "undefined";
    }
    function ensureHighlightStyle() {
        if (hlStyleAdded || !highlightSupported()) return;
        const st = mk("style");
        st.textContent = "::highlight(ti-armed){ background-color: rgba(0,122,255,.28); border-radius: 3px; }";
        (document.head || document.documentElement).appendChild(st);
        hlStyleAdded = true;
    }
    function setArmed(hit) {
        armed = hit;
        if (highlightSupported()) {
            ensureHighlightStyle();
            try { CSS.highlights.set("ti-armed", new Highlight(hit.range)); } catch (_) { /* ignore */ }
        }
    }
    function clearArmed() {
        armed = null;
        if (highlightSupported()) { try { CSS.highlights.delete("ti-armed"); } catch (_) { /* ignore */ } }
    }
    function sameHit(a, b) {
        if (!a || !b || a.word !== b.word) return false;
        // Compare by on-screen position, not node identity: dynamic pages (and our
        // own page-translator) can replace the text node between the two taps.
        return Math.abs(a.rect.left - b.rect.left) < 12 && Math.abs(a.rect.top - b.rect.top) < 12;
    }

    const INTERACTIVE = 'a, button, input, textarea, select, [role="button"], [contenteditable=""], [contenteditable="true"]';

    function onClick(e) {
        if (!tapEnabled) return;
        if (TI.ui.ownsEvent && TI.ui.ownsEvent(e)) return; // taps on our own UI
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;               // selection chip owns this
        if (e.target.closest && e.target.closest(INTERACTIVE)) return;
        const hit = caretWord(e.clientX, e.clientY);
        if (!hit || !hit.word) { clearArmed(); return; }
        e.preventDefault();
        e.stopPropagation();
        if (sameHit(armed, hit)) {
            const word = hit.word, rect = hit.rect;        // confirmed: second tap
            clearArmed();
            lookupWord(word, rect);
        } else {
            setArmed(hit);                                 // first tap: highlight only
        }
    }

    // --- selection "Translate" chip (works with tap mode on or off) -----------

    let selTimer = null;
    function onSelectionEnd() {
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(() => {
            if (TI.ui.visible) return;     // a lookup popover is already open
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) { TI.ui.hideSelectionButton(); return; }
            const text = sel.toString().trim();
            if (text.length < 2 || !TI.ice.isLikelyIcelandic(text)) { TI.ui.hideSelectionButton(); return; }
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            const multi = /\s/.test(text);
            TI.ui.showSelectionButton(() => { if (multi) lookupPhrase(text, rect); else lookupWord(text, rect); });
        }, 30);
    }

    function setEnabled(on) {
        on = !!on;
        if (on === tapEnabled) return;
        tapEnabled = on;
        if (on) {
            document.addEventListener("click", onClick, true);
        } else {
            document.removeEventListener("click", onClick, true);
            clearArmed();
            TI.ui.hide();
        }
    }

    // Selection handling is always active — independent of the tap toggle.
    document.addEventListener("mouseup", onSelectionEnd, true);
    document.addEventListener("touchend", onSelectionEnd, true);
    document.addEventListener("selectionchange", onSelectionEnd); // catches iOS handle drags

    TI.word = { setEnabled, get enabled() { return tapEnabled; } };
})();
