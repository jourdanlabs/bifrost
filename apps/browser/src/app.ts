import { runPipeline } from "../../../services/cosmic-lite/src/pipeline";
import type { BifrostResponse } from "@bifrost/types";
import "./styles.css";

declare global {
  interface Window {
    BifrostNative?: {
      __nativeBridge?: true;
      openUrl?: (target: string | NativeOpenTarget) => Promise<NativeState | void> | NativeState | void;
      closeUrl?: (target?: NativeTabTarget | string) => Promise<NativeState | void> | NativeState | void;
      activateTab?: (target: NativeActivateTarget) => Promise<NativeState | void> | NativeState | void;
      updateFrame?: (target: NativeFrameTarget) => Promise<NativeState | void> | NativeState | void;
      goBack?: (target?: NativeTabTarget) => Promise<NativeState | void> | NativeState | void;
      goForward?: (target?: NativeTabTarget) => Promise<NativeState | void> | NativeState | void;
      reload?: (target?: NativeTabTarget) => Promise<NativeState | void> | NativeState | void;
      getState?: (target?: NativeTabTarget) => Promise<NativeState | void> | NativeState | void;
      extractVisibleAnswer?: (target?: NativeTabTarget) => Promise<NativeExtraction> | NativeExtraction;
    };
  }
}

type NativeFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeOpenTarget = {
  tabId: string;
  url: string;
  frame: NativeFrame;
};

type NativeTabTarget = {
  tabId: string;
};

type NativeActivateTarget = NativeTabTarget & {
  frame?: NativeFrame;
  visible?: boolean;
};

type NativeFrameTarget = NativeTabTarget & {
  frame: NativeFrame;
};

type NativeState = {
  tabId?: string;
  url?: string;
  title?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loading?: boolean;
  opened?: boolean;
  closed?: boolean;
};

type NativeExtraction = {
  url: string;
  title?: string;
  prompt?: string;
  answer: string;
  selector?: string;
};

type BrowserTab = {
  id: string;
  url: string;
  title: string;
  mode: "lab" | "native" | "iframe";
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
};

