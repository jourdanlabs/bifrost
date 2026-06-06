// QUASAR — scoring. Budget: 5ms.
//
// score = 1.0
// score -= uncertainty_score * BASE_WEIGHT_U
// score -= pulsar_findings.length * BASE_WEIGHT_P
//
// Defaults are uncalibrated baselines. Configurable via env.

import type { PulsarFinding, QuasarConfig } from "@bifrost/types";
import { DEFAULT_QUASAR_CONFIG } from "@bifrost/types";

export function loadQuasarConfig(): QuasarConfig {
  const u = Number(process.env.BIFROST_WEIGHT_U);
  const p = Number(process.env.BIFROST_WEIGHT_P);
  return {
    base_weight_uncertainty: Number.isFinite(u) ? u : DEFAULT_QUASAR_CONFIG.base_weight_uncertainty,
    base_weight_pulsar: Number.isFinite(p) ? p : DEFAULT_QUASAR_CONFIG.base_weight_pulsar,
  };
}

export function quasarScore(
  uncertainty_score: number,
  pulsar_findings: PulsarFinding[],
  cfg: QuasarConfig = loadQuasarConfig()
): number {
  let score = 1.0;
  score -= uncertainty_score * cfg.base_weight_uncertainty;
  score -= pulsar_findings.length * cfg.base_weight_pulsar;
  if (score < 0) score = 0;
  if (score > 1) score = 1;
  return Number(score.toFixed(3));
}
