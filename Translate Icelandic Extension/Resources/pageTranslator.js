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
    const CHUNK = 40;          // max text nodes per translate request
    const MAX_CHARS = 9000;    // max chars per request (well under the API's 50k cap)
    const FLUSH_MS = 150;      // debounce before sending a batch
    const MUTATE_MS = 400;     // debounce for re-scanning mutated DOM

    let enabled = false;
    let io = null, mo = null;
    let flushTimer = null, mutateTimer = null;
    let erroredOnce = false;
    let pendingRoots = [];                  // subtrees added/changed since last re-scan
    let pendingFull = false;                // coalesce a mutation storm into one full scan
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

        let i = 0;
        while (i < batch.length) {
            // Pack a request up to CHUNK nodes AND ~MAX_CHARS, so a page of long
            // paragraphs never exceeds the translation API's per-request limit.
            const nodes = [];
            let chars = 0;
            while (i < batch.length && nodes.length < CHUNK &&
                   (nodes.length === 0 || chars + batch[i].nodeValue.length <= MAX_CHARS)) {
                nodes.push(batch[i]);
                chars += batch[i].nodeValue.length;
                i++;
            }
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
                // Re-queue everything we didn't apply (this chunk + the rest) so a
                // later pass retries instead of losing the text permanently.
                for (const n of nodes) { if (n.isConnected && !originals.has(n)) queued.add(n); }
                for (let k = i; k < batch.length; k++) {
                    if (batch[k].isConnected && !originals.has(batch[k])) queued.add(batch[k]);
                }
                if (!erroredOnce) {
                    erroredOnce = true;
                    TI.ui.toast("Translation failed: " + err.message, "err");
                    setTimeout(() => { if (enabled) scheduleFlush(); }, 2000); // one auto-retry
                }
                return;
            }
        }
    }

    function onMutations(records) {
        if (!enabled) return;
        // Collect just the added/changed subtrees, not the whole document — this is
        // critical on infinite feeds (Facebook) that mutate constantly.
        for (const r of records) {
            if (pendingFull) break;
            if (r.type === "characterData") {
                if (r.target) pendingRoots.push(r.target);
            } else if (r.addedNodes && r.addedNodes.length) {
                for (const n of r.addedNodes) pendingRoots.push(n);
            }
        }
        // A mutation storm → coalesce into one whole-document re-scan rather than
        // thousands of overlapping subtree walks.
        if (pendingRoots.length > 400) { pendingFull = true; pendingRoots = []; }
        if ((!pendingRoots.length && !pendingFull) || mutateTimer) return;
        mutateTimer = setTimeout(() => {
            mutateTimer = null;
            const roots = pendingRoots; pendingRoots = [];
            const full = pendingFull; pendingFull = false;
            if (full) { scan(document.body); return; }
            for (const root of roots) {
                if (root && root.isConnected) scan(root); // isCandidate() skips handled nodes
            }
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
        pendingRoots = [];
        pendingFull = false;
    }

    TI.page = { enable, revert, get active() { return enabled; } };
})();