type Receipt = {
  app: "BIFROST Browser";
  version: "0.1.1";
  tab_id: string;
  captured_at: string;
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

type PageHistoryEntry = {
  url: string;
  title: string;
  last_visited: string;
};

const RECEIPT_HISTORY_KEY = "bifrost.browser.receipts.v1";
const PAGE_HISTORY_KEY = "bifrost.browser.pages.v1";
const MAX_RECEIPTS = 30;
const MAX_PAGE_HISTORY = 40;

const urlInput = byId<HTMLInputElement>("urlInput");
const openButton = byId<HTMLButtonElement>("openButton");
const backButton = byId<HTMLButtonElement>("backButton");
const forwardButton = byId<HTMLButtonElement>("forwardButton");
const reloadButton = byId<HTMLButtonElement>("reloadButton");
const reloadTopButton = byId<HTMLButtonElement>("reloadTopButton");
const tabsTopButton = byId<HTMLButtonElement>("tabsTopButton");
const toolsToggleButton = byId<HTMLButtonElement>("toolsToggleButton");
const verificationToggleButton = byId<HTMLButtonElement>("verificationToggleButton");
const mobileTabsButton = byId<HTMLButtonElement>("mobileTabsButton");
const newTabButton = byId<HTMLButtonElement>("newTabButton");
const mobileNewTabButton = byId<HTMLButtonElement>("mobileNewTabButton");
const desktopTabs = byId<HTMLElement>("desktopTabs");
const mobileTabCard = byId<HTMLElement>("mobileTabCard");
const mobileTabList = byId<HTMLElement>("mobileTabList");
const verifyButton = byId<HTMLButtonElement>("verifyButton");
const browserFrame = byId<HTMLIFrameElement>("browserFrame");
const bridgeState = byId<HTMLElement>("bridgeState");
const verificationShell = byId<HTMLElement>("verificationShell");
const appShell = document.querySelector<HTMLElement>(".phone-shell");
const bifrostBadge = byId<HTMLButtonElement>("bifrostBadge");
const badgeLabel = byId<HTMLElement>("badgeLabel");
const badgeStatus = byId<HTMLElement>("badgeStatus");
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
const receiptHistoryCard = byId<HTMLElement>("receiptHistoryCard");
const receiptHistoryCount = byId<HTMLElement>("receiptHistoryCount");
const receiptHistoryList = byId<HTMLElement>("receiptHistoryList");
const recentPagesButton = byId<HTMLButtonElement>("recentPagesButton");
const receiptsButton = byId<HTMLButtonElement>("receiptsButton");
const settingsButton = byId<HTMLButtonElement>("settingsButton");
const recentPagesCard = byId<HTMLElement>("recentPagesCard");
const recentPagesCount = byId<HTMLElement>("recentPagesCount");
const recentPagesList = byId<HTMLElement>("recentPagesList");
const settingsCard = byId<HTMLElement>("settingsCard");
const clearLocalDataButton = byId<HTMLButtonElement>("clearLocalDataButton");
const mobileSettingsButton = byId<HTMLButtonElement>("mobileSettingsButton");
const libraryCards = [mobileTabCard, recentPagesCard, receiptHistoryCard, settingsCard];

let currentReceipt: Receipt | null = null;
let receiptHistory: Receipt[] = loadReceiptHistory();
let pageHistory: PageHistoryEntry[] = loadPageHistory();
const tabs: BrowserTab[] = [];
let activeTabId = "";
let currentBadgeState: "idle" | "approved" | "review" | "rejected" = "idle";

const labHtml = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BIFROST AI Lab</title>
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
        <button type="button" class="secondary" onclick="document.querySelector('[data-bifrost-answer]').textContent = 'Use Array.prototype.map to transform a list and return a new array. This answer stays within a low-stakes programming explanation and makes no current or numeric business claims.'">Clean answer</button>
      </div>
      <div class="answer" data-bifrost-answer>
        Revenue is $12.4B, EBITDA is $3.1B, debt is $4.2B, cash is $0.9B, capex is $1.2B, margin is 25%, net debt is $3.3B, and leverage is 1.06x.
      </div>
    </div>
  </main>
</body>
</html>`;

function nativePlaceholderHtml(url: string, title = "Native page") {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f8f8ff; color:#171729; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    div { max-width:360px; padding:24px; text-align:center; }
    b { display:block; color:#4648d4; font:900 12px ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.14em; }
    p { color:#6a6879; line-height:1.45; overflow-wrap:anywhere; }
  </style>
</head>
<body>
  <div>
    <b>NATIVE WEBVIEW ACTIVE</b>
    <p>${escapeHtml(title)}</p>
    <p>${escapeHtml(url)}</p>
  </div>
</body>
</html>`;
}

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

