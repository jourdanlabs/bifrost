// Latency harness. Runs the pipeline against a few canned inputs and
// reports per-engine timing vs. the budget contract.

import { runPipeline } from "./pipeline";

const BUDGETS = {
  astral_ms: 10,
  meteor_ms: 25,
  nebula_ms: 40,
  pulsar_ms: 25,
  quasar_ms: 5,
  aurora_ms: 5,
  total_ms: 150,
} as const;

const SAMPLES: Array<{ name: string; output: string }> = [
  {
    name: "short clean",
    output: "Use Array.prototype.map to transform the list.",
  },
  {
    name: "overconfident",
    output:
      "This function always returns the correct value, never fails, and is guaranteed to handle every case.",
  },
  {
    name: "code with no guards",
    output:
      "Here you go:\n\n```js\nfunction first(arr) {\n  return arr[0].toUpperCase();\n}\n```",
  },
  {
    name: "contradiction",
    output:
      "This lookup is O(1), but iterating to find the key is O(n). It always succeeds, though sometimes returns null.",
  },
  {
    name: "long ramble",
    output: "lorem ipsum dolor sit amet ".repeat(400),
  },
];

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function run() {
  const ITER = 200;
  const runs: Array<ReturnType<typeof runPipeline>["metrics"]> = [];

  // warmup
  for (let i = 0; i < 50; i++) {
    for (const s of SAMPLES) runPipeline({ output: s.output });
  }

  for (let i = 0; i < ITER; i++) {
    for (const s of SAMPLES) {
      runs.push(runPipeline({ output: s.output }).metrics);
    }
  }

  const keys = Object.keys(BUDGETS) as Array<keyof typeof BUDGETS>;
  console.log(`\nBIFROST cosmic-lite latency bench (${runs.length} runs)\n`);
  console.log("engine        p50      p95      p99      budget   ok");
  console.log("------        ----     ----     ----     -----    --");
  let allOk = true;
  for (const k of keys) {
    const vals = runs.map((r) => r[k] as number);
    const p50 = pct(vals, 50);
    const p95 = pct(vals, 95);
    const p99 = pct(vals, 99);
    const ok = p95 <= BUDGETS[k];
    if (!ok) allOk = false;
    console.log(
      `${k.padEnd(12)}  ${p50.toFixed(2).padStart(6)}   ${p95
        .toFixed(2)
        .padStart(6)}   ${p99.toFixed(2).padStart(6)}   ${String(BUDGETS[k]).padStart(5)}    ${ok ? "OK" : "FAIL"}`
    );
  }
  console.log("");
  if (!allOk) {
    console.log("NOTE: at least one engine exceeded its p95 budget.");
    process.exitCode = 1;
  } else {
    console.log("All engines within p95 budget.");
  }
}

run();
