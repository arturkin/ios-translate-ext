// services/azure.js — Azure Translator v3, the default backend.
//
// JS port of AzureTranslationProvider.swift. Runs in the background service worker, which may make
// cross-origin requests (declared in manifest host_permissions), so there is no CORS problem and
// no native bridge.

const ENDPOINT = "https://api.cognitive.microsofttranslator.com/translate";

// texts: string[] -> string[] aligned to input order.
export async function azureTranslate(texts, from, to, { azureKey, azureRegion } = {}) {
    const url = `${ENDPOINT}?api-version=3.0&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const headers = {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": azureKey,
    };
    // Region is required for regional resources, omitted for global ones.
    if (azureRegion) headers["Ocp-Apim-Subscription-Region"] = azureRegion;

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(texts.map((t) => ({ Text: t }))),
        signal: AbortSignal.timeout(15000),
    });

    if (res.status === 401 || res.status === 403) {
        throw new Error("Azure rejected the request — check your Azure key and region.");
    }
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Translation service returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Unexpected response from the translation service.");
    // Each item: { translations: [{ text, to }] }.
    return data.map((item) => item?.translations?.[0]?.text ?? "");
}
