# Scripts Guide

**Parent:** `../AGENTS.md`

Scripts drive the dual Rsbuild pipeline, feature-plan generation, packaging, notarization, icon assets, hooks, and performance gates.

## Key scripts

- `build-rsbuild.js` - builds ESM main and CJS preload, copies offline assets, and preserves preload output with `cleanDistPath: false`.
- `featurePlanPlugin.js` - parses initializer specs with the TypeScript compiler API, unwraps `as const satisfies`, topologically batches dependencies, and idempotently writes `src/main/generated/featurePlan.ts`.
- `check-perf-budget.js` - checks startup/perf metrics, writes `.perf-history.json`, and optionally updates `.perf-baseline.json`.
- `headless-startup.js` - runs Electron headless with metrics export and stable-poll detection; supports `GOGCHAT_PERF_RUNS` median aggregation.
- `notarize.cjs` - uses notarytool with `APPLE_ID`, `APPLE_APP_PASSWORD`, and `APPLE_TEAM_ID`.
- `after-pack.cjs` and `remove-locales.js` - strip unused binaries/locales during packaging.
- `hooks/pre-push` - blocks pushes on lint/check failures.

## Build invariants

- Do not convert the preload build to ESM.
- Do not remove `cleanDistPath: false`; otherwise one Rsbuild pass can delete the other output.
- Do not modify offline asset output paths unless `src/offline/AGENTS.md` contracts are updated too.
- Do not replace the feature-plan plugin with runtime registration.

## Feature-plan plugin rules

- It intentionally ignores implementation `init`/`cleanup` bodies and reads declarative spec metadata.
- Dependency sorting is greedy by batch; preserve deterministic output.
- Export pure helpers such as `buildPlanFromSources` for tests.

## Performance scripts

- Headless startup uses env such as `NODE_ENV=development`, `GOGCHAT_EXPORT_METRICS=1`, `GOGCHAT_AUTO_QUIT_AFTER_MS=12000`, and `CI=1`.
- CI may set `HEADLESS_TIMEOUT_MS=60000` and `GOGCHAT_PERF_RUNS=5`.
- Keep gated vs warn-only perf budget behavior explicit.

## Packaging

- macOS DMG/package behavior is also documented in `mac/AGENTS.md`.
- Never call packaging scripts without building first.
- Do not log secrets from signing/notarization environment variables.
