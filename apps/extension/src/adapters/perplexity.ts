import { cleanResponseText } from "./dom";
import { Adapter, ResponseTarget } from "./types";

const ASSISTANT_SELECTORS = [
  '[data-testid="answer"]',
  '[data-testid="thread-answer"]',
  ".prose",
  '[class*="answer"]',
];

const STABILITY_MS = 900;

export const perplexityAdapter: Adapter = {
  name: "perplexity",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function candidates(): HTMLElement[] {
      const set = new Set<HTMLElement>();
      for (const selector of ASSISTANT_SELECTORS) {
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => set.add(node));
      }
      return [...set].filter((node) => cleanResponseText(node).length >= 50);
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
        const id = node.id || `perplexity-${prior.settledAt}`;
        onTarget({ id, host: node, text, streaming: false });
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
