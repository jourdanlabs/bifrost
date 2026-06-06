// COSMIC-lite pipeline.
// Strict order: ASTRAL -> METEOR -> NEBULA -> PULSAR-lite -> QUASAR -> AURORA.

import type { BifrostResponse, BifrostRequest, MeteorClaims, PulsarFinding, Verdict, VerdictDescriptor } from "@bifrost/types";
import { astralNormalize } from "./engines/astral";
import { meteorExtract } from "./engines/meteor";
import { bareCodeBlock } from "./engines/bare-code";
import { nebulaScore } from "./engines/nebula";
import { pulsarLite } from "./engines/pulsar";
import { quasarScore } from "./engines/quasar";
import { auroraVerdict } from "./engines/aurora";

export interface PipelineMetrics {
  astral_ms: number;
  meteor_ms: number;
  nebula_ms: number;
  pulsar_ms: number;
  quasar_ms: number;
  aurora_ms: number;
  total_ms: number;
}

export interface PipelineResult {
  response: BifrostResponse;
  metrics: PipelineMetrics;
}

function nowMs(): number {
  if (globalThis.performance?.now) return globalThis.performance.now();
  const [s, ns] = process.hrtime();
  return s * 1000 + ns / 1e6;
}

function buildReasons(opts: {
  uncertainty: number;
  contradictions: number;
  ambiguity: number;
  missing_qualifiers: number;
  pulsarCount: number;
}): string[] {
  const reasons: string[] = [];
  if (opts.contradictions > 0) {
    reasons.push(`Detected ${opts.contradictions} contradiction signal(s).`);
  }
  if (opts.ambiguity > 0) {
    reasons.push(`Detected ${opts.ambiguity} ambiguity marker(s).`);
  }
  if (opts.missing_qualifiers > 0) {
    reasons.push(
      `Long output with too few hedging qualifiers (${opts.missing_qualifiers} expected).`
    );
  }
  if (opts.pulsarCount > 0) {
    reasons.push(`PULSAR-lite raised ${opts.pulsarCount} finding(s).`);
  }
  if (reasons.length === 0) {
    reasons.push("No high-risk signals detected.");
  }
  return reasons;
}

function capScoreForFindings(score: number, findings: ReturnType<typeof pulsarLite>): number {
  const types = new Set(findings.map((finding) => finding.type));
  if (types.has("EDGE_CASE_FAILURE") || types.has("CONTRADICTION_SNAP")) {
    return Math.min(score, 0.59);
  }
  if (types.has("QUESTION_ASSUMPTION")) {
    return Math.min(score, 0.79);
  }
  if (types.has("CURRENT_CLAIM_NO_SOURCE") || types.has("UNSOURCED_NUMERIC_CLAIMS")) {
    return Math.min(score, 0.79);
  }
  if (types.has("OVERCONFIDENCE")) {
    return Math.min(score, 0.79);
  }
  return score;
}

function primaryFinding(findings: PulsarFinding[]): PulsarFinding | null {
  const priority = [
    "EDGE_CASE_FAILURE",
    "CONTRADICTION_SNAP",
    "QUESTION_ASSUMPTION",
    "CURRENT_CLAIM_NO_SOURCE",
    "UNSOURCED_NUMERIC_CLAIMS",
    "OVERCONFIDENCE",
    "VALUE_JUDGMENT",
  ];
  return priority.map((type) => findings.find((finding) => finding.type === type)).find(Boolean) ?? findings[0] ?? null;
}

function hasVisibleSourceTrail(text: string): boolean {
  return /https?:\/\//i.test(text) ||
    /\bdoi:\s*\S+/i.test(text) ||
    /\barxiv:\s*\S+/i.test(text) ||
    /\bsec\.gov\b|\bpubmed\b|\bfda\b|\bedgar\b/i.test(text) ||
    /\[\d+\]/.test(text) ||
    /\([A-Z][A-Za-z .-]+,\s*20\d{2}\)/.test(text);
}

