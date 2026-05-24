// OpenAI / ChatGPT adapter.
// Watches for assistant message turns and reports finalized text.

import { cleanResponseText, latestUserPromptBefore } from "./dom";
import { Adapter, ResponseTarget } from "./types";

const ASSISTANT_SELECTOR = '[data-message-author-role="assistant"]';
const STREAM_INDICATOR = ".result-streaming";
const STABILITY_MS = 700;

export const openaiAdapter: Adapter = {
  name: "openai",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function check() {
      const nodes = document.querySelectorAll<HTMLElement>(ASSISTANT_SELECTOR);
      const now = Date.now();
      nodes.forEach((node) => {
        const streaming = !!node.querySelector(STREAM_INDICATOR);
        const text = cleanResponseText(node);
        if (!text) return;
        const prior = seen.get(node);
        if (!prior || prior.text !== text) {
          seen.set(node, { text, settledAt: now });
          return;
        }
        if (streaming) return;
        if (now - prior.settledAt < STABILITY_MS) return;
        const id = node.getAttribute("data-message-id") ?? `oai-${prior.settledAt}`;
        const target: ResponseTarget = { id, host: node, text, streaming: false, input: latestUserPromptBefore(node) };
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
