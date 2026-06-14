// services/settings.js — Chrome settings, baked from chrome/config.js at build time.
//
// There is no native app or App Group in the Chrome build, so the Azure key/region are baked in
// (see scripts/build-chrome.mjs) and the feature toggles use the same defaults the iOS/macOS app
// ships with (mirror of SharedStore.swift). config.js is produced by the build from
// chrome/config.local.js (gitignored) or chrome/config.example.js (keyless → MyMemory).

import { CONFIG } from "../config.js";

const DEFAULTS = {
    provider: "azure",
    useWiktionary: true,
    useBin: true,
    tapToTranslate: true,
    autoTranslate: false,
};

export function getSettings() {
    return { ...DEFAULTS, ...CONFIG };
}

export function hasAzureKey() {
    return typeof CONFIG.azureKey === "string" && CONFIG.azureKey.trim() !== "";
}

// Shape mirrors the native `status` response the content scripts already consume.
export function statusResponse() {
    const s = getSettings();
    const keyed = hasAzureKey();
    return {
        ok: true,
        provider: keyed ? (s.provider || "azure") : "free",
        hasKey: keyed,
        region: (CONFIG.azureRegion || "").trim(),
        useWiktionary: s.useWiktionary !== false,
        useBin: s.useBin !== false,
        tapToTranslate: s.tapToTranslate !== false,
        autoTranslate: s.autoTranslate === true,
    };
}
