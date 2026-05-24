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

export function cleanResponseText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(BIFROST_SELECTOR).forEach((el) => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function hasVisibleText(node: HTMLElement, minLength = 1): boolean {
  return cleanResponseText(node).length >= minLength;
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
