// BIFROST EDGE bootstrap shared by all content scripts.

import type { Adapter, ResponseTarget } from "./adapters/types";
import { renderPending, renderVerdict, renderError } from "./overlay";

interface VerifyResult {
  ok: boolean;
  data?: import("@bifrost/types").BifrostResponse;
  error?: string;
}

const verified = new Set<string>();

async function verify(text: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "BIFROST_VERIFY", output: text },
      (response: VerifyResult | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response ?? { ok: false, error: "no response" });
      }
    );
  });
}

export function startEdge(adapter: Adapter): void {
  adapter.attach(async (target: ResponseTarget) => {
    if (verified.has(target.id)) return;
    verified.add(target.id);
    const badge = renderPending(target.host, target.id);
    const result = await verify(target.text);
    if (!result.ok || !result.data) {
      renderError(badge, result.error ?? "unknown error");
      return;
    }
    renderVerdict(badge, target.host, result.data);
  });
}
