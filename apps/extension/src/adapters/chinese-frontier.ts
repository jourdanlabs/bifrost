import { cleanResponseText, isLikelyUserPromptNode, latestUserPromptBefore } from "./dom";
import { Adapter } from "./types";

const ASSISTANT_SELECTORS = [
  '[data-role="assistant"]',
  '[data-testid*="assistant" i]',
  '[data-testid*="answer" i]',
  '[data-testid*="response" i]',
  '[class*="assistant" i]',
  '[class*="answer" i]',
  '[class*="response" i]',
  '[class*="markdown" i]',
  '[class*="message-content" i]',
  '[class*="chat-content" i]',
  ".markdown-body",
  ".prose",
  ".ds-markdown",
  "article",
];

const USER_HINT = /\b(user|human|prompt|query|question)\b/i;
const STABILITY_MS = 900;
const SHORT_QUESTION_RE = /^(who|what|when|where|why|how|is|are|do|does|did|can|could|should|would|will|was|were)\b/i;

function isCompactQuestion(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 22) return false;
  return text.includes("?") || SHORT_QUESTION_RE.test(text);
}

function isRightAlignedBubble(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.width) || rect.width <= 0) return false;
  const center = rect.left + rect.width / 2;
  return center > window.innerWidth * 0.58 && rect.width < window.innerWidth * 0.72;
}

function isLikelyPromptBubble(node: HTMLElement, text: string): boolean {
  if (isLikelyUserPromptNode(node)) return true;
  if (isCompactQuestion(text) && isRightAlignedBubble(node)) return true;
  return false;
}

function isLikelyAssistant(node: HTMLElement): boolean {
  const text = cleanResponseText(node);
  if (isLikelyPromptBubble(node, text)) return false;
  const marker = [
    node.getAttribute("data-role"),
    node.getAttribute("data-testid"),
    node.getAttribute("aria-label"),
    typeof node.className === "string" ? node.className : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (USER_HINT.test(marker) && !/assistant|answer|response|markdown/i.test(marker)) return false;
  return text.length >= 36;
}

function sameAnswerSurface(parent: HTMLElement, child: HTMLElement): boolean {
  const parentText = cleanResponseText(parent);
  const childText = cleanResponseText(child);
  if (childText.length < 36 || parentText.length < childText.length) return false;
  const sample = childText.slice(0, Math.min(180, childText.length));
  if (!parentText.includes(sample)) return false;
  const extra = parentText.length - childText.length;
  return extra <= Math.max(240, childText.length * 0.35);
}

export const chineseFrontierAdapter: Adapter = {
  name: "chinese-frontier",
  attach(onTarget) {
    const seen = new WeakMap<HTMLElement, { text: string; settledAt: number }>();
    let timer: number | null = null;

    function candidates(): HTMLElement[] {
      const set = new Set<HTMLElement>();
      for (const selector of ASSISTANT_SELECTORS) {
        document.querySelectorAll<HTMLElement>(selector).forEach((node) => set.add(node));
      }
      const nodes = [...set].filter(isLikelyAssistant);
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
        const id =
          node.id ||
          node.getAttribute("data-message-id") ||
          node.getAttribute("data-testid") ||
          `cn-${prior.settledAt}`;
        onTarget({
          id,
          host: node,
          text,
          input: latestUserPromptBefore(node),
          streaming: false,
        });
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
