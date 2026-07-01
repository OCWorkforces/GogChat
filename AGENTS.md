# GogChat Agent Guide

**Generated:** 2026-05-22
**Commit:** db58de7
**Branch:** main

## Project shape

GogChat is a macOS-only Electron desktop wrapper for Google Chat (`https://mail.google.com/chat/u/0`). It is TypeScript-first, Apple Silicon oriented, and built with a dual Rsbuild pipeline: ESM main process plus CJS preload because Electron sandboxed preloads cannot load ESM.

This is **not** a typical Electron app:

- Feature startup is build-time generated from `src/main/initializers/*.spec.ts` into `src/main/generated/featurePlan.ts`.
- Runtime feature execution is handled by `src/main/utils/lifecycle/featureRunner.ts`.
- Multi-account state uses per-account `persist:account-N` session partitions.
- The default backend is one BrowserWindow per account; `app.useWebContentsView` switches to a WebContentsView host backend.
- Security, IPC, preload, and URL validation are layered and intentionally strict.

## Commands

Use `bun` only.

```bash
bun install
bun run build:dev
bun run build:prod
bun run typecheck
bun run test
bun run test:run
bun run test:coverage
bun run lint:all
bun run lint:all:fix
bun run check:doc-claims
bun run start
bun run build:mac
bun run package:mac:release
bun run package:win:x64
bun run package:win:arm64
bun run package:win:artifacts
bun run package:win:signing-policy
```

Runtime/toolchain constraints:

