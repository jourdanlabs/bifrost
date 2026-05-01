# BIFROST v0.1

> "AI generates. BIFROST verifies."

A universal AI verification layer. Intercepts AI outputs, runs COSMIC-lite
validation (with tiny PULSAR), and returns a real-time verdict in <200ms.

## Architecture

```
[ AI Tool (ChatGPT / Claude / Codex / OpenClaw) ]
                  |
        [ BIFROST EDGE (Extension / CLI) ]
                  |
            POST -> /verify (API)
                  |
         [ Verdict + Findings JSON ]
                  |
          [ Overlay injected to UI ]
```

## Latency contract (non-negotiable)

| Layer          | Budget   | Measured p95 (v0.1) |
| -------------- | -------- | ------------------- |
| API total      | <=150ms  | **0.36ms**          |
| ASTRAL         | 10ms     | 0.05ms              |
| METEOR         | 25ms     | 0.03ms              |
| NEBULA         | 40ms     | 0.26ms              |
| PULSAR-lite    | 25ms     | 0.01ms              |
| QUASAR         | 5ms      | 0.00ms              |
| AURORA         | 5ms      | 0.00ms              |
| I/O overhead   | 30-40ms  | (transport)         |
| UI render      | +10-40ms | (client)            |
| User-perceived | ~160-190ms |                  |

Measured over 1000 pipeline runs across five sample shapes (clean prose,
overconfident prose, code without guards, complexity contradiction, long
ramble) on Apple Silicon. Reproduce with `pnpm --filter @bifrost/cosmic-lite bench`.

> Any engine exceeding budget must be simplified or removed. v0.1 is well
> under budget across the board, which gives v0.2 calibration room to spend.

## Repo layout

```
bifrost/
  apps/
    extension/     Chrome MV3 extension (BIFROST EDGE)
    cli/           CLI wrapper
    web/           Optional debug UI
  services/
    cosmic-lite/   /verify API
  packages/
    types/         Shared TS types
```

## Quick start

```bash
pnpm install
pnpm --filter @bifrost/types build
pnpm --filter @bifrost/cosmic-lite dev      # http://localhost:8787/verify
pnpm --filter @bifrost/cli build
node apps/cli/dist/index.js verify "Always returns null."
```

## Engines (strict order)

ASTRAL -> METEOR -> NEBULA -> PULSAR-lite -> QUASAR -> AURORA

- **ASTRAL** normalizes whitespace and formatting
- **METEOR** extracts code blocks, numerical claims, strong assertions
- **NEBULA** scores uncertainty (contradictions, ambiguity, missing qualifiers)
- **PULSAR-lite** at most 3 findings, ~25ms: edge-case probe, contradiction
  snap, conditional overconfidence
- **QUASAR** scores `1 - U*0.4 - P*0.15` (uncalibrated baseline)
- **AURORA** verdict: APPROVED >=0.80, LOW_CONFIDENCE >=0.60, else REJECTED

Quasar weights are uncalibrated baselines. v0.2 will calibrate against a
sealed, SHA-published corpus.

## Constraints

- No databases
- No multi-pass reasoning
- No heavy LLM calls
- PULSAR stays tiny
- Latency budget enforced
- Ugly > perfect

## v0.1 implementation notes

These are intentional deviations or limitations in the v0.1 baseline. They're
documented so anyone reading scores knows what they do and don't mean.

### Uncalibrated QUASAR baseline weights

QUASAR runs `score = 1 - U*0.4 - P*0.15` with the spec defaults. These are
**uncalibrated baseline values**, not tuned thresholds. With the default
weights a single PULSAR finding alone deducts only 0.15, leaving 0.85 — which
would be APPROVED. That is by design at v0.1: scoring is the lever we expect
to move once we have labeled data. Override at runtime via:

```
BIFROST_WEIGHT_U=0.5 BIFROST_WEIGHT_P=0.25 pnpm --filter @bifrost/cosmic-lite dev
```

### NEBULA absolute-language heuristic

To make overconfidence-shaped outputs land in `LOW_CONFIDENCE` under the
uncalibrated weights, NEBULA contributes to `missing_qualifiers` when **>=2
absolute words** ("always", "never", "guaranteed", ...) appear with **zero
hedging qualifiers**. This is a heuristic stand-in for "the answer reads
absolute despite covering uncertain ground." It will false-fire on short,
genuinely-absolute claims (e.g. "1 + 1 always equals 2") and false-miss when
hedges and absolutes coexist in the same passage. Calibration in v0.2 should
either learn this signal or replace it.

The OVERCONFIDENCE PULSAR rule itself uses the literal `qualifiers` count
exposed by NEBULA — i.e. zero qualifier *words*, per spec — not the derived
`missing_qualifiers` signal.

### PULSAR-Lite (tiny edition)

> Job: poke lies
> Hobby: breaking things (gently)

PULSAR-Lite is a fast adversarial probe that runs in ~25ms and surfaces
potential failure modes in AI output.

It is intentionally small in scope:

- max 3 findings
- regex-based heuristics
- no deep code analysis

It will:

- catch obvious edge cases
- flag contradictions
- highlight overconfident reasoning

It will also:

- false-fire on simple, correct code
- miss complex or unconventional patterns

Don't worry, he's tiny.

**Treat PULSAR-Lite findings as advisory, not authoritative.**

#### Regex-based limitations

Each rule is a regex / substring heuristic, not real analysis:

- **EDGE_CASE_FAILURE** triggers on code blocks that take inputs but contain
  no recognizable guard idiom (`if (!`, `=== null`, `try {`, `?.`, etc.).
  Will false-fire on terse correct code that uses uncommon guards or
  type-system guarantees; will false-miss on guards expressed in patterns
  outside the recognized set. **False-fires on simple correct code are an
  expected v0.1 behavior, not a bug.** AST-level reasoning belongs in v0.2.
- **CONTRADICTION_SNAP** matches a fixed pair-list (O(1) vs O(n), always vs
  sometimes, immutable vs mutate, thread-safe vs race condition). Anything
  outside that list is invisible to it.
- **OVERCONFIDENCE** counts strong-assertion words from a fixed list and
  fires only when NEBULA's qualifier count is exactly zero.

These are deliberately mechanical. The v0.2 plan replaces the heuristics
with AST-level reasoning where applicable and corpus-trained signals
elsewhere; the contract (`PulsarFinding[]` with `type`, `description`,
`impact`) is stable across both implementations.

### v0.2 calibration corpus roadmap

- **Labeled response corpus.** Assemble (output, expected_verdict) pairs
  covering the three categories PULSAR cares about plus clean controls.
  Sourced from real AI outputs across providers and verticals, hand-labeled.
- **Sealed + SHA-published.** Freeze the corpus as an immutable artifact;
  publish its SHA-256 in the repo so any score quoted by BIFROST can be
  traced back to the exact set it was calibrated against.
- **Reproducible calibration process.** Calibration is a script in this
  repo, not a one-off notebook. Anyone can re-run it against the sealed
  corpus and get bit-identical weights.
- Sweep `BASE_WEIGHT_U`, `BASE_WEIGHT_P`, and the AURORA thresholds against
  the corpus; record per-cell precision / recall.
- Replace the NEBULA absolute-language heuristic with whatever the corpus
  shows is actually predictive — keep it only if it pulls weight. Same bar
  applies to each PULSAR rule.
- Ship calibrated defaults in v0.2 and keep the env-var overrides for
  per-deployment tuning.

## RAVEN relationship

RAVEN validates **memory before** agent reasoning. BIFROST validates **AI
output after** generation. Different layers, complementary. Run both.
