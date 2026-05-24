import { cleanResponseText } from "./dom";
import { Adapter, ResponseTarget } from "./types";

const ASSISTANT_SELECTORS = [
  "message-content",
  ".model-response-text",
  ".response-container",
  "[data-response-index]",
  "[data-test-id='response-text']",
  "[data-testid='response-text']",
];

const STABILITY_MS = 900;

export const geminiAdapter: Adapter = {
  name: "gemini",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function candidates(): HTMLElement[] {
      const set = new Set<HTMLElement>();
      for (const selector of ASSISTANT_SELECTORS) {
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => set.add(node));
      }
      return [...set].filter((node) => cleanResponseText(node).length >= 24);
    }

    function check() {
      const now = Date.now();
      for (const node of candidates()) {
        const text = cleanResponseText(node);
        const prior = seen.get(node);
        if (!prior || prior.text !== text) {
          seen.set(node, { text, settledAt: now });
          continue;
        }
        if (now - prior.settledAt < STABILITY_MS) continue;
        const id = node.id || node.getAttribute("data-response-index") || `gemini-${prior.settledAt}`;
        const target: ResponseTarget = { id, host: node, text, streaming: false };
        onTarget(target);
      }
    }

    const observer = new MutationObserver(() => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        check();
      }, 250);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    const interval = window.setInterval(check, 1200);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      if (timer != null) window.clearTimeout(timer);
    };
  },
};
