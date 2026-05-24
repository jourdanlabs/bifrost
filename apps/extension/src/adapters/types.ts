// Adapter contract. Each adapter knows how to find finished AI responses on
// its host site and to expose a stable text representation.

export interface ResponseTarget {
  // Stable id for de-duplication. Anything monotonic per-response is fine.
  id: string;
  // The DOM node that should host the badge / overlay.
  host: HTMLElement;
  // The finished, visible text of the AI response.
  text: string;
  // Best-effort visible user prompt that caused the response.
  input?: string;
  // True if streaming is still active. Adapters that can't tell may always
  // return false.
  streaming: boolean;
}

export interface Adapter {
  name: string;
  // Bootstraps any observers; returns a teardown.
  attach(onTarget: (t: ResponseTarget) => void): () => void;
}
