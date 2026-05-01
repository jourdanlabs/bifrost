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
      // Match the extension's <500ms perceived budget: cap fetch at ~700ms
      // so the edge has slack to render before its own 800ms timer fires.
      const ctrl = new AbortController();
      const fetchTimer = setTimeout(() => ctrl.abort(), 700);
      let res: Response;
      try {
        res = await fetch(cfg.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ output: msg.output, input: msg.input }),
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(fetchTimer);
      }
      if (!res.ok) {
        sendResponse({ ok: false, error: `HTTP ${res.status}`, status: res.status });
        return;
      }
      const json = await res.json();
      sendResponse({ ok: true, data: json, status: res.status });
    } catch (e) {
      const err = e as Error;
      const isAbort = err.name === "AbortError";
      sendResponse({ ok: false, error: isAbort ? "timeout" : err.message });
    }
  })();
  return true; // keep channel open for async response
});
