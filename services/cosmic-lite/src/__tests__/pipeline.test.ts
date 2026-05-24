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

test("code with no guards -> EDGE_CASE_FAILURE", () => {
  const { response } = runPipeline({
    output:
      "```js\nfunction first(arr) { return arr[0].toUpperCase(); }\n```",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("EDGE_CASE_FAILURE"), `expected EDGE_CASE_FAILURE, got ${types}`);
  assert.equal(response.verdict, "REJECTED");
});

test("contradiction triggers CONTRADICTION_SNAP", () => {
  const { response } = runPipeline({
    output: "Lookups are O(1), but iterating to find a key is O(n).",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(types.includes("CONTRADICTION_SNAP"), `expected CONTRADICTION_SNAP, got ${types}`);
  assert.equal(response.verdict, "REJECTED");
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
  assert.ok(Array.isArray(response.reasons));
  assert.ok(Array.isArray(response.pulsar_findings));
  assert.equal(typeof response.timestamp, "string");
});
