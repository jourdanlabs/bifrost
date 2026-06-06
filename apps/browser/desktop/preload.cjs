const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("BifrostNative", {
  __nativeBridge: true,
  openUrl(target) {
    const payload = typeof target === "string" ? { url: target } : target || {};
    return ipcRenderer.invoke("bifrost:open-url", payload);
  },
  closeUrl() {
    return ipcRenderer.invoke("bifrost:close-url");
  },
  extractVisibleAnswer() {
    return ipcRenderer.invoke("bifrost:extract-visible-answer");
  },
});

window.addEventListener("DOMContentLoaded", () => {
  window.dispatchEvent(new CustomEvent("bifrost-native-ready"));
});