function descriptorFromFinding(
  verdict: Verdict,
  confidence: number,
  findings: PulsarFinding[],
  reasons: string[],
  meteor: MeteorClaims,
  normalized: string
): VerdictDescriptor {
  const finding = primaryFinding(findings);
  const confidenceText = `${Math.round(confidence * 100)}%`;

  if (finding?.type === "EDGE_CASE_FAILURE") {
    return {
      display: "REJECTED",
      category: "code_edge_case",
      label: "REJECTED · CODE EDGE CASE",
      headline: "Code path lacks visible boundary handling.",
      detail: finding.description,
      action: "Do not use this code as-is; add null, empty, and boundary-case guards before trusting it.",
    };
  }
  if (finding?.type === "CONTRADICTION_SNAP") {
    return {
      display: "REJECTED",
      category: "internal_contradiction",
      label: "REJECTED · CONTRADICTION",
      headline: "The answer contains claims that cannot both be true.",
      detail: finding.description,
      action: "Treat the answer as unsafe until the contradiction is resolved against a source of record.",
    };
  }
  if (finding?.type === "QUESTION_ASSUMPTION") {
    return {
      display: "REVIEW",
      category: "ambiguous_prompt",
      label: "REVIEW · AMBIGUOUS PROMPT",
      headline: "The answer chose one interpretation without confirming intent.",
      detail: finding.description,
      action: "Ask a clarifying question or rerun with the intended referent made explicit.",
    };
  }
  if (finding?.type === "CURRENT_CLAIM_NO_SOURCE") {
    return {
      display: "REVIEW",
      category: "current_claim_no_source",
      label: "REVIEW · CURRENT CLAIM",
      headline: "The answer is time-sensitive but lacks visible provenance.",
      detail: finding.description,
      action: "Check a current source of record before relying on this answer.",
    };
  }
  if (finding?.type === "UNSOURCED_NUMERIC_CLAIMS") {
    return {
      display: "REVIEW",
      category: "unsourced_numeric_claims",
      label: "REVIEW · UNSOURCED NUMBERS",
      headline: "The answer is number-heavy without a visible source trail.",
      detail: finding.description,
      action: "Verify the figures against source documents before using them in work product.",
    };
  }
  if (finding?.type === "OVERCONFIDENCE") {
    return {
      display: verdict === "REJECTED" ? "REJECTED" : "REVIEW",
      category: "unsupported_confidence",
      label: `${verdict === "REJECTED" ? "REJECTED" : "REVIEW"} · UNSUPPORTED CONFIDENCE`,
      headline: "The answer sounds more certain than its support allows.",
      detail: finding.description,
      action: "Verify the claim externally or rewrite with explicit uncertainty and citations.",
    };
  }
  if (finding?.type === "VALUE_JUDGMENT") {
    return {
      display: "REVIEW",
      category: "judgment_call",
      label: "REVIEW · JUDGMENT CALL",
      headline: "The answer handles a subjective question with caveats.",
      detail: finding.description,
      action: "Use it as framing, not as a settled factual verdict.",
    };
  }

  if (verdict === "APPROVED") {
    if (meteor.code_blocks.length > 0) {
      return {
        display: "APPROVED",
        category: "guarded_code",
        label: "APPROVED · GUARDED CODE",
        headline: "Code cleared the fast boundary-risk scan.",
        detail: `Deterministic checks cleared at ${confidenceText}; review domain behavior before shipping.`,
        action: "Safe for a first pass; run real tests for production use.",
      };
    }
    if (hasVisibleSourceTrail(normalized)) {
      return {
        display: "APPROVED",
        category: "sourced_shape",
        label: "APPROVED · SOURCED SHAPE",
        headline: "The answer carries a visible source trail and no high-risk signals.",
        detail: `Deterministic checks cleared at ${confidenceText}; BIFROST did not independently verify every cited source.`,
        action: "Use the cited trail for spot-checking when stakes are high.",
      };
    }
    if (meteor.numbers.length > 0) {
      return {
        display: "APPROVED",
        category: "light_numeric_check",
        label: "APPROVED · LIGHT NUMERIC",
        headline: "Small numeric content cleared the risk scan.",
        detail: `Found ${meteor.numbers.length} numeric claim(s), below the unsourced-number review threshold.`,
        action: "Safe for low-stakes use; verify exact figures before publishing or transacting.",
      };
    }
  }

  if (verdict === "REJECTED") {
    return {
      display: "REJECTED",
      category: "blocked_output",
      label: "REJECTED · RISK SIGNALS",
      headline: "BIFROST found risk signals strong enough to block trust.",
      detail: reasons[0] ?? "Risk signals exceeded the rejection threshold.",
      action: "Do not rely on the answer until the flagged risk is resolved.",
    };
  }
  if (verdict === "LOW_CONFIDENCE") {
    const qualifierGap = reasons.find((reason) => /qualifier/i.test(reason));
    return {
      display: "REVIEW",
      category: qualifierGap ? "qualifier_gap" : "review_posture",
      label: qualifierGap ? "REVIEW · QUALIFIER GAP" : "REVIEW · SOURCE POSTURE",
      headline: qualifierGap
        ? "The answer is long or assertive without enough uncertainty markers."
        : "The answer needs human/source review before reliance.",
      detail: qualifierGap ?? reasons[0] ?? "BIFROST lowered confidence based on source-posture signals.",
      action: "Check the underlying sources or tighten the answer before treating it as dependable.",
    };
  }

  return {
    display: "APPROVED",
    category: confidence >= 0.9 ? "clean_high_confidence" : "clean_basic_check",
    label: confidence >= 0.9 ? "APPROVED · CLEAN" : "APPROVED · BASIC CHECK",
    headline: "No high-risk BIFROST signals were detected.",
    detail: `Deterministic checks cleared at ${confidenceText}; this is not a claim of factual omniscience.`,
    action: "Safe to use as a low-risk answer; verify domain facts when stakes are high.",
  };
}

