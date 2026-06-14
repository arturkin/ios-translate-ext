// chrome/config.example.js — template for the baked Chrome config.
//
// Copy this to chrome/config.local.js (gitignored) and fill in your Azure Translator key/region.
// The build (scripts/build-chrome.mjs) bakes whichever of the two it finds into chrome/dist/config.js.
// With no key the extension falls back to the keyless MyMemory backend, so a fresh clone still works.
//
// ⚠️ Public repo: never commit your real key. Only this *.example file is tracked; config.local.js
// is gitignored. The baked key ships inside any build you distribute and shares one Azure F0 quota
// (2M chars/month) across everyone you give it to — keep the build to trusted people.

export const CONFIG = {
    azureKey: "",      // Azure Translator subscription key ("" → use the free MyMemory fallback)
    azureRegion: "",   // Azure resource region, e.g. "northeurope" ("" if your key is global)

    // Optional overrides for the default feature toggles (uncomment to change):
    // provider: "azure",     // "azure" | "free"
    // useWiktionary: true,
    // useBin: true,
    // tapToTranslate: true,
    // autoTranslate: false,
};
