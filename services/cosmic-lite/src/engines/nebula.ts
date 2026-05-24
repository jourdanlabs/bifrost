// NEBULA — uncertainty detection. Budget: 40ms.
// Detect contradictions, ambiguity, missing qualifiers.
// Output uncertainty_score in [0, 1].

import type { NebulaResult } from "@bifrost/types";

const ABSOLUTES = [
  "always",
  "never",
  "guaranteed",
  "guarantee",
  "definitely",
  "absolutely",
  "certainly",
  "must ",
  "every ",
  "all cases",
  "no edge cases",
  "100%",
];

const QUALIFIERS = [
  "may",
  "might",
  "could",
  "possibly",
  "likely",
  "probably",
  "sometimes",
  "in some cases",
  "depends",
  "depending",
  "approximately",
  "roughly",
  "about",
  "around",
  "typically",
  "usually",
  "often",
  "tends to",
  "subject to",
  "unless",
  "assuming",
  "if ",
  "should ",
];

const AMBIGUITY = [
  "it depends",
  "various",
  "varies",
  "somewhat",
  "kind of",
  "sort of",
  "more or less",
  "ish",
  "tbd",
  "unclear",
  "not sure",
  "i think",
  "i believe",
];

// Pairs of patterns that, if both appear in the text, suggest contradiction.
const CONTRADICTION_PAIRS: Array<[RegExp, RegExp, string]> = [
  [/\balways\b/i, /\bsometimes\b|\boccasionally\b|\brarely\b/i, "always vs sometimes"],
  [/\bnever\b/i, /\bsometimes\b|\boccasionally\b|\boften\b/i, "never vs sometimes"],
  [/\bapproved\b|\bapproval\b/i, /\brejected\b|\brejection\b/i, "approved vs rejected"],
  [/\baccepted\b|\bacceptance\b/i, /\bdenied\b|\bdenial\b/i, "accepted vs denied"],
  [/\btrue\b/i, /\bfalse\b/i, "true vs false"],
  [/\bvalid\b/i, /\binvalid\b/i, "valid vs invalid"],
  [/\bopen\b/i, /\bclosed\b/i, "open vs closed"],
  [/\bcomplete\b|\bcompleted\b/i, /\bincomplete\b|\bnot complete\b/i, "complete vs incomplete"],
  [/\bO\(1\)/i, /\bO\(n\)|\bO\(n\^?2\)|\bO\(log\s*n\)/i, "complexity mismatch"],
  [/\bsynchronous\b/i, /\basynchronous\b|\basync\b/i, "sync vs async"],
  [/\bimmutable\b/i, /\bmutate[ds]?\b|\bmutation\b/i, "immutable vs mutate"],
  [/\bthread[- ]?safe\b/i, /\bnot thread[- ]?safe\b|\brace condition\b/i, "thread safety"],
  [/\bguaranteed\b/i, /\bnot guaranteed\b|\bno guarantee\b/i, "guarantee mismatch"],
];

function countMatches(text: string, needles: string[]): number {
  let n = 0;
  for (const needle of needles) {
    let idx = text.indexOf(needle);
    while (idx !== -1) {
      n++;
      idx = text.indexOf(needle, idx + needle.length);
    }
  }
  return n;
}

export function nebulaScore(text: string): NebulaResult {
  if (!text) {
    return {
      uncertainty_score: 0,
      signals: { contradictions: 0, ambiguity: 0, missing_qualifiers: 0, qualifiers: 0 },
    };
  }

  const lower = text.toLowerCase();

  let contradictions = 0;
  for (const [a, b] of CONTRADICTION_PAIRS) {
    if (a.test(text) && b.test(text)) contradictions++;
  }

  const ambiguity = countMatches(lower, AMBIGUITY);
  const qualifierCount = countMatches(lower, QUALIFIERS);
  const absoluteCount = countMatches(lower, ABSOLUTES);

  // Two ways to be "missing qualifiers":
  //   1. long answer with none (length-relative expectation)
  //   2. multiple absolute claims with zero hedges (overconfidence shape)
  const words = lower.split(/\s+/).filter(Boolean).length;
  const lengthExpectation = Math.max(0, Math.floor(words / 80));
  const lengthDeficit = Math.max(0, lengthExpectation - qualifierCount);
  const absoluteDeficit = absoluteCount >= 2 && qualifierCount === 0 ? absoluteCount : 0;
  const missing_qualifiers = lengthDeficit + absoluteDeficit;

  // Combine into uncertainty_score in [0,1].
  // Contradictions are the strongest signal.
  let score = 0;
  score += Math.min(0.6, contradictions * 0.3);
  score += Math.min(0.3, ambiguity * 0.1);
  score += Math.min(0.2, missing_qualifiers * 0.05);
  if (score > 1) score = 1;

  return {
    uncertainty_score: Number(score.toFixed(3)),
    signals: { contradictions, ambiguity, missing_qualifiers, qualifiers: qualifierCount },
  };
}
