// content.js — bootstrap. Loads after the helper modules, pulls the user's
// defaults from the native app (via the background worker), applies them, and
// listens for quick toggles coming from the toolbar popup.

(() => {
    "use strict";
    const TI = window.__TI__ || {};

    (async () => {
        let s = {};
        try { s = await TI.bg.status(); } catch (_) { /* offline / no key yet */ }
        TI.settings = {
            useWiktionary: s.useWiktionary !== false,
            useBin: s.useBin !== false,
        };
        if (s.tapToTranslate !== false) TI.word.setEnabled(true); // default ON
        if (s.autoTranslate === true) TI.page.enable();
    })();

    // Messages from the popup. Always answer with the current page state so the
    // popup checkboxes can stay in sync.
    browser.runtime.onMessage.addListener((msg) => {
        if (!msg || !msg.command) return;
        switch (msg.command) {
            case "translatePage": TI.page.enable(); break;
            case "revertPage": TI.page.revert(); break;
            case "setTap": TI.word.setEnabled(!!msg.enabled); break;
            case "getState": break;
        }
        return Promise.resolve({
            ok: true,
            pageActive: TI.page.active,
            tap: TI.word.enabled,
        });
    });
})();
