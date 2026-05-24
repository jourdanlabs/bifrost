// Provider-specific content script. Picks adapter from hostname.

import { startEdge } from "./edge";
import { openaiAdapter } from "./adapters/openai";
import { anthropicAdapter } from "./adapters/anthropic";
import { geminiAdapter } from "./adapters/gemini";
import { grokAdapter } from "./adapters/grok";
import { perplexityAdapter } from "./adapters/perplexity";
import { chineseFrontierAdapter } from "./adapters/chinese-frontier";
import { genericAdapter } from "./adapters/generic";

const host = location.hostname;
const CHINESE_FRONTIER_HOSTS = [
  "deepseek.com",
  "kimi.com",
  "minimax.io",
  "qwen.ai",
  "doubao.com",
  "yuanbao.tencent.com",
  "ernie.baidu.com",
  "yiyan.baidu.com",
  "chatglm.cn",
  "z.ai",
];

function matchesHost(domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

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
} else if (CHINESE_FRONTIER_HOSTS.some(matchesHost)) {
  startEdge(chineseFrontierAdapter);
} else {
  startEdge(genericAdapter);
}