function id(prefix = "tab") {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function activeTab(): BrowserTab {
  const tab = tabs.find((item) => item.id === activeTabId);
  if (!tab) throw new Error("No active BIFROST tab.");
  return tab;
}

function createTab(url = "bifrost://lab", title = "AI Lab", activate = true): BrowserTab {
  const tab: BrowserTab = {
    id: id(),
    url,
    title,
    mode: url === "bifrost://lab" ? "lab" : "native",
    canGoBack: false,
    canGoForward: false,
    loading: false,
  };
  tabs.push(tab);
  if (activate) activeTabId = tab.id;
  renderTabs();
  renderControls();
  return tab;
}

function closeTab(tabId: string) {
  const index = tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const wasActive = activeTabId === tabId;
  tabs.splice(index, 1);
  void window.BifrostNative?.closeUrl?.({ tabId });
  if (tabs.length === 0) {
    createTab();
    void openUrl("bifrost://lab");
    return;
  }
  if (wasActive) {
    activeTabId = tabs[Math.max(0, index - 1)]?.id ?? tabs[0].id;
    void activateTab(activeTabId);
  }
  renderTabs();
  renderControls();
}

async function activateTab(tabId: string) {
  const tab = tabs.find((item) => item.id === tabId);
  if (!tab) return;
  activeTabId = tab.id;
  urlInput.value = tab.url;
  resetVerificationView();
  resetStages();
  if (tab.mode === "lab" || tab.url === "bifrost://lab") {
    await hideNativePage();
    browserFrame.removeAttribute("src");
    browserFrame.srcdoc = labHtml;
    bridgeState.textContent = "LOCAL LAB";
    setStage("capture", true);
  } else {
    browserFrame.removeAttribute("src");
    browserFrame.srcdoc = nativePlaceholderHtml(tab.url, tab.title);
    const nativeBridge = await waitForNativeBridge(450);
    if (nativeBridge?.activateTab) {
      await nativeBridge.activateTab({ tabId: tab.id, frame: browserFrameRect(), visible: true });
      bridgeState.textContent = "NATIVE WEBVIEW";
    } else if (nativeBridge?.openUrl) {
      await openUrl(tab.url);
    } else {
      browserFrame.removeAttribute("srcdoc");
      browserFrame.src = tab.url;
      bridgeState.textContent = "PREVIEW";
    }
  }
  renderTabs();
  renderControls();
}

function renderTabs() {
  for (const node of Array.from(desktopTabs.querySelectorAll("[data-tab-id]"))) node.remove();
  mobileTabList.innerHTML = "";
  for (const tab of tabs) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tabId = tab.id;
    button.className = tab.id === activeTabId ? "active" : "";
    button.innerHTML = `<span>${tab.loading ? "◌" : "●"}</span><span class="tab-title">${escapeHtml(tab.title || shortUrl(tab.url))}</span><span class="tab-close" title="Close tab">×</span>`;
    button.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).classList.contains("tab-close")) {
        event.stopPropagation();
        closeTab(tab.id);
        return;
      }
      void activateTab(tab.id);
    });
    desktopTabs.insertBefore(button, newTabButton);

    const mobileItem = document.createElement("button");
    mobileItem.type = "button";
    mobileItem.className = `mobile-tab-item${tab.id === activeTabId ? " active" : ""}`;
    mobileItem.dataset.tabId = tab.id;
    mobileItem.innerHTML = `
      <span>
        <strong>${escapeHtml(tab.title || shortUrl(tab.url))}</strong>
        <span>${escapeHtml(shortUrl(tab.url))}</span>
      </span>
      <span class="mobile-tab-close" title="Close tab">×</span>
    `;
    mobileItem.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).classList.contains("mobile-tab-close")) {
        event.stopPropagation();
        closeTab(tab.id);
        return;
      }
      void activateTab(tab.id);
      verificationShell.dataset.drawer = "compact";
    });
    mobileTabList.append(mobileItem);
  }
}

function renderControls() {
  const tab = activeTab();
  const isLab = tab.mode === "lab" || tab.url === "bifrost://lab";
  backButton.disabled = isLab || !tab.canGoBack;
  forwardButton.disabled = isLab || !tab.canGoForward;
  urlInput.value = tab.url;
  document.querySelectorAll<HTMLButtonElement>("[data-target]").forEach((button) => {
    const target = button.dataset.target ?? "";
    const active = target === tab.url || (target !== "bifrost://lab" && tab.url.startsWith(target));
    button.classList.toggle("active", active);
  });
}

function setStage(stage: string, done: boolean) {
  document.querySelector<HTMLElement>(`[data-stage="${stage}"]`)?.setAttribute("data-state", done ? "done" : "");
}

function resetStages() {
  for (const stage of ["capture", "extract", "verify", "seal"]) setStage(stage, false);
}

function resetVerificationView() {
  currentReceipt = null;
  currentBadgeState = "idle";
  verificationShell.dataset.drawer = "closed";
  appShell?.removeAttribute("data-tools");
  updateBadge("idle", "Verify", "BIFROST");
  verdictCard.dataset.state = "idle";
  verdictLabel.textContent = "READY";
  verdictHeadline.textContent = "Open an AI page inside BIFROST, then verify the visible answer.";
  confidenceBar.style.width = "0%";
  resultCard.hidden = true;
  receiptCard.hidden = true;
  hideLibraryCards();
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "bifrost://lab") return "bifrost://lab";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

