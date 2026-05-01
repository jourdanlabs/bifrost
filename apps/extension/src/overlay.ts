// Overlay rendering. Badge + click-to-expand panel.

import type { BifrostResponse, Verdict } from "@bifrost/types";

const BADGE_ATTR = "data-bifrost-attached";

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

export function renderPending(host: HTMLElement, id: string): HTMLElement {
  ensureHost(host);
  const existing = host.querySelector<HTMLElement>(`[data-bifrost-id="${id}"]`);
  if (existing) return existing;
  const badge = document.createElement("span");
  badge.className = "bifrost-badge bifrost-pending";
  badge.setAttribute("data-bifrost-id", id);
  badge.innerHTML = `<span class="bifrost-dot"></span>BIFROST...`;
  host.appendChild(badge);
  host.setAttribute(BADGE_ATTR, "1");
  return badge;
}

export function renderError(badge: HTMLElement, message: string): void {
  badge.className = "bifrost-badge bifrost-error";
  badge.innerHTML = `<span class="bifrost-dot"></span>BIFROST ERR`;
  badge.title = message;
}

export function renderVerdict(badge: HTMLElement, host: HTMLElement, res: BifrostResponse): void {
  badge.className = `bifrost-badge ${classFor(res.verdict)}`;
  const conf = `${Math.round(res.confidence * 100)}%`;
  badge.innerHTML = `<span class="bifrost-dot"></span>${labelFor(res.verdict)} ${conf}`;
  badge.title = "Click for details";

  let panel: HTMLElement | null = null;
  badge.addEventListener("click", (e) => {
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
      if (panel.contains(ev.target as Node) || badge.contains(ev.target as Node)) return;
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
