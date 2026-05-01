// AURORA — verdict. Budget: 5ms.
//
// >=0.80 -> APPROVED
// >=0.60 -> LOW_CONFIDENCE
// else   -> REJECTED

import type { Verdict } from "@bifrost/types";

export function auroraVerdict(score: number): Verdict {
  if (score >= 0.8) return "APPROVED";
  if (score >= 0.6) return "LOW_CONFIDENCE";
  return "REJECTED";
}
