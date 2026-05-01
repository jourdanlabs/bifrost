import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeBareCode, bareCodeBlock } from "../engines/bare-code";
import { runPipeline } from "../pipeline";

test("looksLikeBareCode recognizes common signatures", () => {
  assert.equal(looksLikeBareCode("function divide(a, b) { return a / b; }"), true);
  assert.equal(looksLikeBareCode("def divide(a, b):\n    return a / b"), true);
  assert.equal(looksLikeBareCode("const f = (a, b) => a + b"), true);
  assert.equal(looksLikeBareCode("class Foo:\n  pass"), true);
  assert.equal(looksLikeBareCode("fn divide(a: i32, b: i32) -> i32 { a / b }"), true);
  assert.equal(looksLikeBareCode("func Divide(a, b int) int { return a / b }"), true);
});

test("looksLikeBareCode rejects prose", () => {
  assert.equal(looksLikeBareCode("The capital of France is Paris."), false);
  assert.equal(looksLikeBareCode("Always returns the right answer."), false);
  assert.equal(looksLikeBareCode("hi"), false);
  assert.equal(looksLikeBareCode(""), false);
});

test("bareCodeBlock defers to existing fenced code", () => {
  // when meteor already found a fence, do not double-add.
  assert.equal(bareCodeBlock("function f() {}", 1), null);
  // when no fence and pattern matches, return the synthetic block.
  const out = bareCodeBlock("function f() { return 1; }", 0);
  assert.ok(out && out.length === 1);
});

test("pipeline: bare code triggers EDGE_CASE_FAILURE without ``` fences", () => {
  const { response } = runPipeline({
    output: "function divide(a, b) { return a / b; }",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(
    types.includes("EDGE_CASE_FAILURE"),
    `expected EDGE_CASE_FAILURE on bare code, got ${JSON.stringify(types)}`
  );
});

test("pipeline: prose without code does not trigger EDGE_CASE_FAILURE", () => {
  const { response } = runPipeline({
    output: "The capital of France is Paris.",
  });
  const types = response.pulsar_findings.map((f) => f.type);
  assert.ok(
    !types.includes("EDGE_CASE_FAILURE"),
    `prose must not trigger EDGE_CASE_FAILURE, got ${JSON.stringify(types)}`
  );
});
