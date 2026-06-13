// ui.js — all on-page UI (the word "Look Up" popover, a floating "Translate
// page" button, and transient toasts).
//
// Everything is rendered inside a Shadow DOM so that hostile page CSS (Facebook,
// etc.) can neither style our UI nor be broken by it. There is a single shared
// popover; callers get a scrollable body element and fill it in.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    const CSS = `
        :host { all: initial; }
        .card {
            position: fixed; z-index: 2147483647; box-sizing: border-box;
            display: flex; flex-direction: column;
            max-width: min(360px, 92vw); max-height: 70vh;
            font: 15px/1.4 -apple-system, system-ui, sans-serif;
            color: #1c1c1e; background: #fff;
            border-radius: 14px;
            box-shadow: 0 8px 30px rgba(0,0,0,.28);
        }
        .body {
            flex: 1 1 auto; min-height: 0;
            overflow: auto; overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            padding: 12px 14px;
        }
        .close {
            position: absolute; top: 7px; right: 7px; z-index: 2;
            width: 28px; height: 28px; padding: 0; border: none;
            border-radius: 50%; background: rgba(120,120,128,.16);
            color: #8e8e93; font: 600 17px/1 -apple-system, system-ui, sans-serif;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; -webkit-tap-highlight-color: transparent;
        }
        .close:active { background: rgba(120,120,128,.32); }
        .headword { font-size: 20px; font-weight: 700; margin: 0 0 2px; padding-right: 30px; }
        .lemma { font-size: 13px; color: #8e8e93; margin: 0 0 8px; }
        .gloss { font-size: 17px; font-weight: 500; margin: 0 0 10px; }
        .section { border-top: 1px solid rgba(0,0,0,.08); padding-top: 8px; margin-top: 8px; }
        .section h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: .04em;
            text-transform: uppercase; color: #8e8e93; font-weight: 600; }
        .def { margin: 0 0 8px; }
        .def .pos { font-style: italic; color: #8e8e93; margin-right: 4px; }
        ol.defs { margin: 4px 0 0; padding-left: 20px; }
        ol.defs li { margin: 0 0 3px; }
        table.infl { border-collapse: collapse; width: 100%; font-size: 13px; }
        table.infl th, table.infl td { border: 1px solid rgba(0,0,0,.1);
            padding: 3px 6px; text-align: left; }
        table.infl th { background: rgba(0,0,0,.04); font-weight: 600; }
        a.more { color: #007aff; text-decoration: none; font-size: 13px;
            display: inline-block; margin-top: 4px; }
        .muted { color: #8e8e93; font-size: 13px; }
        .err { color: #ff3b30; font-size: 13px; }
        .spin { display: inline-block; width: 15px; height: 15px; vertical-align: -2px;
            border: 2px solid rgba(0,0,0,.15); border-top-color: #007aff;
            border-radius: 50%; animation: ti-spin .8s linear infinite; }
        @keyframes ti-spin { to { transform: rotate(360deg); } }
        .fab {
            position: fixed; right: 16px; bottom: 10px; z-index: 2147483646;
            display: flex; align-items: center; justify-content: center;
            width: 48px; height: 48px; padding: 0;
            font-size: 22px; line-height: 1;
            color: #fff; background: #007aff; border: none;
            border-radius: 50%; cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,.3);
            -webkit-tap-highlight-color: transparent;
            transition: background .15s ease;
        }
        .fab.on { background: #34c759; }
        .selbtn {
            position: fixed; right: 16px; bottom: 70px; z-index: 2147483646;
            display: flex; align-items: center; gap: 7px;
            font: 600 14px/1 -apple-system, system-ui, sans-serif;
            color: #fff; background: #007aff; border: none;
            padding: 11px 15px; border-radius: 22px; cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,.3);
            -webkit-tap-highlight-color: transparent;
        }
        .selbtn-ic { font-size: 15px; }
        .toast {
            position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
            z-index: 2147483647; max-width: 80vw;
            font: 14px/1.3 -apple-system, system-ui, sans-serif; color: #fff;
            background: rgba(28,28,30,.95); padding: 9px 14px; border-radius: 10px;
            box-shadow: 0 4px 16px rgba(0,0,0,.3);
        }
        .toast.err { background: rgba(200,40,30,.96); }
        @media (prefers-color-scheme: dark) {
            .card { color: #f2f2f7; background: #1c1c1e;
                box-shadow: 0 8px 30px rgba(0,0,0,.6); }
            .close { background: rgba(120,120,128,.28); color: #c7c7cc; }
            .section { border-top-color: rgba(255,255,255,.12); }
            table.infl th, table.infl td { border-color: rgba(255,255,255,.16); }
            table.infl th { background: rgba(255,255,255,.06); }
        }
    `;

    let host, shadow, card, body, visible = false, gen = 0;
    let fab = null, fabState = false, fabOnToggle = null;
    let selBtn = null, selOnTap = null;

    function ensure() {
        if (host) return;
        host = document.createElement("div");
        shadow = host.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = CSS;
        shadow.appendChild(style);
        card = document.createElement("div");
        card.className = "card";
        card.style.display = "none";
        shadow.appendChild(card);
        document.documentElement.appendChild(host);

        document.addEventListener("pointerdown", onOutside, true);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, true);
        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize, true);
    }

    function onOutside(e) {
        if (!visible) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(host)) return;
        hide();
    }

    // Whether an event originated inside our own shadow UI.
    function ownsEvent(e) {
        if (!host) return false;
        const path = e.composedPath ? e.composedPath() : [];
        return path.includes(host);
    }

    // Hide when the underlying page scrolls, but NOT when the user scrolls inside
    // our own popover — in that case the event path runs through our host/card.
    function selShown() { return !!selBtn && selBtn.style.display !== "none"; }

    function onScroll(e) {
        if (!visible && !selShown()) return;   // nothing on screen → cheap exit
        if (ownsEvent(e)) return;
        hide();
        hideSelectionButton();
    }

    function onResize() {
        hide();
        hideSelectionButton();
    }

    function place(rect) {
        const m = 8, vw = window.innerWidth, vh = window.innerHeight;
        const w = card.offsetWidth, h = card.offsetHeight;
        let left = rect.left + rect.width / 2 - w / 2;
        left = Math.max(m, Math.min(left, vw - w - m));
        let top = rect.bottom + m;
        if (top + h > vh - m) top = rect.top - h - m;
        if (top < m) top = m;
        card.style.left = left + "px";
        card.style.top = top + "px";
    }

    // Open (or reuse) the popover anchored to `rect`. Returns the scrollable body
    // element to fill plus a reposition() to call after async content loads.
    function open(rect) {
        ensure();
        hideSelectionButton();
        const myGen = ++gen; // invalidate late callbacks from a previous lookup
        card.innerHTML = "";
        card.style.display = "flex";

        const close = document.createElement("button");
        close.className = "close";
        close.type = "button";
        close.setAttribute("aria-label", "Close");
        close.textContent = "✕";
        close.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); hide(); });
        card.appendChild(close);

        body = document.createElement("div");
        body.className = "body";
        card.appendChild(body);

        visible = true;
        requestAnimationFrame(() => place(rect));
        return {
            body,
            reposition: () => { if (myGen === gen) requestAnimationFrame(() => place(rect)); },
        };
    }

    function hide() {
        if (!card) return;
        gen++; // any in-flight lookup's reposition() becomes a no-op
        card.style.display = "none";
        card.innerHTML = "";
        body = null;
        visible = false;
    }

    // --- Floating "Translate page" button -------------------------------------

    function renderFab() {
        if (!fab) return;
        fab.classList.toggle("on", fabState);
        fab.setAttribute("aria-pressed", String(fabState));
        const label = fabState ? "Show original" : "Translate page";
        fab.setAttribute("aria-label", label);
        fab.title = label;
        fab.textContent = fabState ? "↩" : "🇮🇸"; // ↩ : 🇮🇸
    }

    // Show the floating button. `onToggle(on)` fires on each tap with the new state.
    function showFab(onToggle) {
        ensure();
        fabOnToggle = onToggle;
        if (!fab) {
            fab = document.createElement("button");
            fab.className = "fab";
            fab.type = "button";
            fab.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                fabState = !fabState;
                renderFab();
                if (fabOnToggle) fabOnToggle(fabState);
            });
            shadow.appendChild(fab);
        }
        fab.style.display = "flex";
        renderFab();
    }

    function setFabState(on) { fabState = !!on; renderFab(); }
    function hideFab() { if (fab) fab.style.display = "none"; }

    // --- Selection "Translate" chip -------------------------------------------
    // A small button shown next to a text selection; tapping it runs `onTap`.

    function showSelectionButton(onTap) {
        ensure();
        selOnTap = onTap;
        if (!selBtn) {
            selBtn = document.createElement("button");
            selBtn.className = "selbtn";
            selBtn.type = "button";
            // Keep the page selection alive when the chip is pressed.
            selBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); }, true);
            selBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const cb = selOnTap;
                hideSelectionButton();
                if (cb) cb();
            });
            const ic = document.createElement("span");
            ic.className = "selbtn-ic";
            ic.textContent = "🇮🇸";
            const tx = document.createElement("span");
            tx.textContent = "Translate selection";
            selBtn.appendChild(ic);
            selBtn.appendChild(tx);
            shadow.appendChild(selBtn);
        }
        // Pinned bottom-right, above the page button. The iOS selection callout
        // hugs the selection (above or below it), so a fixed corner never collides.
        selBtn.style.display = "flex";
    }

    function hideSelectionButton() {
        selOnTap = null;
        if (selBtn) selBtn.style.display = "none";
    }

    function toast(message, kind) {
        ensure();
        const t = document.createElement("div");
        t.className = "toast" + (kind === "err" ? " err" : "");
        t.textContent = message;
        shadow.appendChild(t);
        setTimeout(() => t.remove(), 3200);
    }

    function spinner() {
        const s = document.createElement("span");
        s.className = "spin";
        return s;
    }

    TI.ui = {
        open, hide, toast, spinner, ownsEvent,
        showFab, hideFab, setFabState,
        showSelectionButton, hideSelectionButton,
        get visible() { return visible; },
    };
})();