async function waitForNativeBridge(timeoutMs = 800): Promise<Window["BifrostNative"] | undefined> {
  if (window.BifrostNative?.openUrl || window.BifrostNative?.activateTab) return window.BifrostNative;

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      window.removeEventListener("bifrost-native-ready", settle);
      window.clearTimeout(timer);
      resolve(window.BifrostNative?.openUrl || window.BifrostNative?.activateTab ? window.BifrostNative : undefined);
    };
    const timer = window.setTimeout(settle, timeoutMs);
    window.addEventListener("bifrost-native-ready", settle);
  });
}

async function openUrl(value = urlInput.value, tabId = activeTabId) {
  const tab = tabs.find((item) => item.id === tabId) ?? createTab();
  activeTabId = tab.id;
  resetVerificationView();
  resetStages();
  const url = normalizeUrl(value);
  tab.url = url;
  tab.title = titleForUrl(url);
  tab.canGoBack = false;
  tab.canGoForward = false;
  tab.loading = false;
  urlInput.value = url;

  if (url === "bifrost://lab") {
    tab.mode = "lab";
    tab.title = "AI Lab";
    await hideNativePage();
    browserFrame.removeAttribute("src");
    browserFrame.srcdoc = labHtml;
    bridgeState.textContent = "LOCAL LAB";
    setStage("capture", true);
    renderTabs();
    renderControls();
    return;
  }

  bridgeState.textContent = "CONNECTING";
  tab.mode = "native";
  tab.loading = true;
  browserFrame.removeAttribute("src");
  browserFrame.srcdoc = nativePlaceholderHtml(url, tab.title);
  renderTabs();
  renderControls();

  const nativeBridge = await waitForNativeBridge();
  bridgeState.textContent = nativeBridge?.openUrl ? "NATIVE WEBVIEW" : "PREVIEW";
  if (nativeBridge?.openUrl) {
    setStage("capture", true);
    const state = await nativeBridge.openUrl({ tabId: tab.id, url, frame: browserFrameRect() });
    applyNativeState(state);
    return;
  }

  tab.mode = "iframe";
  tab.loading = false;
  browserFrame.removeAttribute("srcdoc");
  browserFrame.src = url;
  setStage("capture", true);
  savePageHistory({
    url,
    title: tab.title,
    last_visited: new Date().toISOString(),
  });
  renderTabs();
  renderControls();
}

async function hideNativePage() {
  const nativeBridge = await waitForNativeBridge(200);
  const tab = tabs.find((item) => item.id === activeTabId);
  if (nativeBridge?.activateTab && tab) {
    await nativeBridge.activateTab({ tabId: tab.id, visible: false });
    return;
  }
  await nativeBridge?.closeUrl?.(tab ? { tabId: tab.id } : undefined);
}

function browserFrameRect(): NativeFrame {
  const frame = browserFrame.getBoundingClientRect();
  return {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
}

function applyNativeState(state: NativeState | void) {
  if (!state) return;
  const tab = tabs.find((item) => item.id === (state.tabId || activeTabId));
  if (!tab) return;
  if (state.url) {
    tab.url = state.url;
    if (tab.id === activeTabId) urlInput.value = state.url;
  }
  if (state.title) tab.title = state.title;
  if (typeof state.canGoBack === "boolean") tab.canGoBack = state.canGoBack;
  if (typeof state.canGoForward === "boolean") tab.canGoForward = state.canGoForward;
  if (typeof state.loading === "boolean") tab.loading = state.loading;
  if (state.opened) tab.mode = "native";
  if (isHistoryUrl(tab.url) && state.loading !== true) {
    savePageHistory({
      url: tab.url,
      title: tab.title || titleForUrl(tab.url),
      last_visited: new Date().toISOString(),
    });
  }
  renderTabs();
  renderControls();
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
      url: activeTab().url,
      title: doc.title || activeTab().title || "Controlled page",
      prompt,
      answer: answerEl.textContent.trim(),
      selector: "[data-bifrost-answer]",
    };
  } catch {
    return null;
  }
}

async function extractVisibleAnswer(): Promise<NativeExtraction> {
  const tab = activeTab();
  const nativeBridge = await waitForNativeBridge(250);
  if (tab.mode === "native") {
    try {
      const native = await nativeBridge?.extractVisibleAnswer?.({ tabId: tab.id });
      if (native?.answer?.trim()) return native;
    } catch {
      // The controlled-frame path below handles local lab and iframe fallback.
    }
  }
  const controlled = extractFromControlledFrame();
  if (controlled) return controlled;
  throw new Error("BIFROST cannot extract a visible assistant answer from this page yet.");
}

