import { cleanResponseText } from "./dom";
import { Adapter, ResponseTarget } from "./types";

const ASSISTANT_SELECTORS = [
  '[data-testid="message-bubble"]',
  '[data-testid="conversation-turn-assistant"]',
  '[class*="message"]',
  '[class*="response"]',
];

const USER_HINT = /\b(you|user|human)\b/i;
const STABILITY_MS = 900;

export const grokAdapter: Adapter = {
  name: "grok",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function candidates(): HTMLElement[] {
      const set = new Set<HTMLElement>();
      for (const selector of ASSISTANT_SELECTORS) {
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => set.add(node));
      }
      return [...set].filter((node) => {
        const aria = `${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("data-testid") ?? ""}`;
        if (USER_HINT.test(aria)) return false;
        return cleanResponseText(node).length >= 40;
      });
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
        const id = node.id || `grok-${prior.settledAt}`;
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
