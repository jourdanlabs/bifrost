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

function sameAnswerSurface(parent: HTMLElement, child: HTMLElement): boolean {
  const parentText = cleanResponseText(parent);
  const childText = cleanResponseText(child);
  if (childText.length < 24 || parentText.length < childText.length) return false;

  const sample = childText.slice(0, Math.min(180, childText.length));
  if (!parentText.includes(sample)) return false;

  const extra = parentText.length - childText.length;
  return extra <= Math.max(240, childText.length * 0.25);
}

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
      const nodes = [...set].filter((node) => cleanResponseText(node).length >= 24);
      return nodes.filter(
        (node) =>
          !nodes.some(
            (other) => other !== node && other.contains(node) && sameAnswerSurface(other, node)
          )
      );
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
