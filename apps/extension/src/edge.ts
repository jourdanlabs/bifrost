// BIFROST EDGE bootstrap shared by all content scripts.
//
// Latency contract (addendum A):
//   UNVERIFIED -> verdict transition <500ms perceived
//   - badge appears synchronously at detection
//   - 800ms hard timeout: UNVERIFIED -> UNAVAILABLE (not REJECTED)

import type { Adapter, ResponseTarget } from "./adapters/types";
import {
  renderUnverified,
  renderVerdict,
  renderUnavailable,
  type UnavailableReason,
} from "./overlay";

interface VerifyResult {
  ok: boolean;
  data?: import("@bifrost/types").BifrostResponse;
  error?: string;
  status?: number;
}

const UNVERIFIED_TIMEOUT_MS = 800;
const verified = new Map<string, string>();

async function verify(text: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "BIFROST_VERIFY", output: text.slice(0, 120_000) },
      (response: VerifyResult | undefined) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message ?? "runtime error" });
          return;
        }
        resolve(response ?? { ok: false, error: "no response" });
      }
    );
  });
}

function reasonFromResult(result: VerifyResult): UnavailableReason {
  if (result.status === 401 || result.status === 403) return "missing_api_key";
  if (result.status === 429) return "rate_limit_exceeded";
  const m = (result.error ?? "").toLowerCase();
  if (m.includes("timeout") || m.includes("aborted")) return "timeout";
  if (m.includes("disabled")) return "missing_api_key";
  if (m.includes("api key") || m.includes("unauthorized")) return "missing_api_key";
  if (m.includes("rate")) return "rate_limit_exceeded";
  if (m.includes("fetch") || m.includes("network") || m.includes("connection")) {
    return "service_unreachable";
  }
  return "unknown";
}

export function startEdge(adapter: Adapter): void {
  adapter.attach(async (target: ResponseTarget) => {
    const signature = `${target.text.length}:${target.text.slice(0, 80)}:${target.text.slice(-80)}`;
    if (verified.get(target.id) === signature) return;
    verified.set(target.id, signature);

    const t0 = performance.now();
    const badge = renderUnverified(target.host, target.id);

    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      renderUnavailable(badge, target.host, "timeout");
    }, UNVERIFIED_TIMEOUT_MS);

    const result = await verify(target.text);
    if (timedOut) return; // late response; UI already showed UNAVAILABLE
    window.clearTimeout(timer);

    const elapsed = performance.now() - t0;
    if (!result.ok || !result.data) {
      renderUnavailable(badge, target.host, reasonFromResult(result));
      console.debug(`[bifrost] unavailable in ${elapsed.toFixed(0)}ms: ${result.error}`);
      return;
    }

    renderVerdict(badge, target.host, result.data);
    console.debug(
      `[bifrost] ${result.data.verdict} ${result.data.confidence} (perceived ${elapsed.toFixed(0)}ms)`
    );
  });
}
