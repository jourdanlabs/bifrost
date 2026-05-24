// BIFROST EDGE bootstrap shared by all content scripts.
//
// Latency contract (addendum A):
//   UNVERIFIED -> verdict transition <500ms perceived
//   - badge appears synchronously at detection
//   - 800ms hard timeout: UNVERIFIED -> UNAVAILABLE (not REJECTED)

import type { Adapter, ResponseTarget } from "./adapters/types";
import { isLikelyUserPromptNode } from "./adapters/dom";
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
const verifiedBySignature = new Map<string, string>();
const attachedHosts = new WeakSet<HTMLElement>();

async function verify(text: string, input?: string): Promise<VerifyResult> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "BIFROST_VERIFY", output: text.slice(0, 120_000), input },
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

function signatureKey(signature: string): string {
  let hash = 2166136261;
  for (let i = 0; i < signature.length; i += 1) {
    hash ^= signature.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function visibleDuplicateExists(key: string): boolean {
  return Boolean(document.querySelector(`[data-bifrost-signature="${key}"]`));
}

function overlapsExistingHost(host: HTMLElement): boolean {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-bifrost-attached='1']"))) {
    if (el === host || el.contains(host) || host.contains(el)) return true;
  }
  return false;
}

function clearStaleOverlays(): void {
  document
    .querySelectorAll(".bifrost-strip, .bifrost-badge, .bifrost-panel")
    .forEach((el) => el.remove());
  document
    .querySelectorAll<HTMLElement>("[data-bifrost-attached='1']")
    .forEach((el) => el.removeAttribute("data-bifrost-attached"));
}

function sameNormalizedText(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();
}

export function startEdge(adapter: Adapter): void {
  clearStaleOverlays();
  adapter.attach(async (target: ResponseTarget) => {
    if (isLikelyUserPromptNode(target.host) || sameNormalizedText(target.input, target.text)) return;
    const signature = `${target.text.length}:${target.text.slice(0, 80)}:${target.text.slice(-80)}`;
    if (verified.get(target.id) === signature) return;
    const key = signatureKey(signature);
    if (verifiedBySignature.has(key) && visibleDuplicateExists(key)) return;
    if (attachedHosts.has(target.host) || overlapsExistingHost(target.host)) return;
    verified.set(target.id, signature);
    verifiedBySignature.set(key, target.id);
    attachedHosts.add(target.host);

    const t0 = performance.now();
    const badge = renderUnverified(target.host, target.id);
    badge.setAttribute("data-bifrost-signature", key);

    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      renderUnavailable(badge, target.host, "timeout");
    }, UNVERIFIED_TIMEOUT_MS);

    const result = await verify(target.text, target.input);
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
