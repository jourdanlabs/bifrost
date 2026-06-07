const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("BifrostNative", {
  __nativeBridge: true,
  openUrl(target) {
    const payload = typeof target === "string" ? { url: target } : target || {};
    return ipcRenderer.invoke("bifrost:open-url", payload);
  },
  closeUrl(target) {
    return ipcRenderer.invoke("bifrost:close-url", target || {});
  },
  activateTab(target) {
    return ipcRenderer.invoke("bifrost:activate-tab", target || {});
  },
  updateFrame(target) {
    return ipcRenderer.invoke("bifrost:update-frame", target || {});
  },
  goBack(target) {
    return ipcRenderer.invoke("bifrost:go-back", target || {});
  },
  goForward(target) {
    return ipcRenderer.invoke("bifrost:go-forward", target || {});
  },
  reload(target) {
    return ipcRenderer.invoke("bifrost:reload", target || {});
  },
  getState(target) {
    return ipcRenderer.invoke("bifrost:get-state", target || {});
  },
  extractVisibleAnswer(target) {
    return ipcRenderer.invoke("bifrost:extract-visible-answer", target || {});
  },
});

ipcRenderer.on("bifrost:navigation-state", (_event, payload) => {
  window.dispatchEvent(new CustomEvent("bifrost-native-state", { detail: payload }));
});

window.addEventListener("DOMContentLoaded", () => {
  window.dispatchEvent(new CustomEvent("bifrost-native-ready"));
});
