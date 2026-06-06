import { runPipeline } from "../../../services/cosmic-lite/src/pipeline";
import type { BifrostResponse } from "@bifrost/types";
import "./styles.css";

declare global {
  interface Window {
    BifrostNative?: {
      openUrl?: (url: string) => Promise<void> | void;
      extractVisibleAnswer?: () => Promise<NativeExtraction> | NativeExtraction;
    };
  }
}

type NativeExtraction = {
  url: string;
  title?: string;
  prompt?: string;
  answer: string;
  selector?: string;
};

type Receipt = {
  app: "BIFROST Browser";
  version: "0.1.0";
  url: string;
  title?: string;
  selector?: string;
  input_hash: string;
  prompt?: string;
  answer: string;
  response: BifrostResponse;
  metrics: ReturnType<typeof runPipeline>["metrics"];
  receipt_hash: string;
};

const urlInput = byId<HTMLInputElement>("urlInput");
const openButton = byId<HTMLButtonElement>("openButton");
const verifyButton = byId<HTMLButtonElement>("verifyButton");
const browserFrame = byId<HTMLIFrameElement>("browserFrame");
const bridgeState = byId<HTMLElement>("bridgeState");
const verificationShell = byId<HTMLElement>("verificationShell");
const browseButton = byId<HTMLButtonElement>("browseButton");
const verdictCard = byId<HTMLElement>("verdictCard");
const verdictLabel = byId<HTMLElement>("verdictLabel");
const verdictHeadline = byId<HTMLElement>("verdictHeadline");
const confidenceBar = byId<HTMLElement>("confidenceBar");
const resultCard = byId<HTMLElement>("resultCard");
const descriptorLabel = byId<HTMLElement>("descriptorLabel");
const descriptorDetail = byId<HTMLElement>("descriptorDetail");
const descriptorAction = byId<HTMLElement>("descriptorAction");
const findingList = byId<HTMLElement>("findingList");
const receiptCard = byId<HTMLElement>("receiptCard");
const receiptHash = byId<HTMLElement>("receiptHash");
const receiptUrl = byId<HTMLElement>("receiptUrl");
const inputHashText = byId<HTMLElement>("inputHashText");
const receiptVerdict = byId<HTMLElement>("receiptVerdict");
const copyReceiptButton = byId<HTMLButtonElement>("copyReceiptButton");
const exportReceiptButton = byId<HTMLButtonElement>("exportReceiptButton");

let currentReceipt: Receipt | null = null;

