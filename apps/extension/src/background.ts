// Background service worker. Routes verification requests from content
// scripts so we don't depend on per-site CORS for the API.

import { loadConfig } from "./config";

interface VerifyRequest {
  type: "BIFROST_VERIFY";
  output: string;
  input?: string;
}

chrome.runtime.onMessage.addListener((msg: VerifyRequest, _sender, sendResponse) => {
  if (msg?.type !== "BIFROST_VERIFY") return false;
  (async () => {
    try {
      const cfg = await loadConfig();
      if (!cfg.enabled) {
        sendResponse({ ok: false, error: "disabled" });
        return;
      }
      const res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ output: msg.output, input: msg.input }),
      });
      if (!res.ok) {
        sendResponse({ ok: false, error: `HTTP ${res.status}` });
        return;
      }
      const json = await res.json();
      sendResponse({ ok: true, data: json });
    } catch (e) {
      sendResponse({ ok: false, error: (e as Error).message });
    }
  })();
  return true; // keep channel open for async response
});
