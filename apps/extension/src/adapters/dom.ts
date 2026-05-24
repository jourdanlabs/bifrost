const BIFROST_SELECTOR = ".bifrost-strip, .bifrost-badge, .bifrost-panel";
const USER_PROMPT_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-testid*="user" i]',
  '[data-testid*="human" i]',
  '[data-role="user"]',
  '[aria-label*="user" i]',
  "user-query",
  ".user-query",
  ".user-message",
  ".human-message",
  '[class*="user-query" i]',
  '[class*="query-text" i]',
];
const USER_MARKER_ATTRS = ["data-message-author-role", "data-role", "data-testid", "aria-label"];
const USER_MARKER_RE = /\b(user|human)\b|user-query|query-text|user-message|human-message/i;

export function cleanResponseText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(BIFROST_SELECTOR).forEach((el) => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function hasVisibleText(node: HTMLElement, minLength = 1): boolean {
  return cleanResponseText(node).length >= minLength;
}

export function isLikelyUserPromptNode(node: HTMLElement): boolean {
  let current: HTMLElement | null = node;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    if (tag === "user-query") return true;
    const className = typeof current.className === "string" ? current.className : "";
    if (USER_MARKER_RE.test(className)) return true;
    for (const attr of USER_MARKER_ATTRS) {
      const value = current.getAttribute(attr);
      if (value && USER_MARKER_RE.test(value)) return true;
    }
    current = current.parentElement;
  }
  return false;
}

export function latestUserPromptBefore(target: HTMLElement): string | undefined {
  const targetTop = target.getBoundingClientRect().top;
  const candidates: Array<{ top: number; text: string }> = [];

  for (const selector of USER_PROMPT_SELECTORS) {
    document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      const text = cleanResponseText(node);
      if (text.length < 3 || text.length > 1_200) return;
      const top = node.getBoundingClientRect().top;
      if (Number.isFinite(targetTop) && top > targetTop + 20) return;
      candidates.push({ top, text });
    });
  }

  candidates.sort((a, b) => a.top - b.top);
  return candidates.length ? candidates[candidates.length - 1].text : undefined;
}
