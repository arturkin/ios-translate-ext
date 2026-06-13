// ui.js — all on-page UI (the word "Look Up" popover and transient toasts).
//
// Everything is rendered inside a Shadow DOM so that hostile page CSS (Facebook,
// etc.) can neither style our UI nor be broken by it. There is a single shared
// popover; callers get its body element and fill it in.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    const CSS = `
        :host { all: initial; }
        .card {
            position: fixed; z-index: 2147483647; box-sizing: border-box;
            max-width: min(360px, 92vw); max-height: 70vh; overflow: auto;
            font: 15px/1.4 -apple-system, system-ui, sans-serif;
            color: #1c1c1e; background: #fff;
            border-radius: 14px; padding: 12px 14px;
            box-shadow: 0 8px 30px rgba(0,0,0,.28); -webkit-overflow-scrolling: touch;
        }
        .headword { font-size: 20px; font-weight: 700; margin: 0 0 2px; }
        .lemma { font-size: 13px; color: #8e8e93; margin: 0 0 8px; }
        .gloss { font-size: 17px; font-weight: 500; margin: 0 0 10px; }
        .section { border-top: 1px solid rgba(0,0,0,.08); padding-top: 8px; margin-top: 8px; }
        .section h4 { margin: 0 0 6px; font-size: 12px; letter-spacing: .04em;
            text-transform: uppercase; color: #8e8e93; font-weight: 600; }
        .def { margin: 0 0 6px; }
        .def .pos { font-style: italic; color: #8e8e93; margin-right: 4px; }
        table.infl { border-collapse: collapse; width: 100%; font-size: 13px; }
        table.infl th, table.infl td { border: 1px solid rgba(0,0,0,.1);
            padding: 3px 6px; text-align: left; }
        table.infl th { background: rgba(0,0,0,.04); font-weight: 600; }
        a.more { color: #007aff; text-decoration: none; font-size: 13px; }
        .muted { color: #8e8e93; font-size: 13px; }
        .err { color: #ff3b30; font-size: 13px; }
        .spin { display: inline-block; width: 15px; height: 15px; vertical-align: -2px;
            border: 2px solid rgba(0,0,0,.15); border-top-color: #007aff;
            border-radius: 50%; animation: ti-spin .8s linear infinite; }
        @keyframes ti-spin { to { transform: rotate(360deg); } }
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
            .section { border-top-color: rgba(255,255,255,.12); }
            table.infl th, table.infl td { border-color: rgba(255,255,255,.16); }
            table.infl th { background: rgba(255,255,255,.06); }
        }
    `;

    let host, shadow, card, visible = false;

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
        window.addEventListener("scroll", hide, true);
        window.addEventListener("resize", hide, true);
    }

    function onOutside(e) {
        if (!visible) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.includes(host)) return;
        hide();
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

    // Open (or reuse) the popover anchored to `rect`. Returns the body element to fill.
    function open(rect) {
        ensure();
        card.innerHTML = "";
        card.style.display = "block";
        visible = true;
        requestAnimationFrame(() => place(rect));
        return { body: card, reposition: () => requestAnimationFrame(() => place(rect)) };
    }

    function hide() {
        if (!card) return;
        card.style.display = "none";
        card.innerHTML = "";
        visible = false;
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

    TI.ui = { open, hide, toast, spinner, get visible() { return visible; } };
})();
