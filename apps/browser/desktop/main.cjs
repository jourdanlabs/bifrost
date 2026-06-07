const { app, BrowserView, BrowserWindow, ipcMain, session } = require("electron");
const path = require("node:path");

let mainWindow = null;
let activeTabId = null;
const pageViews = new Map();
const viewBounds = new Map();
const blockedTrackerHosts = [
  "adservice.google.com",
  "ads.linkedin.com",
  "analytics.google.com",
  "connect.facebook.net",
  "doubleclick.net",
  "facebook.com",
  "google-analytics.com",
  "googlesyndication.com",
  "googletagmanager.com",
  "hotjar.com",
  "mixpanel.com",
  "outbrain.com",
  "scorecardresearch.com",
  "segment.io",
  "taboola.com",
];

const extractionScript = `
(function () {
  const assistantSelectors = [
    "[data-bifrost-answer]",
    "[data-message-author-role='assistant']",
    "[data-testid='assistant-message']",
    "[data-testid*='assistant']",
    "[data-testid*='bot']",
    "[class*='assistant']",
    "[class*='Assistant']",
    "[class*='response']",
    "[class*='Response']",
    "message-content",
    "model-response",
    ".markdown",
    ".prose",
    "article"
  ];
  const promptSelectors = [
    "[data-bifrost-prompt]",
    "[data-message-author-role='user']",
    "[data-testid*='user']",
    "textarea",
    "[contenteditable='true']",
    "[aria-label*='prompt' i]"
  ];
  function textOf(el) {
    return (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
  }
  function visible(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight + 2400;
  }
  function score(el, text, selector, index) {
    const rect = el.getBoundingClientRect();
    let value = Math.min(text.length, 3600);
    if (/assistant|response|markdown|prose/i.test(selector)) value += 1200;
    if (rect.bottom > 0) value += Math.max(0, rect.bottom);
    return value + index;
  }
  function candidate(selector, el, index) {
    const text = textOf(el);
    if (!text || text.length < 24 || text.length > 24000 || !visible(el)) return null;
    return { el, text, selector, score: score(el, text, selector, index) };
  }
  let candidates = [];
  let selector = "";
  for (const current of assistantSelectors) {
    const matches = Array.from(document.querySelectorAll(current))
      .map((el, index) => candidate(current, el, index))
      .filter(Boolean);
    if (matches.length > 0) {
      candidates = matches;
      selector = current;
      break;
    }
  }
  if (candidates.length === 0) {
    const blocks = Array.from(document.querySelectorAll("main, section, div"))
      .filter(visible)
      .map((el, index) => {
        const text = textOf(el);
        if (text.length < 80 || text.length > 16000) return null;
        if (/sign in|cookie|privacy policy|terms of service/i.test(text.slice(0, 400))) return null;
        return { el, text, selector: "visible-text-block", score: score(el, text, "visible-text-block", index) };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (blocks.length > 0) {
      candidates = blocks;
      selector = "visible-text-block";
    }
  }
  const chosen = candidates[0];
  let promptEl = null;
  for (const current of promptSelectors) {
    const matches = Array.from(document.querySelectorAll(current)).filter(visible);
    if (matches.length > 0) {
      promptEl = matches[matches.length - 1];
      break;
    }
  }
  return {
    url: location.href,
    title: document.title || "",
    prompt: promptEl ? textOf(promptEl) : "",
    answer: chosen ? chosen.text : "",
    selector: chosen ? selector : ""
  };
})();
`;

function distPath(file) {
  return path.join(__dirname, "..", "dist", file);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 680,
    title: "BIFROST Browser",
    backgroundColor: "#f0f3ff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(distPath("index.html"), { query: { shell: "desktop" } });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    for (const view of pageViews.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.destroy();
    }
    pageViews.clear();
    viewBounds.clear();
    mainWindow = null;
    activeTabId = null;
  });
  mainWindow.on("resize", () => {
    if (!activeTabId) return;
    const view = pageViews.get(activeTabId);
    const bounds = viewBounds.get(activeTabId);
    if (view && bounds) view.setBounds(clampBounds(bounds));
  });
}

