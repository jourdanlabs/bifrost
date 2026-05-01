// Generic adapter — fallback for unknown AI UIs.
// Detects completed responses only; no streaming awareness.
//
// Strategy: look for elements that look like AI responses (long blocks of
// prose inside likely chat containers) and only emit each one once after a
// significant idle period.

import { Adapter, ResponseTarget } from "./types";

const SETTLED_MS = 2000;
const MIN_TEXT_LEN = 80;

const HINTS = [
  '[role="article"]',
  '[role="log"] > *',
  ".message",
  ".assistant",
  ".ai-response",
  ".chat-message",
  '[data-role="assistant"]',
];

export const genericAdapter: Adapter = {
  name: "generic",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function candidates(): HTMLElement[] {
      const set = new Set<HTMLElement>();
      for (const h of HINTS) {
        document.querySelectorAll<HTMLElement>(h).forEach((el) => set.add(el));
      }
      return [...set];
    }

    function check() {
      const now = Date.now();
      for (const node of candidates()) {
        const text = (node.textContent ?? "").trim();
        if (text.length < MIN_TEXT_LEN) continue;
        const prior = seen.get(node);
        if (!prior || prior.text !== text) {
          seen.set(node, { text, settledAt: now });
          continue;
        }
        if (now - prior.settledAt < SETTLED_MS) continue;
        const id = node.id || `gen-${prior.settledAt}`;
        const target: ResponseTarget = { id, host: node, text, streaming: false };
        onTarget(target);
      }
    }

    const observer = new MutationObserver(() => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        timer = null;
        check();
      }, 400);
    });
    observer.observe(document.body, { subtree: true, childList: true });
    const interval = window.setInterval(check, 2000);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      if (timer != null) window.clearTimeout(timer);
    };
  },
};
