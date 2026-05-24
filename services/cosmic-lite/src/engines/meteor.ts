// METEOR — claim extraction. Budget: 25ms.
// Detect code blocks, numerical values, and strong assertions.

import type { MeteorClaims } from "@bifrost/types";

const CODE_FENCE = /```[\s\S]*?```/g;
const INLINE_CODE = /`[^`\n]+`/g;

// Numbers: integers, decimals, percents, scientific. Skip pure version-like
// tokens by allowing them through (they're still "numbers").
const NUMBER = /(?<![A-Za-z_])-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?%?/g;

const STRONG_WORDS = [
  "always",
  "never",
  "guaranteed",
  "guarantee",
  "guarantees",
  "definitely",
  "absolutely",
  "certainly",
  "obviously",
  "clearly",
  "must",
  "impossible",
  "every",
  "all cases",
  "in all cases",
  "perfectly",
  "100%",
  "fully",
  "completely",
  "no edge cases",
  "no issues",
  "without exception",
];

export function meteorExtract(text: string): MeteorClaims {
  if (!text) {
    return { code_blocks: [], numbers: [], strong_assertions: [] };
  }

  const code_blocks: string[] = [];
  let stripped = text.replace(CODE_FENCE, (m) => {
    code_blocks.push(m);
    return " ";
  });
  stripped = stripped.replace(INLINE_CODE, " ");

  const numbers = stripped.match(NUMBER) ?? [];

  const lower = stripped.toLowerCase();
  const strong_assertions: string[] = [];
  for (const w of STRONG_WORDS) {
    // word-boundary-ish; for multi-word entries fall back to indexOf
    if (w.includes(" ")) {
      let idx = lower.indexOf(w);
      while (idx !== -1) {
        strong_assertions.push(w);
        idx = lower.indexOf(w, idx + w.length);
      }
    } else {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = /[A-Za-z0-9_]/u.test(w.at(-1) ?? "")
        ? new RegExp(`\\b${escaped}\\b`, "g")
        : new RegExp(`\\b${escaped}`, "g");
      const matches = lower.match(re);
      if (matches) strong_assertions.push(...matches);
    }
  }

  return { code_blocks, numbers, strong_assertions };
}
