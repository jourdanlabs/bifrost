// Overlay rendering. Badge + click-to-expand panel.
//
// Visual states (per addendum B):
//   APPROVED / LOW / REJECTED  — verdict states from AURORA
//   UNVERIFIED                 — transient, "verification in progress"
//   UNAVAILABLE                — BIFROST cannot verify (network / key / rate limit).
//                                Distinct from a suspicious AI output.

import type { BifrostResponse, Verdict } from "@bifrost/types";

const BADGE_ATTR = "data-bifrost-attached";

export type UnavailableReason =
  | "service_unreachable"
  | "missing_api_key"
  | "rate_limit_exceeded"
  | "timeout"
  | "unknown";

const UNAVAILABLE_COPY: Record<UnavailableReason, { short: string; long: string; cta?: string }> = {
  service_unreachable: {
    short: "UNAVAILABLE",
    long: "BIFROST cannot reach the verification service. The AI output is not flagged — it is just unverified.",
    cta: "Service unreachable",
  },
  missing_api_key: {
    short: "UNAVAILABLE",
    long: "BIFROST cannot verify because no API key is configured.",
    cta: "Add API key",
  },
  rate_limit_exceeded: {
    short: "UNAVAILABLE",
    long: "Rate limit exceeded. Verification will resume when the limit resets.",
    cta: "Rate limit exceeded",
  },
  timeout: {
    short: "UNAVAILABLE",
    long: "Verification timed out (>800ms). The AI output is not flagged — it is just unverified.",
    cta: "Service slow / unreachable",
  },
  unknown: {
    short: "UNAVAILABLE",
    long: "BIFROST could not complete verification.",
    cta: "Service unreachable",
  },
};

function classFor(v: Verdict): string {
  if (v === "APPROVED") return "bifrost-approved";
  if (v === "LOW_CONFIDENCE") return "bifrost-low";
  return "bifrost-rejected";
}

function labelFor(v: Verdict): string {
  if (v === "APPROVED") return "APPROVED";
  if (v === "LOW_CONFIDENCE") return "LOW";
  return "REJECTED";
}

export function ensureHost(host: HTMLElement): void {
  const computed = window.getComputedStyle(host).position;
  if (computed === "static") {
    host.classList.add("bifrost-host");
  }
}

export function renderUnverified(host: HTMLElement, id: string): HTMLElement {
  ensureHost(host);
  const existing = host.querySelector<HTMLElement>(`[data-bifrost-id="${id}"]`);
  if (existing) return existing;
  const badge = document.createElement("span");
  badge.className = "bifrost-badge bifrost-unverified";
  badge.setAttribute("data-bifrost-id", id);
  badge.setAttribute("data-bifrost-state", "unverified");
  badge.innerHTML = `<span class="bifrost-dot"></span>UNVERIFIED`;
  badge.title = "Verification in progress";
  host.appendChild(badge);
  host.setAttribute(BADGE_ATTR, "1");
  return badge;
}

// Back-compat alias; older callers expected `renderPending`.
export const renderPending = renderUnverified;

function classifyError(message: string): UnavailableReason {
  const m = message.toLowerCase();
  if (m.includes("timeout") || m.includes("aborted")) return "timeout";
  if (m.includes("api key") || m.includes("unauthorized") || m.includes("401")) {
    return "missing_api_key";
  }
  if (m.includes("rate") || m.includes("429")) return "rate_limit_exceeded";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to fetch") || m.includes("connection")) {
    return "service_unreachable";
  }
  return "unknown";
}

