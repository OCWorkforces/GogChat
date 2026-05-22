# Main Process Guide

**Parent:** `../../AGENTS.md`

`src/main` is the Electron main process: startup orchestration, feature execution, BrowserWindow/WebContentsView account backends, app-level security, IPC handlers, and macOS integration.

## Entry and startup

- `index.ts` must stay thin. It wires the top-level sequence only.
- `initializers/registerAppReady.ts` owns `app.whenReady()` work.
- Startup order is security-sensitive: certificate pinning, exception reporting, single-instance lock, deep links, app-ready security/critical phases, account bootstrap, context store, UI phase, then deferred phase.
- Feature specs live in `initializers/{security,ui,deferred}.spec.ts`; generated plan lives in `generated/featurePlan.ts` and must not be hand-edited.

## Module map

| Area | Path | Local guide |
| --- | --- | --- |
| Feature modules | `features/` | `features/AGENTS.md` |
| Startup/shutdown/specs | `initializers/` | `initializers/AGENTS.md` |
| Account backends | `utils/account/` | `utils/account/AGENTS.md` |
| Lifecycle/resource cleanup | `utils/lifecycle/` | `utils/lifecycle/AGENTS.md` |
| IPC helpers | `utils/ipc/` | `utils/ipc/AGENTS.md` |
| Security utilities | `utils/security/` | `utils/security/AGENTS.md` |
| Platform/menu/badges | `utils/platform/` | `utils/platform/AGENTS.md` |
| Config cache/schema access | `utils/config/` | `utils/config/AGENTS.md` |

## Main-process rules

- BrowserWindow/webPreferences defaults must remain `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Do not import from `src/preload`; communicate through typed shared contracts and IPC.
- Do not call `shell.openExternal()` directly. Use `validateExternalURL()` and `utils/security/shellWrapper.ts`.
- Never log credentials, OAuth tokens, cookies, or full Google auth URLs; strip or validate first.
- Do not add raw timers/listeners in main. Use tracked helpers from `utils/lifecycle/resourceCleanup.ts`.
- Keep feature-to-feature imports out of `features/`, except the existing `menuActionRegistry.ts` decoupling point.
- Keep typed errors and `{ cause }`; use shared `ErrorCode` when crossing module boundaries.

## Common workflows

### Add or reorder startup behavior

1. Implement the behavior in `features/` or a focused utility module.
2. Add a `FeatureSpec` to exactly one initializer spec.
3. Declare `dependsOn` instead of relying on array position.
4. Run `bun run build:dev` or `bun run build:prod` to regenerate `generated/featurePlan.ts`.

### Add IPC

1. Add/extend channel constants in `src/shared/constants.ts`.
2. Add shared payload/response types and validators.
3. Register the main handler through `utils/ipc/` helpers.
4. Expose only a narrow preload bridge method; never expose raw `ipcRenderer`.

### Touch account windows

- Prefer the `IAccountWindowManager` contract from `src/shared/types/window.ts`.
- Update both `accountWindowManager.ts` and `accountViewManager.ts` unless the behavior is backend-specific.
- Preserve `persist:account-N` partitions and Google auth page handling.

## Tests to consider

- Main utility/feature changes: colocated `*.test.ts` or `tests/unit/features`.
- Account/window behavior: integration or e2e tests with helpers from `tests/helpers/electron-test.ts`.
- Startup/performance-sensitive changes: `bun run build:prod`, headless startup, and perf budget scripts.
