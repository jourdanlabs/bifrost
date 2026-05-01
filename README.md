<p align="center">
  <img src="./assets/bifrost-hero.png" alt="BIFROST — Universal AI Verification Layer" width="100%" />
</p>

<h1 align="center">BIFROST</h1>

<p align="center"><strong>AI generates. BIFROST verifies.</strong></p>
<p align="center"><em>Universal AI verification layer. Built by JourdanLabs.</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-v0.1-7c3aed" alt="v0.1" />
  <img src="https://img.shields.io/badge/tests-9%2F9_passing-22c55e" alt="9/9 tests passing" />
  <img src="https://img.shields.io/badge/p95_latency-0.36ms-22c55e" alt="p95 latency 0.36ms" />
  <img src="https://img.shields.io/badge/budget-150ms-6b7280" alt="150ms budget" />
  <img src="https://img.shields.io/badge/license-MIT-6b7280" alt="MIT" />
</p>

---

## What it does

BIFROST sits between any AI and the user. It runs a deterministic six-engine
pipeline against AI outputs and returns one of three verdicts: `APPROVED`,
`LOW_CONFIDENCE`, or `REJECTED`. Verdicts arrive in well under 150ms with
full reasoning attached, so you can ship AI features without trusting the
model blind.

No databases. No multi-pass reasoning. No heavy LLM calls. Just fast,
deterministic, auditable verification.

---

## Install

**Chrome extension** — load unpacked from `apps/extension/dist`:

```bash
pnpm install && pnpm --filter @bifrost/extension build
# then chrome://extensions -> Developer mode on -> Load unpacked -> apps/extension/dist
```

**CLI** — link locally for now (npm publish coming with v0.2):

```bash
pnpm install && pnpm --filter @bifrost/cli build && npm link apps/cli
bifrost verify "your AI output here"
```

**API** — run cosmic-lite locally; the extension and CLI both default to
`http://localhost:8787/verify`:

```bash
pnpm --filter @bifrost/cosmic-lite dev
curl -s -X POST http://localhost:8787/verify \
  -H 'content-type: application/json' \
  -d '{"output":"AI text to verify"}' | jq
```

---

## The COSMIC-lite pipeline

Every request flows through six engines in strict order. Each engine has its
own latency budget; a verdict is the composition of all six.

| Engine | Job | What it produces |
| ------ | --- | ---------------- |
| **ASTRAL** | Normalize input | Cleaned text with code blocks preserved |
| **METEOR** | Extract claims | Code blocks, numbers, strong assertions |
| **NEBULA** | Detect uncertainty | Contradiction / ambiguity / missing-qualifier signals |
| **PULSAR-Lite** | Adversarial probe | Up to 3 findings (edge case / contradiction / overconfidence) |
| **QUASAR** | Score | Confidence in [0, 1] |
| **AURORA** | Final verdict | `APPROVED` / `LOW_CONFIDENCE` / `REJECTED` |

The pipeline is deterministic: the same input produces the same verdict and
the same findings. No model in the loop, no flake.

---

## Latency budget

The contract: every request fits inside 150ms. We measure and publish.

| Layer          | Budget   | Measured p95 (v0.1) |
| -------------- | -------- | ------------------- |
| **API total**  | **<=150ms** | **0.36ms**       |
| ASTRAL         | 10ms     | 0.05ms              |
| METEOR         | 25ms     | 0.03ms              |
| NEBULA         | 40ms     | 0.26ms              |
| PULSAR-Lite    | 25ms     | 0.01ms              |
| QUASAR         | 5ms      | 0.00ms              |
| AURORA         | 5ms      | 0.00ms              |
| I/O overhead   | 30-40ms  | (transport)         |
| UI render      | +10-40ms | (client)            |
| User-perceived | ~160-190ms |                  |

Measured over 1000 pipeline runs across five sample shapes (clean prose,
overconfident prose, code without guards, complexity contradiction, long
ramble). Reproduce with:

```bash
pnpm --filter @bifrost/cosmic-lite bench
```

This isn't bragging. It's the contract. Any engine that exceeds its budget
must be simplified or removed.

---

## Methodology disclosures

We publish honest limitations. The disclosures below are load-bearing — they
tell you what a v0.1 verdict does and does not mean. They are not legal
cover.

### 8.1 — Uncalibrated QUASAR baseline

BIFROST v0.1 ships with **un-calibrated QUASAR weights**:

- `BASE_WEIGHT_U` (uncertainty weight) = `0.4`
- `BASE_WEIGHT_P` (PULSAR finding weight) = `0.15`

These are baseline values, not tuned thresholds. Override at runtime via
environment variables read in [services/cosmic-lite/src/engines/quasar.ts](services/cosmic-lite/src/engines/quasar.ts):

