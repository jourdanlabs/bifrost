const BIFROST_SELECTOR = ".bifrost-badge, .bifrost-panel";

export function cleanResponseText(node: HTMLElement): string {
  const clone = node.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(BIFROST_SELECTOR).forEach((el) => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function hasVisibleText(node: HTMLElement, minLength = 1): boolean {
  return cleanResponseText(node).length >= minLength;
}
