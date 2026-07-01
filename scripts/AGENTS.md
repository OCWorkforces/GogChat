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
- `verify-windows-package-artifacts.js` - checks guarded Windows NSIS setup names, required x64/arm64 outputs, and forbidden package types.
- `verify-windows-signing-policy.js` - blocks Windows release publication unless `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` exists or the owner explicitly allows unsigned Windows assets.
- `verify-release-artifacts.js` - verifies the aggregated macOS DMG plus guarded Windows x64/arm64 setup artifacts before the single publish job.
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

- macOS DMG/package behavior is also documented in `mac/AGENTS.md`; `build-macOS-dmg.sh` remains mac-specific.
- `package:mac:release` is the current macOS release package command.
- `package:win:x64`, `package:win:arm64`, `package:win:artifacts`, and `package:win:signing-policy` cover Windows release-engineering preparation only, not a public support claim.
- Windows setup artifacts must stay as separate NSIS installers named `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`.
- Native Windows CI packaging runs x64 on `windows-latest` with AMD64 proof and arm64 on `windows-11-arm` with ARM64 proof.
- Never call packaging scripts without building first.
- Do not log secrets from signing/notarization environment variables.