function ensurePageView(tabId) {
  if (!mainWindow) throw new Error("BIFROST Browser window is not ready.");
  const existing = pageViews.get(tabId);
  if (existing && !existing.webContents.isDestroyed()) return existing;

  const view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  pageViews.set(tabId, view);
  view.webContents.setWindowOpenHandler(({ url }) => {
    try {
      void view.webContents.loadURL(validatedUrl(url)).catch(() => {});
    } catch {
      sendState(tabId, { loading: false, title: "Blocked unsafe navigation" });
    }
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    try {
      validatedUrl(url);
    } catch {
      event.preventDefault();
      sendState(tabId, { loading: false, title: "Blocked unsafe navigation" });
    }
  });
  view.webContents.on("did-start-loading", () => sendState(tabId, { loading: true }));
  view.webContents.on("did-stop-loading", () => sendState(tabId, { loading: false }));
  view.webContents.on("did-finish-load", () => sendState(tabId));
  view.webContents.on("did-navigate", () => sendState(tabId));
  view.webContents.on("did-navigate-in-page", () => sendState(tabId));
  view.webContents.on("page-title-updated", () => sendState(tabId));
  view.webContents.on("did-fail-load", (_event, _code, description) => {
    sendState(tabId, { loading: false, title: description || "Load failed" });
  });
  return view;
}

function attachView(tabId, frame) {
  if (!mainWindow) throw new Error("BIFROST Browser window is not ready.");
  const view = ensurePageView(tabId);
  detachViewsExcept(tabId);
  if (!mainWindow.getBrowserViews().includes(view)) {
    mainWindow.addBrowserView(view);
  }
  const bounds = frame ? clampBounds(frame) : clampBounds(viewBounds.get(tabId) || {});
  viewBounds.set(tabId, bounds);
  view.setBounds(bounds);
  activeTabId = tabId;
  return view;
}

function detachViewsExcept(tabId) {
  if (!mainWindow) return;
  for (const [id, view] of pageViews.entries()) {
    if (id !== tabId && mainWindow.getBrowserViews().includes(view)) {
      mainWindow.removeBrowserView(view);
    }
  }
}

function detachAllViews() {
  if (!mainWindow) return;
  for (const view of mainWindow.getBrowserViews()) {
    mainWindow.removeBrowserView(view);
  }
  activeTabId = null;
}

function clampBounds(frame) {
  if (!mainWindow) return { x: 0, y: 0, width: 1, height: 1 };
  const [contentWidth, contentHeight] = mainWindow.getContentSize();
  const x = Math.max(0, Math.min(Math.round(Number(frame.x) || 0), contentWidth - 1));
  const y = Math.max(0, Math.min(Math.round(Number(frame.y) || 0), contentHeight - 1));
  const width = Math.max(1, Math.min(Math.round(Number(frame.width) || contentWidth), contentWidth - x));
  const height = Math.max(1, Math.min(Math.round(Number(frame.height) || 360), contentHeight - y));
  return { x, y, width, height };
}

function validatedUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("BIFROST native browser only opens http/https pages.");
  }
  return url.toString();
}

