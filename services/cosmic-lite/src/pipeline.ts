// COSMIC-lite pipeline.
// Strict order: ASTRAL -> METEOR -> NEBULA -> PULSAR-lite -> QUASAR -> AURORA.

import type { BifrostResponse, BifrostRequest, MeteorClaims } from "@bifrost/types";
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
  if (types.has("OVERCONFIDENCE")) {
    return Math.min(score, 0.79);
  }
  return score;
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

  const findings = pulsarLite(normalized, meteor, nebula);
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