- Node `>=24.16.0 <25.0.0`; Bun `>=1.3.13`; package manager `bun@1.3.14`.
- Electron `^42.2.0`.
- TypeScript strict mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUncheckedSideEffectImports`, `noUnusedLocals`, and `noUnusedParameters`.
- Prettier: 100 columns, single quotes, semicolons, trailing commas ES5, LF.

## Packaging guidance

GogChat remains publicly documented as macOS on Apple Silicon. Windows release engineering/preparation is present, but it is not a public support claim. Do not say Windows is supported, released, ready, or available until clean packaged smoke evidence exists on Windows x64 and real Windows arm64.

- `bun run package:mac:release` is the current macOS release package command. Preserve `build-macOS-dmg.sh` as a macOS-specific DMG path.
- `bun run package:win:x64` and `bun run package:win:arm64` are guarded Windows package commands for native Windows CI packaging.
- Windows setup artifacts must stay as separate NSIS installers: `${productName}-${version}-windows-x64-setup.exe` and `${productName}-${version}-windows-arm64-setup.exe`. Use `x64`, not `amd64`, in user-facing labels.
- The release workflow packages x64 on `windows-latest` with AMD64 proof and arm64 on `windows-11-arm` with ARM64 proof.
- Windows release publication requires a Windows Authenticode signing route through `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD` or explicit owner opt-in for unsigned Windows assets through `bun run package:win:signing-policy`.
- The Windows electron-builder overlay registers only `gogchat`; the base macOS config may still include HTTPS protocol handling.

## Where to look

| Task                           | Start here                                                          | Notes                                                            |
| ------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------- |
| App entry                      | `src/main/index.ts`                                                 | Thin orchestrator only. Do not add feature logic here.           |
| App-ready sequence             | `src/main/initializers/registerAppReady.ts`                         | Owns `app.whenReady()` work.                                     |
| Feature specs                  | `src/main/initializers/{security,ui,deferred}.spec.ts`              | Declarative `FeatureSpec[]`; edit these to add/reorder features. |
| Feature codegen                | `scripts/featurePlanPlugin.js`                                      | Parses specs and topo-sorts dependency batches at build time.    |
| Runtime feature runner         | `src/main/utils/lifecycle/featureRunner.ts`                         | Runs security/critical/ui/deferred phases.                       |
| Shared feature context         | `src/main/utils/lifecycle/featureContextStore.ts`                   | Stores `mainWindow` and account manager after bootstrap.         |
| Shutdown                       | `src/main/initializers/registerShutdown.ts`                         | Async cleanup before `app.exit()`.                               |
| BrowserWindow accounts         | `src/main/utils/account/accountWindowManager.ts`                    | Default multi-account backend.                                   |
| WebContentsView accounts       | `src/main/utils/account/accountViewManager.ts`                      | Opt-in backend behind `app.useWebContentsView`.                  |
| Account contract               | `src/shared/types/window.ts`                                        | `IAccountWindowManager` boundary.                                |
| IPC helpers                    | `src/main/utils/ipc/`                                               | Rate limit, validate, dedup/fast-path, catch.                    |
| IPC channel names              | `src/shared/constants.ts`                                           | Never hardcode channel strings.                                  |
| Preload bridge                 | `src/preload/index.ts` + `src/shared/types/bridge.ts`               | Sandboxed CJS preload. No raw `ipcRenderer` exposure.            |
| URL validation                 | `src/shared/urlValidators.ts`                                       | Navigation, external links, deep links, Google auth detection.   |
| Config                         | `src/shared/types/config.ts` + `src/main/config.ts`                 | Update schema and typed accessors together.                      |
| Secure flags                   | `src/main/utils/security/secureFlags.ts`                            | SafeStorage-backed kill switches; not electron-store config.     |
| Error types                    | `src/shared/types/errors.ts` + `src/main/utils/lifecycle/errors.ts` | Prefer typed errors and `{ cause }`.                             |
| Historical webview constraints | `docs/windowWrapper-history.md`                                     | `webSecurity:false` and CSP exceptions are deliberate.           |
| Tests                          | `tests/AGENTS.md`                                                   | Unit/integration/e2e/perf guidance.                              |
| Packaging                      | `mac/AGENTS.md` + `scripts/AGENTS.md`                               | DMG, signing, notarization, perf gates.                          |

## Architecture invariants

### Startup order

1. `setupCertificatePinning()` before any network.
2. `reportExceptions()`.
3. `enforceSingleInstance()`.
4. `setupDeepLinkListener()` before app ready.
5. In `registerAppReady.ts`: error handler, global cleanups + security phase, critical phase + store init, account bootstrap, shared feature context, UI phase.
6. Deferred phase is scheduled after first window work; it includes tray/menu/badges/bootstrap promotion/window state/passkeys/notifications/network/external links/close-to-tray/open-at-login/updates/context menu/first launch/app-location/CDP telemetry/cache warming/perf export.

### Feature lifecycle

- Add features under `src/main/features/`.
- Register by editing `src/main/initializers/*.spec.ts` only.
- Do **not** hand-edit `src/main/generated/featurePlan.ts`.
- Do **not** reintroduce runtime feature registration.
- Feature-to-feature imports are forbidden except `menuActionRegistry.ts` as the decoupling point.

### Multi-account

- Always go through `IAccountWindowManager` when possible.
- Use branded helpers: `asAccountIndex()`, `toPartition()`, `asWebContentsId()`.
- Never interrupt Google auth pages with `loadURL`; check `isGoogleAuthUrl()`.
- BrowserWindow dehydration may destroy windows but must preserve session partitions.
- WebContentsView dehydration hides/throttles views; it does not destroy per-account sessions.

### Security and IPC

- BrowserWindow defaults: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- IPC handlers must rate-limit, validate, handle, and catch. Dedup only where safe.
- Use `IPC_CHANNELS`; never string-literal IPC channel names.
- Use `validateExternalURL()` and `shellWrapper.ts`; never call `shell.openExternal()` directly in main.
- Certificate pinning covers Google domains; kill switches live in SafeStorage-backed secure flags.
- Do not wholesale replace Google CSP. Existing COEP/COOP/frame-ancestors stripping is targeted and intentional.

## Type and code conventions

- Use `import type` for type-only imports.
- No barrel/re-export files unless a local legacy exception already exists.
- For casts, use `asType<T>(value)` or branded helpers. Bare `value as T` is only allowed for `as const`, tests, and allowlisted cast utilities.
- Never use `as any`, `@ts-ignore`, or `@ts-expect-error`.
- Never add bare `setTimeout`/`setInterval` in main; use tracked resource helpers.
- Never create feature logic in `src/main/index.ts`.
- Never open external URLs without shared URL validation.

## Working principles

These apply to every change in this repo, whether you implement it yourself or delegate.

### Think before coding

- State assumptions explicitly. If uncertain, ask one precise question instead of guessing.
- If multiple interpretations of the request exist, surface them; do not pick silently.
- If a simpler approach exists than what was described, say so and push back when warranted.
- If something is unclear, stop and name what is confusing. Do not hide confusion behind speculative code.

### Simplicity first

Write the minimum code that solves the stated problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No `flexibility` or `configurability` that was not requested.
- No error handling for scenarios that cannot happen given current contracts.
- If a 200-line solution could be 50 lines, rewrite it. Ask: would a senior engineer call this overcomplicated?

### Surgical changes

Touch only what the request requires. Clean up only the mess your own changes created.

- Do not `improve` adjacent code, comments, or formatting while editing.
- Do not refactor code that is not broken, even if you would write it differently.
- Match the existing style of the file you are editing.
- If you spot unrelated dead code or issues, mention them in the final message as observations; do not delete or fix them.
- Remove imports, variables, and functions that _your_ changes orphaned. Leave pre-existing dead code alone unless asked.
- The test for every changed line: does it trace directly to the user's request?

### Goal-driven execution

Define success criteria up front, then loop until they verify. Strong criteria let you work independently; weak ones ("make it work") force constant clarification.

Transform tasks into verifiable goals:

- `Add validation` -> write tests for invalid inputs, then make them pass.
- `Fix the bug` -> write a test that reproduces it, then make it pass.
- `Refactor X` -> ensure the same tests pass before and after.

For multi-step tasks, state a brief plan with a verification check per step:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

## Current AGENTS hierarchy

Nested guides supplement this root and are intentionally more specific:

- `src/main/AGENTS.md`
- `src/main/features/AGENTS.md`
- `src/main/initializers/AGENTS.md`
- `src/main/utils/AGENTS.md`
- `src/main/utils/{account,config,ipc,lifecycle,platform,security}/AGENTS.md`
- `src/shared/AGENTS.md`
- `src/shared/types/AGENTS.md`
- `src/preload/AGENTS.md`
- `src/offline/AGENTS.md`
- `scripts/AGENTS.md`
- `tests/AGENTS.md`
- `mac/AGENTS.md`

Low-score `docs/` and `.github/workflows/` are covered here plus `scripts/AGENTS.md` and `mac/AGENTS.md`; add local AGENTS files there only if new agent-critical conventions appear. `resources/` has its own guide for icon variants, generation, and packaging.
