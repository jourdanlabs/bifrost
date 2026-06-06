import { runPipeline } from "../../../services/cosmic-lite/src/pipeline";
import type { BifrostResponse } from "@bifrost/types";
import "./styles.css";

type SampleKey = "finance" | "code" | "clean";

type Receipt = {
  app: "BIFROST Mobile";
  version: "0.1.0";
  input_hash: string;
  input?: string;
  output: string;
  response: BifrostResponse;
  metrics: ReturnType<typeof runPipeline>["metrics"];
  receipt_hash: string;
};

const samples: Record<SampleKey, { input?: string; output: string }> = {
  finance: {
    input: "Can I use these figures in a banker-style model today?",
    output:
      "Revenue is $12.4B, EBITDA is $3.1B, debt is $4.2B, cash is $0.9B, capex is $1.2B, margin is 25%, net debt is $3.3B, and leverage is 1.06x.",
  },
  code: {
    input: "Is this JavaScript safe to use?",
    output: "```js\nfunction first(arr) {\n  return arr[0].toUpperCase();\n}\n```",
  },
  clean: {
    input: "How should I transform a list in JavaScript?",
    output: "Use Array.prototype.map to transform a list and return a new array.",
  },
};

const promptInput = byId<HTMLTextAreaElement>("promptInput");
const answerInput = byId<HTMLTextAreaElement>("answerInput");
const verifyButton = byId<HTMLButtonElement>("verifyButton");
const clearButton = byId<HTMLButtonElement>("clearButton");
const verdictCard = byId<HTMLElement>("verdictCard");
const verdictLabel = byId<HTMLElement>("verdictLabel");
const verdictHeadline = byId<HTMLElement>("verdictHeadline");
const confidenceText = byId<HTMLElement>("confidenceText");
const confidenceBar = byId<HTMLElement>("confidenceBar");
const resultCard = byId<HTMLElement>("resultCard");
const descriptorLabel = byId<HTMLElement>("descriptorLabel");
const descriptorDetail = byId<HTMLElement>("descriptorDetail");
const descriptorAction = byId<HTMLElement>("descriptorAction");
const findingList = byId<HTMLElement>("findingList");
const receiptCard = byId<HTMLElement>("receiptCard");
const receiptHash = byId<HTMLElement>("receiptHash");
const inputHashText = byId<HTMLElement>("inputHashText");
const verdictText = byId<HTMLElement>("verdictText");
const latencyText = byId<HTMLElement>("latencyText");
const timestampText = byId<HTMLElement>("timestampText");
const copyReceiptButton = byId<HTMLButtonElement>("copyReceiptButton");
const exportReceiptButton = byId<HTMLButtonElement>("exportReceiptButton");
const recentCard = byId<HTMLElement>("recentCard");
const recentList = byId<HTMLElement>("recentList");
const installState = byId<HTMLElement>("installState");