async function verifyPage() {
  currentBadgeState = "idle";
  updateBadge("idle", "Checking", "BIFROST");
  verifyButton.disabled = true;
  verifyButton.textContent = "Verifying...";
  bifrostBadge.disabled = true;
  try {
    const extraction = await extractVisibleAnswer();
    setStage("extract", true);
    const { response, metrics } = runPipeline({ input: extraction.prompt, output: extraction.answer });
    setStage("verify", true);
    const input_hash = `sha256:${await sha256(canonical({ prompt: extraction.prompt, answer: extraction.answer }))}`;
    const receiptBase = {
      app: "BIFROST Browser" as const,
      version: "0.1.1" as const,
      tab_id: activeTabId,
      captured_at: new Date().toISOString(),
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
    saveReceipt(currentReceipt);
    renderReceipt(currentReceipt);
  } catch (error) {
    renderExtractionFailure(error instanceof Error ? error.message : "Extraction failed.");
  } finally {
    verifyButton.disabled = false;
    verifyButton.textContent = "Verify Page";
    bifrostBadge.disabled = false;
  }
}

function renderReceipt(receipt: Receipt) {
  const response = receipt.response;
  const nextState = stateFor(response.descriptor.display);
  currentBadgeState = nextState;
  updateBadge(nextState, response.descriptor.display, response.descriptor.label);
  verdictCard.dataset.state = nextState;
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
  renderReceiptHistory();
}

function renderExtractionFailure(message: string) {
  currentBadgeState = "review";
  updateBadge("review", "REVIEW", "Needs page access");
  verdictCard.dataset.state = "review";
  verdictLabel.textContent = "REVIEW";
  verdictHeadline.textContent = message;
  confidenceBar.style.width = "0%";
  resultCard.hidden = true;
  receiptCard.hidden = true;
}

function renderReceiptHistory() {
  receiptHistoryCount.textContent = `${receiptHistory.length} receipt${receiptHistory.length === 1 ? "" : "s"}`;
  receiptHistoryList.innerHTML = "";
  if (receiptHistory.length === 0) {
    const empty = document.createElement("div");
    empty.className = "receipt-history-empty";
    empty.textContent = "No receipts yet.";
    receiptHistoryList.append(empty);
    return;
  }

  for (const receipt of receiptHistory.slice(0, 8)) {
    const item = document.createElement("div");
    item.className = "receipt-history-item";
    item.innerHTML = `
      <strong>${escapeHtml(receipt.response.descriptor.display)} · ${escapeHtml(receipt.title || shortUrl(receipt.url))}</strong>
      <span>${escapeHtml(shortUrl(receipt.url))}</span>
      <span>${escapeHtml(receipt.receipt_hash.slice(7, 19))} · ${new Date(receipt.captured_at).toLocaleString()}</span>
      <div class="receipt-history-actions">
        <button type="button" data-copy-receipt="${escapeHtml(receipt.receipt_hash)}">Copy</button>
        <button type="button" class="ghost" data-export-receipt="${escapeHtml(receipt.receipt_hash)}">Export</button>
      </div>
    `;
    receiptHistoryList.append(item);
  }
}

function saveReceipt(receipt: Receipt) {
  receiptHistory = [receipt, ...receiptHistory.filter((item) => item.receipt_hash !== receipt.receipt_hash)].slice(0, MAX_RECEIPTS);
  localStorage.setItem(RECEIPT_HISTORY_KEY, JSON.stringify(receiptHistory));
}

function loadReceiptHistory(): Receipt[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECEIPT_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECEIPTS) : [];
  } catch {
    return [];
  }
}

function savePageHistory(entry: PageHistoryEntry) {
  if (!isHistoryUrl(entry.url)) return;
  pageHistory = [
    entry,
    ...pageHistory.filter((item) => item.url !== entry.url),
  ].slice(0, MAX_PAGE_HISTORY);
  localStorage.setItem(PAGE_HISTORY_KEY, JSON.stringify(pageHistory));
  renderPageHistory();
}

