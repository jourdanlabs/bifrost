// Provider-specific content script. Picks adapter from hostname.

import { startEdge } from "./edge";
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { geminiAdapter } from "./adapters/gemini";
import { grokAdapter } from "./adapters/grok";
import { perplexityAdapter } from "./adapters/perplexity";
import { genericAdapter } from "./adapters/generic";

const host = location.hostname;
if (host.includes("openai.com") || host.includes("chatgpt.com")) {
  startEdge(openaiAdapter);
} else if (host.includes("claude.ai")) {
  startEdge(anthropicAdapter);
} else if (host.includes("gemini.google.com") || host.includes("aistudio.google.com")) {
  startEdge(geminiAdapter);
} else if (host.includes("grok.com") || host.includes("x.ai")) {
  startEdge(grokAdapter);
} else if (host.includes("perplexity.ai")) {
  startEdge(perplexityAdapter);
} else {
  startEdge(genericAdapter);
}