function isTrackerUrl(rawUrl) {
  try {
    const hostname = new URL(String(rawUrl || "")).hostname.replace(/^www\./, "").toLowerCase();
    return blockedTrackerHosts.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

function stateFor(tabId, patch = {}) {
  const view = pageViews.get(tabId);
  return {
    tabId,
    url: view && !view.webContents.isDestroyed() ? view.webContents.getURL() : "",
    title: view && !view.webContents.isDestroyed() ? view.webContents.getTitle() : "",
    canGoBack: view && !view.webContents.isDestroyed() ? canGoBack(view) : false,
    canGoForward: view && !view.webContents.isDestroyed() ? canGoForward(view) : false,
    loading: view && !view.webContents.isDestroyed() ? view.webContents.isLoading() : false,
    ...patch,
  };
}

function canGoBack(view) {
  return view.webContents.navigationHistory?.canGoBack?.() ?? view.webContents.canGoBack();
}

function canGoForward(view) {
  return view.webContents.navigationHistory?.canGoForward?.() ?? view.webContents.canGoForward();
}

function goBack(view) {
  if (view.webContents.navigationHistory?.canGoBack?.()) {
    view.webContents.navigationHistory.goBack();
    return;
  }
  if (view.webContents.canGoBack()) view.webContents.goBack();
}

function goForward(view) {
  if (view.webContents.navigationHistory?.canGoForward?.()) {
    view.webContents.navigationHistory.goForward();
    return;
  }
  if (view.webContents.canGoForward()) view.webContents.goForward();
}

function sendState(tabId, patch = {}) {
  const payload = stateFor(tabId, patch);
  if (mainWindow && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send("bifrost:navigation-state", payload);
  }
  return payload;
}

function targetTabId(target) {
  return target?.tabId || activeTabId || "tab_default";
}

ipcMain.handle("bifrost:open-url", async (_event, target) => {
  const tabId = targetTabId(target);
  const url = validatedUrl(target?.url);
  const view = attachView(tabId, target?.frame);
  void view.webContents.loadURL(url).catch((error) => {
    sendState(tabId, { loading: false, title: error.message || "Load failed" });
  });
  return sendState(tabId, { opened: true, url, loading: true });
});

ipcMain.handle("bifrost:activate-tab", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  if (target.visible === false) {
    detachAllViews();
    return { tabId, closed: false, loading: false };
  }
  const view = pageViews.get(tabId);
  if (!view) return { tabId, opened: false, loading: false };
  attachView(tabId, target.frame);
  return stateFor(tabId, { opened: true });
});

ipcMain.handle("bifrost:update-frame", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  const view = pageViews.get(tabId);
  if (!view || activeTabId !== tabId) return stateFor(tabId);
  const bounds = clampBounds(target.frame || {});
  viewBounds.set(tabId, bounds);
  view.setBounds(bounds);
  return stateFor(tabId);
});

ipcMain.handle("bifrost:close-url", async (_event, target = {}) => {
  const tabId = typeof target === "string" ? target : targetTabId(target);
  const view = pageViews.get(tabId);
  if (mainWindow && view && mainWindow.getBrowserViews().includes(view)) {
    mainWindow.removeBrowserView(view);
  }
  if (view && !view.webContents.isDestroyed()) view.webContents.destroy();
  pageViews.delete(tabId);
  viewBounds.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
  return { tabId, closed: true, loading: false };
});

ipcMain.handle("bifrost:go-back", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  const view = pageViews.get(tabId);
  if (view) goBack(view);
  return stateFor(tabId);
});

ipcMain.handle("bifrost:go-forward", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  const view = pageViews.get(tabId);
  if (view) goForward(view);
  return stateFor(tabId);
});

ipcMain.handle("bifrost:reload", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  const view = pageViews.get(tabId);
  view?.webContents.reload();
  return stateFor(tabId, { loading: true });
});

ipcMain.handle("bifrost:get-state", async (_event, target = {}) => {
  return stateFor(targetTabId(target));
});

ipcMain.handle("bifrost:extract-visible-answer", async (_event, target = {}) => {
  const tabId = targetTabId(target);
  const view = pageViews.get(tabId);
  if (!view || view.webContents.isDestroyed()) throw new Error("No native page is open in BIFROST Browser.");
  const payload = await view.webContents.executeJavaScript(extractionScript, true);
  if (!payload?.answer?.trim()) {
    throw new Error("BIFROST could not find a visible assistant answer on this page.");
  }
  return payload;
});

function configureSecurity() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: isTrackerUrl(details.url) });
  });
}

app.whenReady().then(() => {
  configureSecurity();
  createMainWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
