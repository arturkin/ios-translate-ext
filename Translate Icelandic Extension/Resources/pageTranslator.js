// pageTranslator.js — full-page "read it in English" mode.
//
// Walks visible text nodes, keeps the ones that look Icelandic, and replaces them
// in place (originals are kept so the toggle can revert). Two observers keep it
// fast and quota-friendly:
//   • IntersectionObserver — only translate text once it scrolls near the viewport.
//   • MutationObserver     — pick up text injected later (infinite feeds, Facebook).
// We replace Text-node values only (never element markup), so page event handlers
// and layout survive untouched.

(() => {
    "use strict";
    const TI = (window.__TI__ = window.__TI__ || {});

    const SKIP = new Set([
        "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
        "CODE", "PRE", "KBD", "SAMP", "SVG", "MATH", "TITLE"
    ]);
    const CHUNK = 40;          // text nodes per translate request
    const FLUSH_MS = 150;      // debounce before sending a batch
    const MUTATE_MS = 400;     // debounce for re-scanning mutated DOM

    let enabled = false;
    let io = null, mo = null;
    let flushTimer = null, mutateTimer = null;
    let erroredOnce = false;
    const originals = new Map();           // TextNode -> original string (translated nodes)
    const queued = new Set();              // TextNode pending translation
    const elementNodes = new Map();        // Element -> Set<TextNode> waiting to be seen

    function isCandidate(node) {
        if (originals.has(node) || queued.has(node)) return false;
        const p = node.parentElement;
        if (!p || SKIP.has(p.tagName) || p.isContentEditable) return false;
        const text = node.nodeValue;
        if (!text) return false;
        const trimmed = text.trim();
        if (trimmed.length < 2) return false;
        return TI.ice.isLikelyIcelandic(trimmed);
    }

    function scan(root) {
        if (!root || root.nodeType === Node.TEXT_NODE) {
            if (root && isCandidate(root)) observeNode(root);
            return;
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => isCandidate(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
        });
        let n;
        while ((n = walker.nextNode())) observeNode(n);
    }

    function observeNode(node) {
        const el = node.parentElement;
        if (!el) return;
        let set = elementNodes.get(el);
        if (!set) { set = new Set(); elementNodes.set(el, set); io.observe(el); }
        set.add(node);
    }

    function onIntersect(entries) {
        for (const e of entries) {
            if (!e.isIntersecting) continue;
            const el = e.target;
            const set = elementNodes.get(el);
            io.unobserve(el);
            elementNodes.delete(el);
            if (!set) continue;
            for (const node of set) {
                if (isCandidate(node)) { queued.add(node); }
            }
        }
        scheduleFlush();
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, FLUSH_MS);
    }

    async function flush() {
        flushTimer = null;
        const batch = [...queued].filter((n) => n.isConnected && !originals.has(n));
        queued.clear();
        if (!batch.length) return;

        for (let i = 0; i < batch.length; i += CHUNK) {
            const nodes = batch.slice(i, i + CHUNK);
            const parts = nodes.map((n) => {
                const m = n.nodeValue.match(/^(\s*)([\s\S]*?)(\s*)$/);
                return { lead: m[1], core: m[2], trail: m[3] };
            });
            try {
                const out = await TI.bg.translate(parts.map((p) => p.core), "is", "en");
                if (!enabled) return; // toggled off mid-flight — don't re-apply English
                nodes.forEach((node, j) => {
                    if (!node.isConnected || originals.has(node)) return;
                    const t = out[j];
                    // Skip empties and no-op/fallback results (translation === source):
                    // don't mark the node done with untranslated text — let a later
                    // pass retry it instead of freezing it as "translated".
                    if (typeof t !== "string" || t === "" || t === parts[j].core) return;
                    originals.set(node, node.nodeValue);   // mark before edit so MO skips it
                    node.nodeValue = parts[j].lead + t + parts[j].trail;
                });
            } catch (err) {
                if (!erroredOnce) {
                    erroredOnce = true;
                    TI.ui.toast("Translation failed: " + err.message, "err");
                }
                return; // leave the rest un-marked so a later pass can retry
            }
        }
    }

    function onMutations(records) {
        if (!enabled || mutateTimer) return;
        // Only react to structural / text changes, not our own attribute noise.
        const relevant = records.some((r) => r.addedNodes.length || r.type === "characterData");
        if (!relevant) return;
        mutateTimer = setTimeout(() => {
            mutateTimer = null;
            // Re-scan body; isCandidate() skips everything already handled.
            scan(document.body);
        }, MUTATE_MS);
    }

    function enable() {
        if (enabled) return;
        enabled = true;
        erroredOnce = false;
        io = new IntersectionObserver(onIntersect, { rootMargin: "200px" });
        mo = new MutationObserver(onMutations);
        scan(document.body);
        mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    function revert() {
        if (!enabled) return;
        enabled = false;
        if (io) { io.disconnect(); io = null; }
        if (mo) { mo.disconnect(); mo = null; }
        if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
        if (mutateTimer) { clearTimeout(mutateTimer); mutateTimer = null; }
        for (const [node, original] of originals) {
            if (node.isConnected) node.nodeValue = original;
        }
        originals.clear();
        queued.clear();
        elementNodes.clear();
    }

    TI.page = { enable, revert, get active() { return enabled; } };
})();