```bash
BIFROST_WEIGHT_U=0.5 BIFROST_WEIGHT_P=0.25 \
  pnpm --filter @bifrost/cosmic-lite dev
```

**v0.2 will calibrate against a sealed, SHA-published labeled response
corpus with reproducible methodology.** Until then, treat absolute scores as
ordinal, not metric.

### 8.2 — NEBULA absolute-language heuristic

When **>=2 absolute-language tokens** ("always", "never", "guaranteed",
"every", ...) appear with **0 hedging qualifiers** ("may", "might",
"sometimes", ...), NEBULA bumps the `missing_qualifiers` signal. This is a
heuristic, not semantic understanding. It will false-fire on short,
genuinely-absolute claims (`1 + 1 always equals 2`) and false-miss when
hedges and absolutes coexist in the same passage.

**v0.2 will replace this with calibrated linguistic modeling** trained on
the sealed corpus.

### 8.3 — PULSAR-Lite is advisory, not authoritative

> Job: poke lies
> Hobby: breaking things (gently)

PULSAR-Lite is a regex-based heuristic, not a code analyzer. Each rule is a
fixed pattern — no AST, no symbol table, no execution model:

- **EDGE_CASE_FAILURE** flags code with input parameters but no recognizable
  guard idiom. Will false-fire on terse correct code (e.g. simple functions
  without explicit input guards) and false-miss on unusual guard idioms.
- **CONTRADICTION_SNAP** matches a fixed pair-list (O(1) vs O(n), always vs
  sometimes, immutable vs mutate, thread-safe vs race condition).
- **OVERCONFIDENCE** counts strong-assertion words and fires only when
  NEBULA's qualifier count is exactly zero.

**v0.2 PULSAR will integrate AST-level reasoning** for code findings and
corpus-trained signals for prose findings. Treat v0.1 PULSAR findings as
**advisory, not authoritative**.

> Don't worry, he's tiny.

---

## Verdict examples

Reproduced from the v0.1 smoke run. Start the API
(`pnpm --filter @bifrost/cosmic-lite dev`) and follow along.

**Clean code -> APPROVED 1.00**

```bash
$ bifrost verify "Use Array.prototype.map to transform a list."
[APPROVED 1.00]
  - No high-risk signals detected.
```

**Overconfident prose -> LOW_CONFIDENCE 0.77 + OVERCONFIDENCE finding**

```bash
$ bifrost verify "This always works perfectly, never fails, and is guaranteed to handle every case."
[LOW_CONFIDENCE 0.77]
  - Long output with too few hedging qualifiers (5 expected).
  - PULSAR-lite raised 1 finding(s).

PULSAR findings:
  * OVERCONFIDENCE: Output uses 5 absolute assertions (e.g. always/never/guaranteed) with no hedging.
    impact: High risk of confident-but-wrong output; downstream users will not double-check.
```

**Contradictory text -> LOW_CONFIDENCE 0.73 + CONTRADICTION_SNAP finding**

```bash
$ echo "Lookups are O(1) but iterating to find a key is O(n)." | bifrost verify
[LOW_CONFIDENCE 0.73]
  - Detected 1 contradiction signal(s).
  - PULSAR-lite raised 1 finding(s).

PULSAR findings:
  * CONTRADICTION_SNAP: Claims O(1) while also describing higher complexity.
    impact: The two claims cannot both be true; downstream consumers will misinterpret.
```

---

## v0.2 roadmap

- **Calibrated QUASAR weights** — sealed corpus, SHA-published, reproducible
  calibration script committed to the repo
- **AST-level PULSAR reasoning** — replace edge-case regex heuristic with
  real syntactic analysis for the languages we care about
- **Streaming verdict support** — provisional verdicts mid-stream; today the
  adapters are completed-only
- **Provider adapter expansion** — beyond OpenAI / Anthropic / generic; add
  Gemini, Mistral, local-LLM front-ends
- **SDKs** — TypeScript and Python, once the API contract is locked

---

## Positioning

BIFROST is one of three layers in the JourdanLabs trust architecture:

- **COSMIC** — the substrate (deterministic multi-engine reasoning)
- **OMNIS KEY** — the internal runtime (JL-native agent OS)
- **BIFROST** — the external verification layer (any AI's outputs)

Both OMNIS KEY and BIFROST are built on COSMIC. OMNIS KEY hosts JourdanLabs
agents natively. BIFROST verifies outputs from any AI system regardless of
where it runs.

### RAVEN

RAVEN validates **memory before** agent reasoning. BIFROST validates **AI
output after** generation. Different layers, complementary. Run both for
serious agent deployments.

---

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
  assets/          README hero + preview
```

## License

MIT. See [LICENSE](LICENSE).

## Built by

[JourdanLabs](https://jourdanlabs.com/bifrost) ·
[github.com/jourdanlabs/bifrost](https://github.com/jourdanlabs/bifrost)
