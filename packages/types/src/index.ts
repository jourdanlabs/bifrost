export type Verdict = "APPROVED" | "LOW_CONFIDENCE" | "REJECTED";

export interface PulsarFinding {
  type: string;
  description: string;
  impact: string;
}

export interface BifrostRequest {
  input?: string;
  output: string;
}

export interface BifrostResponse {
  verdict: Verdict;
  confidence: number;
  reasons: string[];
  pulsar_findings: PulsarFinding[];
  timestamp: string;
}

export interface MeteorClaims {
  code_blocks: string[];
  numbers: string[];
  strong_assertions: string[];
}

export interface NebulaResult {
  uncertainty_score: number;
  signals: {
    contradictions: number;
    ambiguity: number;
    missing_qualifiers: number;
    qualifiers: number;
  };
}

export interface QuasarConfig {
  base_weight_uncertainty: number;
  base_weight_pulsar: number;
}

export const DEFAULT_QUASAR_CONFIG: QuasarConfig = {
  base_weight_uncertainty: 0.4,
  base_weight_pulsar: 0.15,
};
