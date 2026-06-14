// content.js — bootstrap. Loads after the helper modules, pulls the user's
// defaults from the native app (via the background worker), applies them, shows
// the floating "Translate page" button on Icelandic pages, and listens for quick
// toggles coming from the toolbar popup.

(() => {
    "use strict";
    const TI = window.__TI__ || {};

    // Cheap heuristic: does the top of the page read as Icelandic? Used only to
    // decide whether to surface the floating button — the API still does the
    // authoritative detection per text node.
    // Sample up to `limit` chars of text without forcing layout (innerText) or
    // allocating the whole page's text (textContent) — matters on large pages.
    function sampleText(limit) {
        const root = document.body || document.documentElement;
        if (!root) return "";
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let out = "", n;
        while ((n = walker.nextNode())) {
            const p = n.parentElement;
            if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE" || p.tagName === "NOSCRIPT")) continue;
            const t = n.nodeValue && n.nodeValue.trim();
            if (!t) continue;
            out += t + " ";
            if (out.length >= limit) break;
        }
        return out;
    }

    function looksIcelandic() {
        try {
            const t = sampleText(2000);
            return t.length > 40 && TI.ice.isLikelyIcelandic(t);
        } catch (_) { return false; }
    }

    function syncFab() {
        if (TI.ui && TI.ui.setFabState) TI.ui.setFabState(TI.page.active);
    }

    function maybeShowFab() {
        if (window.top !== window) return;            // top frame only — no FAB in iframes
        if (!TI.ui || !TI.ui.showFab) return;
        if (TI.page.active || looksIcelandic()) {
            TI.ui.showFab((on) => { if (on) TI.page.enable(); else TI.page.revert(); });
            syncFab();
        }
    }

    const isTop = window.top === window;
    let tapSetting = true, autoSetting = false;

    // Turn look-up + the floating button on ONLY for (likely) Icelandic pages, so the
    // extension stays dormant on English sites like google.com. The popup toggles can
    // still force it on for any page.
    function activateForLanguage() {
        if (!looksIcelandic() && !TI.page.active) return;
        if (tapSetting) TI.word.setEnabled(true);
        if (autoSetting) TI.page.enable();
        if (isTop) maybeShowFab();
    }

    (async () => {
        let s = {};
        // Only the top frame asks the native side for settings — doing it in every
        // ad/tracker iframe would fan out into many native round-trips.
        if (isTop) { try { s = await TI.bg.status(); } catch (_) { /* offline / no key yet */ } }
        TI.settings = {
            useWiktionary: s.useWiktionary !== false,
            useBin: s.useBin !== false,
        };
        tapSetting = s.tapToTranslate !== false;
        autoSetting = s.autoTranslate === true;
        activateForLanguage();
        setTimeout(activateForLanguage, 1800); // SPA / lazy content settle
    })();

    // Messages from the popup. Always answer with the current page state so the
    // popup checkboxes can stay in sync.
    browser.runtime.onMessage.addListener((msg) => {
        if (!msg || !msg.command) return;
        switch (msg.command) {
            case "translatePage": TI.page.enable(); maybeShowFab(); break;
            case "revertPage": TI.page.revert(); break;
            case "setTap": TI.word.setEnabled(!!msg.enabled); break;
            case "getState": break;
        }
        syncFab();
        return Promise.resolve({
            ok: true,
            pageActive: TI.page.active,
            tap: TI.word.enabled,
        });
    });
})();
