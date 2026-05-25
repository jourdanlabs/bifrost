// Generic adapter — fallback for unknown AI UIs.
// Detects completed responses only; no streaming awareness.
//
// Strategy: look for elements that look like AI responses (long blocks of
// prose inside likely chat containers) and only emit each one once after a
// significant idle period.

import { cleanResponseText, isLikelyUserPromptNode, latestUserPromptBefore } from "./dom";
import { Adapter, ResponseTarget } from "./types";

const SETTLED_MS = 2000;
const MIN_TEXT_LEN = 80;
const BUILDER_STATUS_RE =
  /^(creating|building|generating|drafting|designing|polishing|formatting|adding|placing|rendering|preparing|assembling|uploading|exporting|saving|thinking|working|analyzing|searching)\b/i;
const BUILDER_NOUN_RE =
  /\b(slide|slides|deck|presentation|layout|template|theme|section|page|chart|image|icon|animation|speaker notes?)\b/i;
const PROGRESS_RE =
  /\b(step\s*\d+|slide\s*\d+|page\s*\d+|\d+\s*%|almost done|in progress|working on|one moment|hang tight|please wait)\b/i;

const HINTS = [
  '[role="article"]',
  '[role="log"] > *',
  ".message",
  ".assistant",
  ".answer",
  ".ai-response",
  ".response",
  ".chat-message",
  ".markdown-body",
  ".prose",
  '[data-role="assistant"]',
  '[data-testid*="assistant"]',
  '[data-testid*="answer"]',
  '[data-testid*="response"]',
];

function looksLikeBuilderStatus(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const sentenceCount = normalized.split(/[.!?]\s+/).filter(Boolean).length;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (wordCount <= 18 && (BUILDER_STATUS_RE.test(normalized) || PROGRESS_RE.test(normalized))) {
    return true;
  }

  if (
    wordCount <= 35 &&
    BUILDER_STATUS_RE.test(normalized) &&
    (BUILDER_NOUN_RE.test(normalized) || PROGRESS_RE.test(normalized))
  ) {
    return true;
  }

  if (wordCount <= 55 && sentenceCount <= 2 && PROGRESS_RE.test(normalized) && BUILDER_NOUN_RE.test(normalized)) {
    return true;
  }

  return false;
}

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
      return [...set].filter((node) => !isLikelyUserPromptNode(node));
    }

    function check() {
      const now = Date.now();
      for (const node of candidates()) {
        const text = cleanResponseText(node);
        if (text.length < MIN_TEXT_LEN) continue;
        if (looksLikeBuilderStatus(text)) continue;
        const prior = seen.get(node);
        if (!prior || prior.text !== text) {
          seen.set(node, { text, settledAt: now });
          continue;
        }
        if (now - prior.settledAt < SETTLED_MS) continue;
        const id = node.id || `gen-${prior.settledAt}`;
        const target: ResponseTarget = { id, host: node, text, streaming: false, input: latestUserPromptBefore(node) };
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
