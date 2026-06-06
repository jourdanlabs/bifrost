const { app, BrowserView, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");

let mainWindow = null;
let pageView = null;
let lastBounds = null;

const extractionScript = `
(function () {
  const selectors = [
    "[data-bifrost-answer]",
    "[data-message-author-role='assistant']",
    "[data-testid*='assistant']",
    "[class*='assistant']",
    "article"
  ];
  function visible(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }
  let chosen = null;
  let selector = "";
  for (const current of selectors) {
    const matches = Array.from(document.querySelectorAll(current)).filter(visible);
    if (matches.length > 0) {
      chosen = matches[matches.length - 1];
      selector = current;
      break;
    }
  }
  if (!chosen) {
    const blocks = Array.from(document.querySelectorAll("main, section, div"))
      .filter(visible)
      .map((el) => ({ el, text: (el.innerText || el.textContent || "").trim() }))
      .filter((item) => item.text.length > 120 && item.text.length < 12000)
      .sort((a, b) => b.text.length - a.text.length);
    if (blocks.length > 0) {
      chosen = blocks[0].el;
      selector = "visible-text-block";
    }
  }
  const promptEl = document.querySelector("[data-bifrost-prompt], [data-message-author-role='user']");
  return {
    url: location.href,
    title: document.title || "",
    prompt: promptEl ? (promptEl.innerText || promptEl.textContent || "").trim() : "",
    answer: chosen ? (chosen.innerText || chosen.textContent || "").trim() : "",
    selector
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
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(distPath("index.html"), { query: { shell: "desktop" } });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
    pageView = null;
    lastBounds = null;
  });
  mainWindow.on("resize", () => {
    if (pageView && lastBounds) pageView.setBounds(clampBounds(lastBounds));
  });
}

function ensurePageView() {
  if (!mainWindow) throw new Error("BIFROST Browser window is not ready.");
  if (pageView) return pageView;

  pageView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.addBrowserView(pageView);
  pageView.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return pageView;
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

function waitForPageLoad(view, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      view.webContents.removeListener("did-finish-load", onFinish);
      view.webContents.removeListener("did-fail-load", onFail);
      fn(value);
    };
    const onFinish = () => settle(resolve, undefined);
    const onFail = (_event, _code, description) => settle(reject, new Error(description || "Native page load failed."));
    const timer = setTimeout(() => settle(resolve, undefined), timeoutMs);
    view.webContents.once("did-finish-load", onFinish);
    view.webContents.once("did-fail-load", onFail);
  });
}

ipcMain.handle("bifrost:open-url", async (_event, target) => {
  const url = validatedUrl(target?.url);
  const view = ensurePageView();
  lastBounds = target?.frame || null;
  view.setBounds(clampBounds(lastBounds || {}));
  void view.webContents.loadURL(url).catch(() => {});
  return {
    opened: true,
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
  };
});

ipcMain.handle("bifrost:close-url", async () => {
  if (mainWindow && pageView) {
    mainWindow.removeBrowserView(pageView);
    pageView.webContents.destroy();
  }
  pageView = null;
  lastBounds = null;
  return { closed: true };
});

ipcMain.handle("bifrost:extract-visible-answer", async () => {
  if (!pageView) throw new Error("No native page is open in BIFROST Browser.");
  const payload = await pageView.webContents.executeJavaScript(extractionScript, true);
  if (!payload?.answer?.trim()) {
    throw new Error("BIFROST could not find a visible assistant answer on this page.");
  }
  return payload;
});

app.whenReady().then(createMainWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
