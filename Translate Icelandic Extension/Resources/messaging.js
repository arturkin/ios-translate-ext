// messaging.js — thin promise wrapper used by content-script modules to talk to
// the background service worker. The background worker is the only place allowed
// to call the native handler (browser.runtime.sendNativeMessage), so everything
// the page needs (translate / define / inflect / status) flows through here.
//
// Shared state for all content-script files lives on `window.__TI__`. Each module
// is wrapped in an IIFE and only exposes its public API via that namespace, so the
// files stay isolated even though Safari runs them in one shared world.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    // Send a typed request to the background worker and resolve with its payload.
    // The background always answers with { ok, ... }. We unwrap errors into rejects
    // so callers can use try/await.
    async function request(type, payload) {
        let response;
        try {
            response = await browser.runtime.sendMessage({ type, payload });
        } catch (e) {
            throw new Error("extension messaging failed: " + (e && e.message ? e.message : e));
        }
        if (!response || response.ok !== true) {
            throw new Error((response && response.error) || "unknown background error");
        }
        return response;
    }

    TI.bg = {
        // texts: string[] -> string[] (aligned to input order)
        translate: (texts, from = "is", to = "en") =>
            request("translate", { texts, from, to }).then((r) => r.translations),
        // word -> { definitions, sourceUrl }
        define: (word) => request("define", { word }),
        // word -> { lemma, tables, sourceUrl }
        inflect: (word) => request("inflect", { word }),
        // -> { provider, hasKey, region }
        status: () => request("status", {}),
    };
})();