export function renderUnavailable(
  badge: HTMLElement,
  host: HTMLElement,
  rawReasonOrMessage: UnavailableReason | string
): void {
  const reason: UnavailableReason =
    typeof rawReasonOrMessage === "string" && !(rawReasonOrMessage in UNAVAILABLE_COPY)
      ? classifyError(rawReasonOrMessage)
      : (rawReasonOrMessage as UnavailableReason);
  const copy = UNAVAILABLE_COPY[reason] ?? UNAVAILABLE_COPY.unknown;

  badge.className = "bifrost-badge bifrost-unavailable";
  badge.setAttribute("data-bifrost-state", "unavailable");
  badge.innerHTML = `<span class="bifrost-dot"></span>${copy.short}`;
  badge.title = copy.long;

  // Replace any prior click handler by cloning the node.
  const fresh = badge.cloneNode(true) as HTMLElement;
  badge.replaceWith(fresh);

  let panel: HTMLElement | null = null;
  fresh.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel && panel.isConnected) {
      panel.remove();
      panel = null;
      return;
    }
    panel = document.createElement("div");
    panel.className = "bifrost-panel";
    panel.innerHTML = `
      <h4>BIFROST — UNAVAILABLE</h4>
      <p>${escapeHtml(copy.long)}</p>
      <p style="color:#6b7280;font-size:11px;margin-top:4px">
        <strong>This does not mean the AI output is suspicious.</strong>
        It means BIFROST could not verify it.
      </p>
      ${copy.cta ? `<div style="margin-top:8px"><code>${escapeHtml(copy.cta)}</code></div>` : ""}
    `;
    host.appendChild(panel);
    const dismiss = (ev: MouseEvent) => {
      if (!panel) return;
      if (panel.contains(ev.target as Node) || fresh.contains(ev.target as Node)) return;
      panel.remove();
      panel = null;
      document.removeEventListener("click", dismiss, true);
    };
    document.addEventListener("click", dismiss, true);
  });
}

// Legacy alias.
export const renderError = renderUnavailable;

export function renderVerdict(badge: HTMLElement, host: HTMLElement, res: BifrostResponse): void {
  badge.className = `bifrost-badge ${classFor(res.verdict)}`;
  badge.setAttribute("data-bifrost-state", "verdict");
  const conf = `${Math.round(res.confidence * 100)}%`;
  badge.innerHTML = `<span class="bifrost-dot"></span>${labelFor(res.verdict)} ${conf}`;
  badge.title = "Click for details";

  // Replace any prior click handler.
  const fresh = badge.cloneNode(true) as HTMLElement;
  badge.replaceWith(fresh);

  let panel: HTMLElement | null = null;
  fresh.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel && panel.isConnected) {
      panel.remove();
      panel = null;
      return;
    }
    panel = buildPanel(res);
    host.appendChild(panel);
    const dismiss = (ev: MouseEvent) => {
      if (!panel) return;
      if (panel.contains(ev.target as Node) || fresh.contains(ev.target as Node)) return;
      panel.remove();
      panel = null;
      document.removeEventListener("click", dismiss, true);
    };
    document.addEventListener("click", dismiss, true);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPanel(res: BifrostResponse): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "bifrost-panel";
  const conf = `${Math.round(res.confidence * 100)}%`;
  const reasonsHtml = res.reasons.length
    ? `<ul>${res.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>`
    : "";
  const findingsHtml = res.pulsar_findings.length
    ? res.pulsar_findings
        .map(
          (f) => `
            <div class="bifrost-finding">
              <div><code>${escapeHtml(f.type)}</code></div>
              <div>${escapeHtml(f.description)}</div>
              <div style="color:#92400e;margin-top:2px"><strong>Impact:</strong> ${escapeHtml(f.impact)}</div>
            </div>`
        )
        .join("")
    : "";
  panel.innerHTML = `
    <h4>BIFROST verdict — ${labelFor(res.verdict)} ${conf}</h4>
    ${reasonsHtml}
    ${findingsHtml ? `<h4>PULSAR findings</h4>${findingsHtml}` : ""}
    <div style="margin-top:6px;color:#6b7280;font-size:10px">${escapeHtml(res.timestamp)}</div>
  `;
  return panel;
}
