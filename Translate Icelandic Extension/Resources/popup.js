// popup.js — toolbar popup. Shows the active translation backend and offers
// per-session toggles for the current tab (full-page translate, tap-to-look-up).
// Persistent defaults live in the app; this just drives the current page.

const pageBox = document.getElementById("page");
const tapBox = document.getElementById("tap");
const statusEl = document.getElementById("status");
const hintEl = document.getElementById("hint");

async function activeTab() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
}

async function tellTab(command, extra) {
    const tab = await activeTab();
    if (!tab) throw new Error("no active tab");
    // Target the top frame only — with all_frames the message would otherwise fan
    // out to every iframe and the popup could bind to/drive an arbitrary subframe.
    return browser.tabs.sendMessage(tab.id, Object.assign({ command }, extra), { frameId: 0 });
}

async function refreshStatus() {
    try {
        const s = await browser.runtime.sendMessage({ type: "status" });
        if (s && s.ok) {
            if (s.provider === "azure" && s.hasKey) {
                statusEl.textContent = "Backend: Azure" + (s.region ? " (" + s.region + ")" : "");
                hintEl.style.display = "none";
            } else {
                statusEl.textContent = "Backend: free fallback (MyMemory)";
                hintEl.style.display = "";
            }
            return;
        }
    } catch (_) { /* fall through */ }
    statusEl.textContent = "Backend unavailable";
}

async function refreshPageState() {
    try {
        const st = await tellTab("getState");
        if (st && st.ok) {
            pageBox.checked = !!st.pageActive;
            tapBox.checked = !!st.tap;
            pageBox.disabled = false;
            tapBox.disabled = false;
            return;
        }
    } catch (_) {
        // No content script here (restricted page, or not granted permission).
        pageBox.disabled = true;
        tapBox.disabled = true;
        statusEl.textContent = "Not available on this page";
    }
}

pageBox.addEventListener("change", () => {
    tellTab(pageBox.checked ? "translatePage" : "revertPage").catch(() => {});
});

tapBox.addEventListener("change", () => {
    tellTab("setTap", { enabled: tapBox.checked }).catch(() => {});
});

refreshStatus();
refreshPageState();