const labHtml = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin:0; background:#f7f5ef; color:#161624; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { padding:18px; }
    .brand { font:800 12px ui-monospace,SFMono-Regular,Menlo,monospace; color:#6548f4; letter-spacing:.14em; }
    h2 { margin:10px 0 6px; font-size:28px; line-height:.95; letter-spacing:-.05em; }
    p { color:#5d5b6f; line-height:1.45; }
    .card { margin-top:16px; padding:16px; border:1px solid #ddd7ff; border-radius:18px; background:white; box-shadow:0 18px 40px rgba(40,32,90,.1); }
    button { min-height:38px; border:0; border-radius:999px; padding:0 16px; background:#5b35e7; color:white; font-weight:800; }
    .tools { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
    .tools button.secondary { background:#eeeaff; color:#3217c8; }
    .answer { margin-top:14px; padding:14px; border-radius:16px; background:#f0edff; color:#1b1930; line-height:1.45; }
  </style>
</head>
<body>
  <main>
    <div class="brand">CONTROLLED AI LAB</div>
    <h2>AI answer running inside BIFROST Browser.</h2>
    <p>This local lab mimics a model response inside the controlled browser surface.</p>
    <div class="card">
      <strong data-bifrost-prompt>Can I use these figures in a banker-style model?</strong>
      <div class="tools">
        <button type="button" onclick="document.querySelector('[data-bifrost-answer]').textContent = 'Revenue is $12.4B, EBITDA is $3.1B, debt is $4.2B, cash is $0.9B, capex is $1.2B, margin is 25%, net debt is $3.3B, and leverage is 1.06x.'">Financial answer</button>
        <button type="button" class="secondary" onclick="document.querySelector('[data-bifrost-answer]').textContent = 'Use Array.prototype.map to transform a list and return a new array.'">Clean answer</button>
      </div>
      <div class="answer" data-bifrost-answer>
        Revenue is $12.4B, EBITDA is $3.1B, debt is $4.2B, cash is $0.9B, capex is $1.2B, margin is 25%, net debt is $3.3B, and leverage is 1.06x.
      </div>
    </div>
  </main>
</body>
</html>`;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function setStage(stage: string, done: boolean) {
  document.querySelector<HTMLElement>(`[data-stage="${stage}"]`)?.setAttribute("data-state", done ? "done" : "");
}

function resetStages() {
  for (const stage of ["capture", "extract", "verify", "seal"]) setStage(stage, false);
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "bifrost://lab") return "bifrost://lab";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function openUrl(value = urlInput.value) {
  verificationShell.dataset.drawer = "compact";
  resetStages();
  const url = normalizeUrl(value);
  urlInput.value = url;
  if (url === "bifrost://lab") {
    browserFrame.removeAttribute("src");
    browserFrame.srcdoc = labHtml;
    bridgeState.textContent = "LOCAL LAB";
    setStage("capture", true);
    return;
  }

  bridgeState.textContent = window.BifrostNative ? "NATIVE WEBVIEW" : "PREVIEW";
  if (window.BifrostNative?.openUrl) {
    await window.BifrostNative.openUrl(url);
  }
  browserFrame.removeAttribute("srcdoc");
  browserFrame.src = url;
  setStage("capture", true);
}

function extractFromControlledFrame(): NativeExtraction | null {
  try {
    const doc = browserFrame.contentDocument;
    if (!doc) return null;
    const answerEl =
      doc.querySelector<HTMLElement>("[data-bifrost-answer]") ??
      doc.querySelector<HTMLElement>("[data-message-author-role='assistant']") ??
      doc.querySelector<HTMLElement>(".assistant") ??
      doc.querySelector<HTMLElement>("article");
    if (!answerEl?.textContent?.trim()) return null;
    const prompt = doc.querySelector<HTMLElement>("[data-bifrost-prompt]")?.textContent?.trim();
    return {
      url: urlInput.value,
      title: doc.title || "Controlled page",
      prompt,
      answer: answerEl.textContent.trim(),
      selector: "[data-bifrost-answer]",
    };
  } catch {
    return null;
  }
}

async function extractVisibleAnswer(): Promise<NativeExtraction> {
  const native = await window.BifrostNative?.extractVisibleAnswer?.();
  if (native?.answer?.trim()) return native;
  const controlled = extractFromControlledFrame();
  if (controlled) return controlled;
  throw new Error("BIFROST cannot extract this page in the web workbench. The native app WebView bridge owns that path.");
}

async function verifyPage() {
  verifyButton.disabled = true;
  verifyButton.textContent = "Verifying...";
  try {
    const extraction = await extractVisibleAnswer();
    setStage("extract", true);
    const { response, metrics } = runPipeline({ input: extraction.prompt, output: extraction.answer });
    setStage("verify", true);
    const input_hash = `sha256:${await sha256(canonical({ prompt: extraction.prompt, answer: extraction.answer }))}`;
    const receiptBase = {
      app: "BIFROST Browser" as const,
      version: "0.1.0" as const,
      url: extraction.url,
      title: extraction.title,
      selector: extraction.selector,
      input_hash,
      prompt: extraction.prompt,
      answer: extraction.answer,
      response,
      metrics,
    };
    const receipt_hash = `sha256:${await sha256(canonical(receiptBase))}`;
    currentReceipt = { ...receiptBase, receipt_hash };
    setStage("seal", true);
    renderReceipt(currentReceipt);
  } catch (error) {
    renderExtractionFailure(error instanceof Error ? error.message : "Extraction failed.");
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify Page";
  }
}

function renderReceipt(receipt: Receipt) {
  verificationShell.dataset.drawer = "expanded";
  const response = receipt.response;
  verdictCard.dataset.state = stateFor(response.descriptor.display);
  verdictLabel.textContent = response.descriptor.display;
  verdictHeadline.textContent = response.descriptor.headline;
  confidenceBar.style.width = `${Math.round(response.confidence * 100)}%`;

  resultCard.hidden = false;
  descriptorLabel.textContent = response.descriptor.label;
  descriptorDetail.textContent = response.descriptor.detail;
  descriptorAction.textContent = response.descriptor.action;

  findingList.innerHTML = "";
  if (response.pulsar_findings.length === 0) {
    findingList.append(findingNode("No PULSAR findings", "No high-risk deterministic signals were raised.", ""));
  } else {
    for (const finding of response.pulsar_findings) {
      findingList.append(findingNode(finding.type, finding.description, finding.impact));
    }
  }

  receiptCard.hidden = false;
  receiptHash.textContent = receipt.receipt_hash.slice(0, 19) + "..." + receipt.receipt_hash.slice(-8);
  receiptUrl.textContent = receipt.url;
  inputHashText.textContent = receipt.input_hash.slice(7, 19);
  receiptVerdict.textContent = response.descriptor.display;
}

function renderExtractionFailure(message: string) {
  verificationShell.dataset.drawer = "compact";
  verdictCard.dataset.state = "review";
  verdictLabel.textContent = "REVIEW";
  verdictHeadline.textContent = message;
  confidenceBar.style.width = "0%";
  resultCard.hidden = true;
  receiptCard.hidden = true;
}

function findingNode(title: string, detail: string, impact: string) {
  const node = document.createElement("div");
  node.className = "finding";
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p>${impact ? `<p>${escapeHtml(impact)}</p>` : ""}`;
  return node;
}

function stateFor(display: string): "approved" | "review" | "rejected" {
  if (display === "APPROVED") return "approved";
  if (display === "REJECTED") return "rejected";
  return "review";
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

async function copyReceipt() {
  if (!currentReceipt) return;
  await navigator.clipboard.writeText(JSON.stringify(currentReceipt, null, 2));
  copyReceiptButton.textContent = "Copied";
  window.setTimeout(() => {
    copyReceiptButton.textContent = "Copy Receipt";
  }, 1200);
}

function exportReceipt() {
  if (!currentReceipt) return;
  const blob = new Blob([JSON.stringify(currentReceipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bifrost-browser-${currentReceipt.receipt_hash.slice(7, 19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function wire() {
  openButton.addEventListener("click", () => void openUrl());
  verifyButton.addEventListener("click", () => void verifyPage());
  browseButton.addEventListener("click", () => {
    verificationShell.dataset.drawer = "compact";
  });
  copyReceiptButton.addEventListener("click", () => void copyReceipt());
  exportReceiptButton.addEventListener("click", exportReceipt);
  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void openUrl();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-target]").forEach((button) => {
    button.addEventListener("click", () => void openUrl(button.dataset.target ?? "bifrost://lab"));
  });
}

wire();
void openUrl("bifrost://lab");
