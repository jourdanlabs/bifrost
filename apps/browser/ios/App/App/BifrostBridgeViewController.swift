import Capacitor
import UIKit
import WebKit

@objc(BifrostBridgeViewController)
class BifrostBridgeViewController: CAPBridgeViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var targetWebView: WKWebView?
    private var pendingOpenCallbackId: String?
    private var lastFrame: CGRect = .zero

    override func viewDidLoad() {
        super.viewDidLoad()
        NSLog("BIFROST native bridge controller loaded")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        installNativeBridgeOnCurrentDocument()
    }

    override func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let configuration = super.webViewConfiguration(for: instanceConfiguration)
        NSLog("BIFROST native bridge configuring Capacitor WebView")
        configuration.userContentController.addUserScript(WKUserScript(
            source: Self.nativeBridgeScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        configuration.userContentController.add(self, name: "bifrostNative")
        return configuration
    }

    private func installNativeBridgeOnCurrentDocument() {
        guard let webView else {
            NSLog("BIFROST native bridge skipped install: Capacitor WebView unavailable")
            return
        }

        webView.evaluateJavaScript(Self.nativeBridgeScript) { _, error in
            if let error {
                NSLog("BIFROST native bridge install failed: \(error.localizedDescription)")
            } else {
                NSLog("BIFROST native bridge installed on current document")
            }
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        if !lastFrame.isEmpty {
            targetWebView?.frame = lastFrame
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "bifrostNative",
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let method = body["method"] as? String else {
            return
        }

        switch method {
        case "openUrl":
            openUrl(id: id, body: body)
        case "closeUrl":
            closeUrl(id: id)
        case "extractVisibleAnswer":
            extractVisibleAnswer(id: id)
        default:
            reject(id: id, message: "Unknown BIFROST native method: \(method)")
        }
    }

    private func openUrl(id: String, body: [String: Any]) {
        guard let rawUrl = body["url"] as? String,
              let url = URL(string: rawUrl),
              ["http", "https"].contains((url.scheme ?? "").lowercased()) else {
            reject(id: id, message: "BIFROST native browser only opens http/https pages.")
            return
        }

        NSLog("BIFROST native opening URL: \(rawUrl)")
        let frame = frameFrom(body["frame"]) ?? defaultTargetFrame()
        lastFrame = frame

        let nativeWebView = targetWebView ?? createTargetWebView(frame: frame)
        nativeWebView.frame = frame
        nativeWebView.isHidden = false
        view.bringSubviewToFront(nativeWebView)

        pendingOpenCallbackId = id
        nativeWebView.load(URLRequest(url: url))
    }

    private func closeUrl(id: String) {
        pendingOpenCallbackId = nil
        targetWebView?.stopLoading()
        targetWebView?.isHidden = true
        resolve(id: id, payload: ["closed": true])
    }

    private func extractVisibleAnswer(id: String) {
        guard let nativeWebView = targetWebView, !nativeWebView.isHidden else {
            reject(id: id, message: "No native page is open in BIFROST Browser.")
            return
        }

        nativeWebView.evaluateJavaScript(Self.extractionScript) { result, error in
            if let error {
                self.reject(id: id, message: "Native extraction failed: \(error.localizedDescription)")
                return
            }

            guard let payload = result as? [String: Any],
                  let answer = payload["answer"] as? String,
                  !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                self.reject(id: id, message: "BIFROST could not find a visible assistant answer on this page.")
                return
            }

            self.resolve(id: id, payload: payload)
        }
    }

    private func createTargetWebView(frame: CGRect) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        let nativeWebView = WKWebView(frame: frame, configuration: configuration)
        nativeWebView.navigationDelegate = self
        nativeWebView.allowsBackForwardNavigationGestures = true
        nativeWebView.scrollView.contentInsetAdjustmentBehavior = .never
        nativeWebView.backgroundColor = .white
        nativeWebView.isOpaque = true
        view.addSubview(nativeWebView)
        targetWebView = nativeWebView
        return nativeWebView
    }

    private func frameFrom(_ value: Any?) -> CGRect? {
        guard let frame = value as? [String: Any],
              let x = number(frame["x"]),
              let y = number(frame["y"]),
              let width = number(frame["width"]),
              let height = number(frame["height"]),
              width > 0,
              height > 0 else {
            return nil
        }

        let bounds = view.bounds
        let clampedX = max(0, min(x, bounds.width))
        let clampedY = max(0, min(y, bounds.height))
        let clampedWidth = max(1, min(width, bounds.width - clampedX))
        let clampedHeight = max(1, min(height, bounds.height - clampedY))
        return CGRect(x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight)
    }

    private func defaultTargetFrame() -> CGRect {
        let top = view.safeAreaInsets.top + 162
        let bottom = view.safeAreaInsets.bottom + 238
        return CGRect(
            x: 0,
            y: top,
            width: view.bounds.width,
            height: max(120, view.bounds.height - top - bottom)
        )
    }

    private func number(_ value: Any?) -> CGFloat? {
        if let number = value as? NSNumber {
            return CGFloat(truncating: number)
        }
        if let double = value as? Double {
            return CGFloat(double)
        }
        if let int = value as? Int {
            return CGFloat(int)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let id = pendingOpenCallbackId else {
            return
        }
        pendingOpenCallbackId = nil
        resolve(id: id, payload: [
            "url": webView.url?.absoluteString ?? "",
            "title": webView.title ?? "",
            "opened": true
        ])
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        rejectPendingOpen(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        rejectPendingOpen(error)
    }

    private func rejectPendingOpen(_ error: Error) {
        guard let id = pendingOpenCallbackId else {
            return
        }
        pendingOpenCallbackId = nil
        reject(id: id, message: "Native page load failed: \(error.localizedDescription)")
    }

    private func resolve(id: String, payload: [String: Any]) {
        callback(functionName: "__bifrostNativeResolve", id: id, payload: payload)
    }

    private func reject(id: String, message: String) {
        callback(functionName: "__bifrostNativeReject", id: id, payload: ["message": message])
    }

    private func callback(functionName: String, id: String, payload: [String: Any]) {
        guard let webView else {
            return
        }

        var callbackPayload = payload
        callbackPayload["id"] = id
        guard let data = try? JSONSerialization.data(withJSONObject: callbackPayload, options: []),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        webView.evaluateJavaScript("window.\(functionName)(\(json));")
    }

    private static let nativeBridgeScript = """
    (function () {
      if (window.BifrostNative && window.BifrostNative.__nativeBridge === true) return;
      const pending = new Map();
      function send(method, payload) {
        const id = "bifrost_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
        return new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          window.webkit.messageHandlers.bifrostNative.postMessage(Object.assign({ id, method }, payload || {}));
        });
      }
      window.__bifrostNativeResolve = function (payload) {
        const entry = pending.get(payload.id);
        if (!entry) return;
        pending.delete(payload.id);
        delete payload.id;
        entry.resolve(payload);
      };
      window.__bifrostNativeReject = function (payload) {
        const entry = pending.get(payload.id);
        if (!entry) return;
        pending.delete(payload.id);
        entry.reject(new Error(payload.message || "BIFROST native bridge failed."));
      };
      window.BifrostNative = {
        __nativeBridge: true,
        openUrl: function (target) {
          if (typeof target === "string") return send("openUrl", { url: target });
          return send("openUrl", target || {});
        },
        closeUrl: function () {
          return send("closeUrl", {});
        },
        extractVisibleAnswer: function () {
          return send("extractVisibleAnswer", {});
        }
      };
      window.dispatchEvent(new CustomEvent("bifrost-native-ready"));
    })();
    """

    private static let extractionScript = """
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
    """
}
