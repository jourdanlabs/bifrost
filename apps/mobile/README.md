# BIFROST Mobile

Phone-first BIFROST verifier PWA. It runs the local COSMIC-lite deterministic
pipeline in the browser and returns `APPROVED`, `REVIEW`, or `REJECTED` without
runtime LLM calls.

## What Ships

- Mobile paste-and-run verifier for LLM answers.
- Sample packets for finance numbers, unsafe code, and a clean low-risk answer.
- Deterministic `input_hash` for the prompt/output payload.
- Exportable JSON receipt with verdict, descriptor, findings, metrics, and hash.
- Web app manifest with `share_target`, so mobile users can share model output
  into BIFROST when hosted over HTTPS and installed.
- Service worker cache for add-to-home-screen use.

## Build

```bash
pnpm --filter @bifrost/mobile build
```

The static output lands in `apps/mobile/dist`.

## Local QA

```bash
cd apps/mobile/dist
python3 -m http.server 8795 --bind 127.0.0.1
```

Open `http://127.0.0.1:8795`.

Expected sample results:

- Finance numbers -> `REVIEW` for unsourced numeric claims.
- Unsafe code -> `REJECTED` for code edge-case risk.
- Clean answer -> `APPROVED`.

## Hosting

For real phone install/share-target behavior, host `apps/mobile/dist` over
HTTPS. The app is intentionally static, so it can be deployed to Vercel, S3/R2,
or any static host.