let currentReceipt: Receipt | null = null;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonical(item)).join(",")}]`;
  }
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

function displayFor(response: BifrostResponse): "APPROVED" | "REVIEW" | "REJECTED" {
  return response.descriptor.display;
}

function stateFor(display: string): "approved" | "review" | "rejected" {
  if (display === "APPROVED") return "approved";
  if (display === "REJECTED") return "rejected";
  return "review";
}

async function verify() {
  const input = promptInput.value.trim();
  const output = answerInput.value.trim();
  if (!output) {
    answerInput.focus();
    verdictCard.dataset.state = "review";
    verdictLabel.textContent = "REVIEW";
    verdictHeadline.textContent = "BIFROST needs a model answer before it can verify anything.";
    confidenceText.textContent = "Missing answer";
    confidenceBar.style.width = "0%";
    return;
  }

  verifyButton.disabled = true;
  verifyButton.textContent = "Verifying...";
  try {
    const { response, metrics } = runPipeline({ input: input || undefined, output });
    const input_hash = `sha256:${await sha256(canonical({ input: input || undefined, output }))}`;
    const receiptBase = {
      app: "BIFROST Mobile" as const,
      version: "0.1.0" as const,
      input_hash,
      input: input || undefined,
      output,
      response,
      metrics,
    };
    const receipt_hash = `sha256:${await sha256(canonical(receiptBase))}`;
    currentReceipt = { ...receiptBase, receipt_hash };
    renderResult(currentReceipt);
    saveRecent(currentReceipt);
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify Answer";
  }
}

function renderResult(receipt: Receipt) {
  const response = receipt.response;
  const display = displayFor(response);
  verdictCard.dataset.state = stateFor(display);
  verdictLabel.textContent = display;
  verdictHeadline.textContent = response.descriptor.headline;
  confidenceText.textContent = `${Math.round(response.confidence * 100)}% confidence`;
  confidenceBar.style.width = `${Math.round(response.confidence * 100)}%`;

  resultCard.hidden = false;
  descriptorLabel.textContent = response.descriptor.label;
  descriptorDetail.textContent = response.descriptor.detail;
  descriptorAction.textContent = response.descriptor.action;

  findingList.innerHTML = "";
  if (response.pulsar_findings.length === 0) {
    const item = document.createElement("div");
    item.className = "finding";
    item.innerHTML = "<strong>No PULSAR findings</strong><p>No high-risk deterministic signals were raised.</p>";
    findingList.append(item);
  } else {
    for (const finding of response.pulsar_findings) {
      const item = document.createElement("div");
      item.className = "finding";
      item.innerHTML = `<strong>${escapeHtml(finding.type)}</strong><p>${escapeHtml(finding.description)}</p><p>${escapeHtml(finding.impact)}</p>`;
      findingList.append(item);
    }
  }

  receiptCard.hidden = false;
  receiptHash.textContent = receipt.receipt_hash.slice(0, 19) + "..." + receipt.receipt_hash.slice(-8);
  inputHashText.textContent = receipt.input_hash.slice(7, 19);
  verdictText.textContent = response.descriptor.display;
  latencyText.textContent = `${receipt.metrics.total_ms.toFixed(2)}ms`;
  timestampText.textContent = new Date(response.timestamp).toLocaleString();
  renderRecent();
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

function loadShareParams() {
  const params = new URLSearchParams(location.search);
  const text = params.get("text");
  const title = params.get("title");
  const url = params.get("url");
  const shared = [title, text, url].filter(Boolean).join("\n\n").trim();
  if (shared) answerInput.value = shared;
}

function saveRecent(receipt: Receipt) {
  const recent = getRecent();
  recent.unshift({
    display: receipt.response.descriptor.display,
    label: receipt.response.descriptor.label,
    hash: receipt.receipt_hash,
    timestamp: receipt.response.timestamp,
  });
  localStorage.setItem("bifrost-mobile-recent", JSON.stringify(recent.slice(0, 5)));
}

function getRecent(): Array<{ display: string; label: string; hash: string; timestamp: string }> {
  try {
    const parsed = JSON.parse(localStorage.getItem("bifrost-mobile-recent") ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderRecent() {
  const recent = getRecent();
  recentCard.hidden = recent.length === 0;
  recentList.innerHTML = "";
  for (const item of recent) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.hash.slice(7, 15))}</b>`;
    recentList.append(li);
  }
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
  const blob = new Blob([JSON.stringify(currentReceipt, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bifrost-${currentReceipt.receipt_hash.slice(7, 19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearAll() {
  promptInput.value = "";
  answerInput.value = "";
  currentReceipt = null;
  verdictCard.dataset.state = "idle";
  verdictLabel.textContent = "READY";
  verdictHeadline.textContent = "Paste an LLM answer or share one into BIFROST from your phone.";
  confidenceText.textContent = "No run yet";
  confidenceBar.style.width = "0%";
  resultCard.hidden = true;
  receiptCard.hidden = true;
}

function wire() {
  verifyButton.addEventListener("click", verify);
  clearButton.addEventListener("click", clearAll);
  copyReceiptButton.addEventListener("click", copyReceipt);
  exportReceiptButton.addEventListener("click", exportReceipt);
  document.querySelectorAll<HTMLButtonElement>("[data-sample]").forEach((button) => {
    button.addEventListener("click", () => {
      const sample = samples[button.dataset.sample as SampleKey];
      promptInput.value = sample.input ?? "";
      answerInput.value = sample.output;
      void verify();
    });
  });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    installState.textContent = "LOCAL";
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
    installState.textContent = "INSTALLABLE";
  } catch {
    installState.textContent = "LOCAL";
  }
}

loadShareParams();
wire();
renderRecent();
void registerServiceWorker();
