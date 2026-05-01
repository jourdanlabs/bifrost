// PULSAR-lite. Budget: 25ms. MAX FINDINGS: 3.
//
// Three rules:
//   1. EDGE_CASE_FAILURE   — code without empty/null/boundary handling
//   2. CONTRADICTION_SNAP  — mismatched complexity / logical inconsistencies
//   3. OVERCONFIDENCE      — fires only if METEOR has >=3 strong assertions
//                            AND NEBULA has 0 qualifier-style signals.

import type { MeteorClaims, NebulaResult, PulsarFinding } from "@bifrost/types";

const MAX_FINDINGS = 3;

const EMPTY_HANDLERS = [
  "if (!",
  "if(!",
  "if (",
  "=== null",
  "== null",
  "=== undefined",
  "== undefined",
  ".length === 0",
  ".length == 0",
  ".length",
  "is none",
  "is null",
  "isempty",
  ".empty",
  "len(",
  "?? ",
  "?.",
  "try {",
  "try:",
  "except",
  "catch",
];

function looksLikeCode(meteor: MeteorClaims): boolean {
  return meteor.code_blocks.length > 0;
}

function edgeCaseProbe(meteor: MeteorClaims): PulsarFinding | null {
  if (!looksLikeCode(meteor)) return null;
  const joined = meteor.code_blocks.join("\n").toLowerCase();
  const hasGuard = EMPTY_HANDLERS.some((h) => joined.includes(h));
  if (hasGuard) return null;

  // Heuristic: code that takes inputs but doesn't appear to guard them.
  const acceptsInput =
    /function\s+\w+\s*\(/.test(joined) ||
    /def\s+\w+\s*\(/.test(joined) ||
    /=>\s*{/.test(joined) ||
    /\(\s*\w+\s*[,)]/.test(joined);

  if (!acceptsInput) return null;

  return {
    type: "EDGE_CASE_FAILURE",
    description:
      "Code accepts inputs but contains no visible guards for empty / null / boundary cases.",
    impact:
      "Will likely throw or return incorrect results on empty arrays, null, or zero-length input.",
  };
}

const CONTRADICTION_SNAPS: Array<{ a: RegExp; b: RegExp; reason: string }> = [
  {
    a: /\bO\(1\)/i,
    b: /\bO\(n\)|\bO\(n\s*\^?\s*2\)|\bO\(log\s*n\)/i,
    reason: "Claims O(1) while also describing higher complexity.",
  },
  {
    a: /\balways\b/i,
    b: /\bsometimes\b|\boccasionally\b|\brarely\b|\bedge cases?\b/i,
    reason: "Says 'always' but admits exceptions.",
  },
  {
    a: /\bthread[- ]?safe\b/i,
    b: /\brace condition\b|\bnot thread[- ]?safe\b/i,
    reason: "Claims thread safety while describing race conditions.",
  },
  {
    a: /\bimmutable\b/i,
    b: /\bmutate[ds]?\b|\bmutation\b/i,
    reason: "Calls a value immutable while showing mutation.",
  },
];

function contradictionSnap(text: string): PulsarFinding | null {
  for (const { a, b, reason } of CONTRADICTION_SNAPS) {
    if (a.test(text) && b.test(text)) {
      return {
        type: "CONTRADICTION_SNAP",
        description: reason,
        impact: "The two claims cannot both be true; downstream consumers will misinterpret.",
      };
    }
  }
  return null;
}

function overconfidence(meteor: MeteorClaims, nebula: NebulaResult): PulsarFinding | null {
  const strong = meteor.strong_assertions.length;
  // Spec: METEOR finds >=3 strong assertions AND NEBULA finds 0 qualifiers.
  if (strong >= 3 && nebula.signals.qualifiers === 0) {
    return {
      type: "OVERCONFIDENCE",
      description: `Output uses ${strong} absolute assertions (e.g. always/never/guaranteed) with no hedging.`,
      impact: "High risk of confident-but-wrong output; downstream users will not double-check.",
    };
  }
  return null;
}

export function pulsarLite(
  text: string,
  meteor: MeteorClaims,
  nebula: NebulaResult
): PulsarFinding[] {
  const findings: PulsarFinding[] = [];

  const f1 = edgeCaseProbe(meteor);
  if (f1) findings.push(f1);

  const f2 = contradictionSnap(text);
  if (f2 && findings.length < MAX_FINDINGS) findings.push(f2);

  const f3 = overconfidence(meteor, nebula);
  if (f3 && findings.length < MAX_FINDINGS) findings.push(f3);

  return findings.slice(0, MAX_FINDINGS);
}
