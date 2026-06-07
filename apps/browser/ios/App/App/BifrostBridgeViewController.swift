import Capacitor
import UIKit
import WebKit

@objc(BifrostBridgeViewController)
class BifrostBridgeViewController: CAPBridgeViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private var targetWebViews: [String: WKWebView] = [:]
    private var pendingOpenCallbacks: [String: String] = [:]
    private var activeTabId: String = "tab_default"
    private var lastFrame: CGRect = .zero
    private var trackerRuleList: WKContentRuleList?

    override func viewDidLoad() {
        super.viewDidLoad()
        NSLog("BIFROST native bridge controller loaded")
        prepareTrackerRuleList()
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
            for webView in targetWebViews.values {
                webView.frame = lastFrame
            }
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
        case "activateTab":
            activateTab(id: id, body: body)
        case "updateFrame":
            updateFrame(id: id, body: body)
        case "closeUrl":
            closeUrl(id: id, body: body)
        case "goBack":
            goBack(id: id)
        case "goForward":
            goForward(id: id)
        case "reload":
            reload(id: id)
        case "getState":
            resolve(id: id, payload: statePayload())
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

        activeTabId = body["tabId"] as? String ?? activeTabId
        NSLog("BIFROST native opening URL: \(rawUrl)")
        let frame = frameFrom(body["frame"]) ?? defaultTargetFrame()
        lastFrame = frame

        let nativeWebView = targetWebViews[activeTabId] ?? createTargetWebView(tabId: activeTabId, frame: frame)
        nativeWebView.frame = frame
        nativeWebView.isHidden = false
        hideTargetWebViews(except: activeTabId)
        view.bringSubviewToFront(nativeWebView)

        pendingOpenCallbacks[activeTabId] = id
        sendState(["loading": true, "url": rawUrl, "opened": true], tabId: activeTabId)
        nativeWebView.load(URLRequest(url: url))
    }

    private func activateTab(id: String, body: [String: Any]) {
        activeTabId = body["tabId"] as? String ?? activeTabId
        if let visible = body["visible"] as? Bool, visible == false {
            hideTargetWebViews(except: nil)
            resolve(id: id, payload: statePayload(["closed": false, "loading": false], tabId: activeTabId))
            sendState(["loading": false], tabId: activeTabId)
            return
        }

        if let frame = frameFrom(body["frame"]) {
            lastFrame = frame
            targetWebViews[activeTabId]?.frame = frame
        }
        hideTargetWebViews(except: activeTabId)
        if let targetWebView = targetWebViews[activeTabId] {
            targetWebView.isHidden = false
            view.bringSubviewToFront(targetWebView)
        }
        resolve(id: id, payload: statePayload(["opened": true], tabId: activeTabId))
        sendState(["opened": true], tabId: activeTabId)
    }

    private func updateFrame(id: String, body: [String: Any]) {
        activeTabId = body["tabId"] as? String ?? activeTabId
        if let frame = frameFrom(body["frame"]) {
            lastFrame = frame
            for webView in targetWebViews.values {
                webView.frame = frame
            }
        }
        resolve(id: id, payload: statePayload(tabId: activeTabId))
    }

    private func closeUrl(id: String, body: [String: Any]) {
        let tabId = body["tabId"] as? String ?? activeTabId
        pendingOpenCallbacks[tabId] = nil
        if let targetWebView = targetWebViews[tabId] {
            targetWebView.stopLoading()
            targetWebView.navigationDelegate = nil
            targetWebView.removeFromSuperview()
            targetWebViews[tabId] = nil
        }
        resolve(id: id, payload: statePayload(["tabId": tabId, "closed": true, "loading": false], tabId: tabId))
        sendState(["closed": true, "loading": false], tabId: tabId)
    }

    private func goBack(id: String) {
        if targetWebViews[activeTabId]?.canGoBack == true {
            targetWebViews[activeTabId]?.goBack()
        }
        resolve(id: id, payload: statePayload(tabId: activeTabId))
    }

    private func goForward(id: String) {
        if targetWebViews[activeTabId]?.canGoForward == true {
            targetWebViews[activeTabId]?.goForward()
        }
        resolve(id: id, payload: statePayload(tabId: activeTabId))
    }

    private func reload(id: String) {
        targetWebViews[activeTabId]?.reload()
        resolve(id: id, payload: statePayload(["loading": true], tabId: activeTabId))
    }

    private func extractVisibleAnswer(id: String) {
        guard let nativeWebView = targetWebViews[activeTabId], !nativeWebView.isHidden else {
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

    private func createTargetWebView(tabId: String, frame: CGRect) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        let nativeWebView = WKWebView(frame: frame, configuration: configuration)
        nativeWebView.navigationDelegate = self
        nativeWebView.allowsBackForwardNavigationGestures = true
        nativeWebView.scrollView.contentInsetAdjustmentBehavior = .never
        nativeWebView.backgroundColor = .white
        nativeWebView.isOpaque = true
        installTrackerRules(on: nativeWebView)
        view.addSubview(nativeWebView)
        targetWebViews[tabId] = nativeWebView
        return nativeWebView
    }

    private func prepareTrackerRuleList() {
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "BifrostTrackerRules",
            encodedContentRuleList: Self.trackerRuleListJson
        ) { ruleList, error in
            if let error {
                NSLog("BIFROST tracker rule compile failed: \(error.localizedDescription)")
                return
            }
            guard let ruleList else {
                return
            }
            DispatchQueue.main.async {
                self.trackerRuleList = ruleList
                for webView in self.targetWebViews.values {
                    webView.configuration.userContentController.add(ruleList)
                }
            }
        }
    }

    private func installTrackerRules(on webView: WKWebView) {
        if let trackerRuleList {
            webView.configuration.userContentController.add(trackerRuleList)
        }
    }

    private func hideTargetWebViews(except visibleTabId: String?) {
        for (tabId, webView) in targetWebViews {
            webView.isHidden = tabId != visibleTabId
        }
    }

    private func tabId(for webView: WKWebView) -> String? {
        targetWebViews.first { entry in
            entry.value === webView
        }?.key
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

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        let scheme = (url.scheme ?? "").lowercased()
        if ["http", "https", "about"].contains(scheme) {
            decisionHandler(.allow)
            return
        }

        sendState(["loading": false, "title": "Blocked unsafe navigation"], tabId: tabId(for: webView) ?? activeTabId)
        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let tabId = tabId(for: webView) ?? activeTabId
        sendState(["loading": false, "opened": true], tabId: tabId)
        guard let id = pendingOpenCallbacks[tabId] else {
            return
        }
        pendingOpenCallbacks[tabId] = nil
        resolve(id: id, payload: statePayload(["opened": true, "loading": false], tabId: tabId))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let tabId = tabId(for: webView) ?? activeTabId
        sendState(["loading": false, "title": error.localizedDescription], tabId: tabId)
        rejectPendingOpen(error, tabId: tabId)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let tabId = tabId(for: webView) ?? activeTabId
        sendState(["loading": false, "title": error.localizedDescription], tabId: tabId)
        rejectPendingOpen(error, tabId: tabId)
    }

    private func rejectPendingOpen(_ error: Error, tabId: String) {
        guard let id = pendingOpenCallbacks[tabId] else {
            return
        }
        pendingOpenCallbacks[tabId] = nil
        reject(id: id, message: "Native page load failed: \(error.localizedDescription)")
    }

    private func resolve(id: String, payload: [String: Any]) {
        callback(functionName: "__bifrostNativeResolve", id: id, payload: payload)
    }

    private func reject(id: String, message: String) {
        callback(functionName: "__bifrostNativeReject", id: id, payload: ["message": message])
    }

    private func statePayload(_ patch: [String: Any] = [:], tabId requestedTabId: String? = nil) -> [String: Any] {
        let tabId = requestedTabId ?? activeTabId
        let targetWebView = targetWebViews[tabId]
        var payload: [String: Any] = [
            "tabId": tabId,
            "url": targetWebView?.url?.absoluteString ?? "",
            "title": targetWebView?.title ?? "",
            "canGoBack": targetWebView?.canGoBack ?? false,
            "canGoForward": targetWebView?.canGoForward ?? false,
            "loading": targetWebView?.isLoading ?? false
        ]
        for (key, value) in patch {
            payload[key] = value
        }
        return payload
    }

    private func sendState(_ patch: [String: Any] = [:], tabId: String? = nil) {
        guard let webView else {
            return
        }
        let payload = statePayload(patch, tabId: tabId)
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('bifrost-native-state', { detail: \(json) }));")
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
        closeUrl: function (target) {
          if (typeof target === "string") return send("closeUrl", { tabId: target });
          return send("closeUrl", target || {});
        },
        activateTab: function (target) {
          return send("activateTab", target || {});
        },
        updateFrame: function (target) {
          return send("updateFrame", target || {});
        },
        goBack: function (target) {
          return send("goBack", target || {});
        },
        goForward: function (target) {
          return send("goForward", target || {});
        },
        reload: function (target) {
          return send("reload", target || {});
        },
        getState: function (target) {
          return send("getState", target || {});
        },
        extractVisibleAnswer: function (target) {
          return send("extractVisibleAnswer", target || {});
        }
      };
      window.dispatchEvent(new CustomEvent("bifrost-native-ready"));
    })();
    """

    private static let trackerRuleListJson = """
    [
      { "trigger": { "url-filter": ".*adservice.google.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*ads.linkedin.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*analytics.google.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*connect.facebook.net.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*doubleclick.net.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*google-analytics.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*googlesyndication.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*googletagmanager.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*hotjar.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*mixpanel.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*outbrain.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*scorecardresearch.com.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*segment.io.*" }, "action": { "type": "block" } },
      { "trigger": { "url-filter": ".*taboola.com.*" }, "action": { "type": "block" } }
    ]
    """

    private static let extractionScript = """
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
    """
}