function loadPageHistory(): PageHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAGE_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.url === "string" && typeof item?.title === "string")
      .slice(0, MAX_PAGE_HISTORY);
  } catch {
    return [];
  }
}

function renderPageHistory() {
  recentPagesCount.textContent = `${pageHistory.length} page${pageHistory.length === 1 ? "" : "s"}`;
  recentPagesList.innerHTML = "";
  if (pageHistory.length === 0) {
    const empty = document.createElement("div");
    empty.className = "recent-page-empty";
    empty.textContent = "No recent pages yet.";
    recentPagesList.append(empty);
    return;
  }

  for (const page of pageHistory.slice(0, 10)) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "recent-page-item";
    item.dataset.openRecentUrl = page.url;
    item.innerHTML = `
      <strong>${escapeHtml(page.title || shortUrl(page.url))}</strong>
      <span>${escapeHtml(shortUrl(page.url))}</span>
      <span>${new Date(page.last_visited).toLocaleString()}</span>
    `;
    recentPagesList.append(item);
  }
}

function isHistoryUrl(url: string) {
  return /^https?:\/\//i.test(url);
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

function titleForUrl(url: string) {
  if (url === "bifrost://lab") return "AI Lab";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function shortUrl(url: string) {
  if (url === "bifrost://lab") return "AI Lab";
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

async function copyReceipt(receipt = currentReceipt) {
  if (!receipt) return;
  await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
  copyReceiptButton.textContent = "Copied";
  window.setTimeout(() => {
    copyReceiptButton.textContent = "Copy Receipt";
  }, 1200);
}

function exportReceipt(receipt = currentReceipt) {
  if (!receipt) return;
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bifrost-browser-${receipt.receipt_hash.slice(7, 19)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function openDrawer(target?: HTMLElement) {
  if (target && libraryCards.includes(target)) {
    hideLibraryCards();
    target.hidden = false;
  }
  verificationShell.dataset.drawer = "expanded";
  appShell?.removeAttribute("data-tools");
  if (target) {
    window.requestAnimationFrame(() => target.scrollIntoView({ block: "nearest" }));
  }
}

function hideLibraryCards() {
  for (const card of libraryCards) card.hidden = true;
}

function closeDrawers() {
  verificationShell.dataset.drawer = "closed";
  appShell?.removeAttribute("data-tools");
}

function toggleTools() {
  const open = appShell?.dataset.tools === "open";
  verificationShell.dataset.drawer = "closed";
  appShell?.setAttribute("data-tools", open ? "closed" : "open");
  if (open) appShell?.removeAttribute("data-tools");
}

function toggleVerification() {
  appShell?.removeAttribute("data-tools");
  verificationShell.dataset.drawer = verificationShell.dataset.drawer === "expanded" ? "closed" : "expanded";
}

function updateBadge(state: "idle" | "approved" | "review" | "rejected", label: string, status: string) {
  bifrostBadge.dataset.state = state;
  badgeLabel.textContent = label;
  badgeStatus.textContent = status;
}

function clearLocalData() {
  currentReceipt = null;
  receiptHistory = [];
  pageHistory = [];
  localStorage.removeItem(RECEIPT_HISTORY_KEY);
  localStorage.removeItem(PAGE_HISTORY_KEY);
  renderReceiptHistory();
  renderPageHistory();
  resetVerificationView();
  openDrawer(settingsCard);
}

async function goBack() {
  const tab = activeTab();
  if (tab.mode === "native" && window.BifrostNative?.goBack) {
    applyNativeState(await window.BifrostNative.goBack({ tabId: tab.id }));
    return;
  }
  try {
    browserFrame.contentWindow?.history.back();
  } catch {
    // Cross-origin fallback cannot be controlled from the web workbench.
  }
}

async function goForward() {
  const tab = activeTab();
  if (tab.mode === "native" && window.BifrostNative?.goForward) {
    applyNativeState(await window.BifrostNative.goForward({ tabId: tab.id }));
    return;
  }
  try {
    browserFrame.contentWindow?.history.forward();
  } catch {
    // Cross-origin fallback cannot be controlled from the web workbench.
  }
}

async function reloadPage() {
  const tab = activeTab();
  if (tab.url === "bifrost://lab") {
    browserFrame.srcdoc = labHtml;
    return;
  }
  if (tab.mode === "native" && window.BifrostNative?.reload) {
    applyNativeState(await window.BifrostNative.reload({ tabId: tab.id }));
    return;
  }
  if (tab.mode === "iframe") {
    browserFrame.src = tab.url;
  }
}

function wire() {
  window.addEventListener("bifrost-native-ready", () => {
    if (activeTab().mode === "native") bridgeState.textContent = "NATIVE WEBVIEW";
  });
  window.addEventListener("bifrost-native-state", (event) => {
    applyNativeState((event as CustomEvent<NativeState>).detail);
  });
  const resizeObserver = new ResizeObserver(() => {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (tab?.mode === "native") {
      void window.BifrostNative?.updateFrame?.({ tabId: tab.id, frame: browserFrameRect() });
    }
  });
  resizeObserver.observe(browserFrame);

  openButton.addEventListener("click", () => void openUrl());
  backButton.addEventListener("click", () => void goBack());
  forwardButton.addEventListener("click", () => void goForward());
  reloadButton.addEventListener("click", () => void reloadPage());
  reloadTopButton.addEventListener("click", () => void reloadPage());
  toolsToggleButton.addEventListener("click", toggleTools);
  verificationToggleButton.addEventListener("click", toggleVerification);
  tabsTopButton.addEventListener("click", () => {
    openDrawer(document.getElementById("mobileTabCard") ?? undefined);
    renderTabs();
  });
  mobileTabsButton.addEventListener("click", () => {
    openDrawer(document.getElementById("mobileTabCard") ?? undefined);
    renderTabs();
  });
  newTabButton.addEventListener("click", () => {
    const tab = createTab();
    void activateTab(tab.id);
  });
  mobileNewTabButton.addEventListener("click", () => {
    const tab = createTab();
    void activateTab(tab.id);
  });
  verifyButton.addEventListener("click", () => void verifyPage());
  bifrostBadge.addEventListener("click", () => {
    if (currentReceipt || currentBadgeState !== "idle") {
      openDrawer(resultCard.hidden ? verdictCard : resultCard);
      return;
    }
    void verifyPage();
  });
  browseButton.addEventListener("click", () => {
    closeDrawers();
  });
  copyReceiptButton.addEventListener("click", () => void copyReceipt());
  exportReceiptButton.addEventListener("click", () => exportReceipt());
  recentPagesButton.addEventListener("click", () => openDrawer(recentPagesCard));
  receiptsButton.addEventListener("click", () => openDrawer(receiptHistoryCard));
  settingsButton.addEventListener("click", () => openDrawer(settingsCard));
  mobileSettingsButton.addEventListener("click", () => openDrawer(settingsCard));
  clearLocalDataButton.addEventListener("click", clearLocalData);
  recentPagesList.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-open-recent-url]");
    const url = target?.dataset.openRecentUrl;
    if (!url) return;
    void openUrl(url);
  });
  receiptHistoryList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const copyHash = target.getAttribute("data-copy-receipt");
    const exportHash = target.getAttribute("data-export-receipt");
    if (copyHash) {
      const receipt = receiptHistory.find((item) => item.receipt_hash === copyHash);
      void copyReceipt(receipt);
    }
    if (exportHash) {
      const receipt = receiptHistory.find((item) => item.receipt_hash === exportHash);
      exportReceipt(receipt);
    }
  });
  urlInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void openUrl();
  });
  browserFrame.addEventListener("load", () => {
    const tab = activeTab();
    if (tab.mode !== "native") tab.loading = false;
    if (tab.mode === "lab") tab.title = "AI Lab";
    renderTabs();
    renderControls();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-target]").forEach((button) => {
    button.addEventListener("click", () => {
      closeDrawers();
      void openUrl(button.dataset.target ?? "bifrost://lab");
    });
  });
}

createTab();
wire();
renderReceiptHistory();
renderPageHistory();
void openUrl("bifrost://lab");
