// wordLookup.js — the learning feature: hold a word briefly then lift for an instant
// English gloss plus a deeper "Look Up" panel (Wiktionary definition + BÍN inflection
// table), and a "Translate" chip on any text selection.
//
// Gated behind a toggle so it never hijacks normal browsing. A quick tap passes
// straight through; holding in place (~PRESS_MS) and lifting opens the look-up;
// dragging selects text natively. We never block selection or open the popover
// mid-gesture, so a drag is never fighting an already-open popover.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    let tapEnabled = false;
    let hlStyleAdded = false;

    // Press-and-hold gesture, resolved on RELEASE. A quick tap passes through to the
    // page; holding in place ~PRESS_MS then lifting opens the look-up; dragging selects
    // text natively. We never open the popover or block selection mid-gesture, so iOS's
    // own selection is never half-engaged and there is nothing to undo if you drag.
    const PRESS_MS = 350;      // hold time before a release counts as a look-up, not a tap
    const MOVE_TOL = 10;       // px of movement that turns a press into a scroll / selection drag
    let pressTimer = null, pressX = 0, pressY = 0;
    let pressActive = false;       // finger is down on a word (a candidate gesture)
    let heldLongEnough = false;    // held >= PRESS_MS without moving → release looks it up
    let movedDuringPress = false;  // finger moved past MOVE_TOL → scroll / selection drag
    let suppressSynthetic = false; // briefly eat the click/contextmenu the OS fires after a look-up

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
        if (highlightSupported()) {
            ensureHighlightStyle();
            try { CSS.highlights.set("ti-armed", new Highlight(hit.range)); } catch (_) { /* ignore */ }
        }
    }
    function clearArmed() {
        if (highlightSupported()) { try { CSS.highlights.delete("ti-armed"); } catch (_) { /* ignore */ } }
    }
    // We only skip editable fields (so holding to place a cursor still works). A hold
    // anywhere else that lands on a real word triggers a look-up; a quick tap is left
    // for the page to handle, so we never hijack normal taps/navigation.
    const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

    function cancelPress() {
        pressActive = false;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    function onPointerDown(e) {
        if (!tapEnabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        cancelPress();
        clearArmed();
        if (TI.ui.ownsEvent && TI.ui.ownsEvent(e)) return;       // our own UI
        if (e.target.closest && e.target.closest(EDITABLE)) return;
        const hit = caretWord(e.clientX, e.clientY);
        if (!hit || !hit.word) return;                           // no word under the point
        pressX = e.clientX; pressY = e.clientY;
        pressActive = true; heldLongEnough = false; movedDuringPress = false;
        pressTimer = setTimeout(armHold, PRESS_MS);
    }

    // Held in place long enough: highlight the word so the user sees that lifting will
    // look it up. We deliberately do NOT open the popover or touch the OS selection
    // here — that is decided on release (onPointerUp), so a drag still selects natively.
    function armHold() {
        pressTimer = null;
        if (!pressActive || movedDuringPress) return;
        const hit = caretWord(pressX, pressY);
        if (!hit || !hit.word) return;                           // word vanished — let the OS handle it
        heldLongEnough = true;
        setArmed(hit);
    }

    function onPointerMove(e) {
        if (!pressActive || movedDuringPress) return;
        if (Math.abs(e.clientX - pressX) > MOVE_TOL || Math.abs(e.clientY - pressY) > MOVE_TOL) {
            movedDuringPress = true;                             // scroll / selection drag — not a look-up
            clearArmed();
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        }
    }

    function onPointerUp(e) {
        if (!pressActive) return;
        const doLookup = heldLongEnough && !movedDuringPress;
        cancelPress();
        if (!doLookup) return;                                   // tap / scroll / drag-select → leave it to the page + OS
        const hit = caretWord(pressX, pressY);
        if (!hit || !hit.word) return;
        // A deliberate hold-and-release on a word: clear the OS's transient single-word
        // selection (so its callout doesn't linger) and open our look-up instead.
        try { const s = window.getSelection(); if (s) s.removeAllRanges(); } catch (_) { /* ignore */ }
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        suppressSynthetic = true;                               // eat the click/contextmenu the OS will synthesize
        setTimeout(() => { suppressSynthetic = false; }, 500);
        setArmed(hit);
        lookupWord(hit.word, hit.rect);
    }

    // After a hold-release look-up, eat the click/contextmenu the OS still synthesizes
    // so the page (e.g. Facebook) doesn't also act on it.
    function onClickSuppress(e) {
        if (!suppressSynthetic) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    function onContextMenu(e) {
        if (suppressSynthetic) { e.preventDefault(); e.stopPropagation(); }
    }

    // --- selection "Translate" chip (works with tap mode on or off) -----------

    let selTimer = null;
    function onSelectionEnd() {
        if (pressActive) return;       // a press is mid-gesture — wait for onPointerUp to decide
        if (selTimer) clearTimeout(selTimer);
        selTimer = setTimeout(() => {
            if (TI.ui.visible) return; // a look-up popover is already open
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) { TI.ui.clearSelection(); return; }
            const text = sel.toString().trim();
            if (text.length < 2 || !TI.ice.isLikelyIcelandic(text)) { TI.ui.clearSelection(); return; }
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            const multi = /\s/.test(text);
            TI.ui.setSelection(() => { if (multi) lookupPhrase(text, rect); else lookupWord(text, rect); });
        }, 30);
    }

    // Enable/disable the whole look-up feature. Gated ON only for Icelandic pages
    // (by content.js) or when the user forces it from the popup, so English sites
    // like google.com stay untouched.
    function setEnabled(on) {
        on = !!on;
        if (on === tapEnabled) return;
        tapEnabled = on;
        if (on) {
            enableSelectability();
            document.addEventListener("pointerdown", onPointerDown, true);
            document.addEventListener("pointermove", onPointerMove, true);
            document.addEventListener("pointerup", onPointerUp, true);
            document.addEventListener("pointercancel", cancelPress, true);
            document.addEventListener("click", onClickSuppress, true);
            document.addEventListener("contextmenu", onContextMenu, true);
            document.addEventListener("mouseup", onSelectionEnd, true);
            document.addEventListener("touchend", onSelectionEnd, true);
            document.addEventListener("selectionchange", onSelectionEnd);
        } else {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("pointermove", onPointerMove, true);
            document.removeEventListener("pointerup", onPointerUp, true);
            document.removeEventListener("pointercancel", cancelPress, true);
            document.removeEventListener("click", onClickSuppress, true);
            document.removeEventListener("contextmenu", onContextMenu, true);
            document.removeEventListener("mouseup", onSelectionEnd, true);
            document.removeEventListener("touchend", onSelectionEnd, true);
            document.removeEventListener("selectionchange", onSelectionEnd);
            cancelPress();
            clearArmed();
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
