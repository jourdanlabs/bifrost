import { test } from "node:test";
import assert from "node:assert/strict";
import { runPipeline } from "../pipeline";
import { auroraVerdict } from "../engines/aurora";
import { quasarScore } from "../engines/quasar";

test("clean short output -> APPROVED", () => {
  const { response } = runPipeline({
    output: "Use Array.prototype.map to transform a list.",
  });
  assert.equal(response.verdict, "APPROVED");
  assert.equal(response.descriptor.display, "APPROVED");
  assert.match(response.descriptor.label, /^APPROVED ·/);
  assert.ok(response.confidence >= 0.8);
});

test("overconfident absolute claims -> not APPROVED, fires PULSAR overconfidence", () => {
  const { response } = runPipeline({
    output:
      "This function always returns the correct value, never fails, and is guaranteed to handle every case.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("OVERCONFIDENCE"), `expected OVERCONFIDENCE, got ${types}`);
  assert.notEqual(response.verdict, "APPROVED");
});

test("percentage absolute claims count as overconfidence", () => {
  const { response } = runPipeline({
    output: "This will definitely always work 100% of the time.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("OVERCONFIDENCE"), `expected OVERCONFIDENCE, got ${types}`);
  assert.notEqual(response.verdict, "APPROVED");
});

test("dense absolute claims stay low confidence even with unrelated qualifiers", () => {
  const { response } = runPipeline({
    output:
      "This will definitely always work 100% of the time, never fail, and is guaranteed to be correct for every user. This answer is intentionally overconfident so BIFROST should flag it.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("OVERCONFIDENCE"), `expected OVERCONFIDENCE, got ${types}`);
  assert.notEqual(response.verdict, "APPROVED");
});

test("ambiguous Iran war prompt resolved to Iran-Iraq War requires review", () => {
  const { response } = runPipeline({
    input: "what was the start of the iran war?",
    output:
      "When people ask about the Iran War, they are almost always referring to the Iran-Iraq War. The war officially started on September 22, 1980, when Iraqi forces under Saddam Hussein invaded Iran.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("QUESTION_ASSUMPTION"), `expected QUESTION_ASSUMPTION, got ${types}`);
  assert.equal(response.verdict, "LOW_CONFIDENCE");
  assert.equal(response.descriptor.display, "REVIEW");
  assert.equal(response.descriptor.category, "ambiguous_prompt");
  assert.equal(response.descriptor.label, "REVIEW · AMBIGUOUS PROMPT");
});

test("subjective political value judgment carries review posture", () => {
  const { response } = runPipeline({
    input: "is this political party good?",
    output:
      "I do not have a definitive answer. It depends on what you value; supporters praise its economic policy, while critics point to governance trade-offs.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("VALUE_JUDGMENT"), `expected VALUE_JUDGMENT, got ${types}`);
  assert.ok(response.confidence < 0.9, `expected non-high confidence, got ${response.confidence}`);
});

test("current claim without visible source trail requires review", () => {
  const { response } = runPipeline({
    input: "What is the latest unemployment rate today?",
    output:
      "As of 2026, the unemployment rate is 3.7% and job openings are 8.1 million.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(
    types.includes("CURRENT_CLAIM_NO_SOURCE"),
    `expected CURRENT_CLAIM_NO_SOURCE, got ${types}`
  );
  assert.equal(response.verdict, "LOW_CONFIDENCE");
  assert.equal(response.descriptor.display, "REVIEW");
  assert.equal(response.descriptor.category, "current_claim_no_source");
  assert.equal(response.descriptor.label, "REVIEW · CURRENT CLAIM");
});

test("number-heavy answer without source trail requires review", () => {
  const { response } = runPipeline({
    output:
      "Revenue was $12.4B, EBITDA was $3.1B, margin was 25%, debt was $4.2B, cash was $900M, and capex was $1.2B.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(
    types.includes("UNSOURCED_NUMERIC_CLAIMS"),
    `expected UNSOURCED_NUMERIC_CLAIMS, got ${types}`
  );
  assert.equal(response.verdict, "LOW_CONFIDENCE");
  assert.equal(response.descriptor.display, "REVIEW");
  assert.equal(response.descriptor.category, "unsourced_numeric_claims");
  assert.equal(response.descriptor.label, "REVIEW · UNSOURCED NUMBERS");
});

test("visible source trail suppresses current and numeric source-posture findings", () => {
  const { response } = runPipeline({
    input: "What is the latest revenue picture today?",
    output:
      "As of 2026, revenue was $12.4B, EBITDA was $3.1B, margin was 25%, debt was $4.2B, cash was $900M, and capex was $1.2B. Source: https://www.sec.gov/Archives/example.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.equal(types.includes("CURRENT_CLAIM_NO_SOURCE"), false);
  assert.equal(types.includes("UNSOURCED_NUMERIC_CLAIMS"), false);
  assert.equal(response.descriptor.category, "sourced_shape");
  assert.equal(response.descriptor.label, "APPROVED · SOURCED SHAPE");
});

test("small numeric answer gets specific approved descriptor", () => {
  const { response } = runPipeline({
    output: "The model uses 3 inputs and returns 2 values.",
  });
  assert.equal(response.verdict, "APPROVED");
  assert.equal(response.descriptor.category, "light_numeric_check");
  assert.equal(response.descriptor.label, "APPROVED · LIGHT NUMERIC");
});

test("code with no guards -> EDGE_CASE_FAILURE", () => {
  const { response } = runPipeline({
    output:
      "```js\nfunction first(arr) { return arr[0].toUpperCase(); }\n```",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("EDGE_CASE_FAILURE"), `expected EDGE_CASE_FAILURE, got ${types}`);
  assert.equal(response.verdict, "REJECTED");
});

test("guarded code gets specific approved descriptor", () => {
  const { response } = runPipeline({
    output:
      "```js\nfunction first(arr) { if (!arr?.length) return null; return arr[0]; }\n```",
  });
  assert.equal(response.verdict, "APPROVED");
  assert.equal(response.descriptor.category, "guarded_code");
  assert.equal(response.descriptor.label, "APPROVED · GUARDED CODE");
});

test("contradiction triggers CONTRADICTION_SNAP", () => {
  const { response } = runPipeline({
    output: "Lookups are O(1), but iterating to find a key is O(n).",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("CONTRADICTION_SNAP"), `expected CONTRADICTION_SNAP, got ${types}`);
  assert.equal(response.verdict, "REJECTED");
  assert.equal(response.descriptor.display, "REJECTED");
  assert.equal(response.descriptor.category, "internal_contradiction");
  assert.equal(response.descriptor.label, "REJECTED · CONTRADICTION");
});

test("approval contradiction triggers CONTRADICTION_SNAP", () => {
  const { response } = runPipeline({
    output: "The report is approved and rejected at the same time.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("CONTRADICTION_SNAP"), `expected CONTRADICTION_SNAP, got ${types}`);
  assert.equal(response.verdict, "REJECTED");
});

test("PULSAR returns at most 3 findings", () => {
  const { response } = runPipeline({
    output:
      "Always thread-safe immutable O(1) — but sometimes mutates, has race conditions, and is O(n). Function f(x){ return x[0]; }",
  });
  assert.ok(response.pulsar_findings.length <= 3);
});

test("quasar formula matches spec", () => {
  // 1 - 0.5*0.4 - 2*0.15 = 1 - 0.2 - 0.3 = 0.5
  const score = quasarScore(0.5, [
    { type: "A", description: "", impact: "" },
    { type: "B", description: "", impact: "" },
  ]);
  assert.equal(score, 0.5);
});

test("aurora thresholds", () => {
  assert.equal(auroraVerdict(0.81), "APPROVED");
  assert.equal(auroraVerdict(0.8), "APPROVED");
  assert.equal(auroraVerdict(0.79), "LOW_CONFIDENCE");
  assert.equal(auroraVerdict(0.6), "LOW_CONFIDENCE");
  assert.equal(auroraVerdict(0.59), "REJECTED");
});

test("metrics include per-engine timings", () => {
  const { metrics } = runPipeline({ output: "hello world" });
  for (const k of [
    "astral_ms",
    "meteor_ms",
    "nebula_ms",
    "pulsar_ms",
    "quasar_ms",
    "aurora_ms",
    "total_ms",
  ] as const) {
    assert.ok(typeof metrics[k] === "number", `missing ${k}`);
  }
});

test("response shape matches BifrostResponse contract", () => {
  const { response } = runPipeline({ output: "hello" });
  assert.ok(["APPROVED", "LOW_CONFIDENCE", "REJECTED"].includes(response.verdict));
  assert.equal(typeof response.confidence, "number");
  assert.equal(typeof response.descriptor.label, "string");
  assert.equal(typeof response.descriptor.headline, "string");
  assert.equal(typeof response.descriptor.action, "string");
  assert.ok(Array.isArray(response.reasons));
  assert.ok(Array.isArray(response.pulsar_findings));
  assert.equal(typeof response.timestamp, "string");
});