export function runPipeline(req: BifrostRequest): PipelineResult {
  const start = nowMs();

  const t0 = nowMs();
  const normalized = astralNormalize(req.output ?? "");
  const t1 = nowMs();

  const meteorRaw = meteorExtract(normalized);
  // Bare-code overlay: when CLI input is piped from another tool, raw source
  // arrives without fences. meteor-bare.ts sits beside METEOR and supplies
  // the synthesized code block so PULSAR's edge-case probe still runs.
  const bareBlocks = bareCodeBlock(normalized, meteorRaw.code_blocks.length);
  const meteor: MeteorClaims = bareBlocks
    ? { ...meteorRaw, code_blocks: bareBlocks }
    : meteorRaw;
  const t2 = nowMs();

  const nebula = nebulaScore(normalized);
  const t3 = nowMs();

  const findings = pulsarLite(normalized, meteor, nebula, req.input);
  const t4 = nowMs();

  const score = capScoreForFindings(quasarScore(nebula.uncertainty_score, findings), findings);
  const t5 = nowMs();

  const verdict = auroraVerdict(score);
  const t6 = nowMs();

  const reasons = buildReasons({
    uncertainty: nebula.uncertainty_score,
    contradictions: nebula.signals.contradictions,
    ambiguity: nebula.signals.ambiguity,
    missing_qualifiers: nebula.signals.missing_qualifiers,
    pulsarCount: findings.length,
  });

  const response: BifrostResponse = {
    verdict,
    confidence: score,
    descriptor: descriptorFromFinding(verdict, score, findings, reasons, meteor, normalized),
    reasons,
    pulsar_findings: findings,
    timestamp: new Date().toISOString(),
  };

  const metrics: PipelineMetrics = {
    astral_ms: +(t1 - t0).toFixed(2),
    meteor_ms: +(t2 - t1).toFixed(2),
    nebula_ms: +(t3 - t2).toFixed(2),
    pulsar_ms: +(t4 - t3).toFixed(2),
    quasar_ms: +(t5 - t4).toFixed(2),
    aurora_ms: +(t6 - t5).toFixed(2),
    total_ms: +(t6 - start).toFixed(2),
  };

  return { response, metrics };
}
