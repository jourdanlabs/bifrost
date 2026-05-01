// Provider-specific content script. Picks adapter from hostname.

import { startEdge } from "./edge";
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";

const host = location.hostname;
if (host.includes("openai.com") || host.includes("chatgpt.com")) {
  startEdge(openaiAdapter);
} else if (host.includes("claude.ai")) {
  startEdge(anthropicAdapter);
}
