// Anthropic / Claude.ai adapter.

import { Adapter, ResponseTarget } from "./types";

// Claude renders assistant messages with [data-test-render-count] on
// streaming text, and `data-is-streaming` toggles while a response is live.
// Selectors are best-effort and may need updating if the UI changes.
const ASSISTANT_SELECTOR = '[data-testid="conversation-turn-assistant"], [data-is-streaming]';
const STABILITY_MS = 800;

export const anthropicAdapter: Adapter = {
  name: "anthropic",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function isStreaming(node: HTMLElement): boolean {
      const v = node.getAttribute("data-is-streaming");
      return v === "true";
    }

    function check() {
      const nodes = document.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR);
      const now = Date.now();
      nodes.forEach((node) => {
        const streaming = isStreaming(node);
        const text = (node.textContent ?? "").trim();
        if (!text) return;
        const prior = seen.get(node);
        if (!prior || prior.text !== text) {
          seen.set(node, { text, settledAt: now });
          return;
        }
        if (streaming) return;
        if (now - prior.settledAt < STABILITY_MS) return;
        const id = node.id || `claude-${prior.settledAt}`;
        const target: ResponseTarget = { id, host: node, text, streaming: false };
        onTarget(target);
      });
    }

    const observer = new MutationObserver(() => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        check();
      }, 200);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const interval = window.setInterval(check, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      if (timer != null) window.clearTimeout(timer);
    };
  },
};
