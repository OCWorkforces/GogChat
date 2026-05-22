# Main Utilities Guide

**Parent:** `../AGENTS.md`

`src/main/utils` contains reusable main-process mechanics. Keep orchestration in initializers/features and keep reusable infrastructure here.

## Subdirectories

| Area | Path | Guide |
| --- | --- | --- |
| Account backends | `account/` | `account/AGENTS.md` |
| Config cache/access | `config/` | `config/AGENTS.md` |
| IPC pipeline | `ipc/` | `ipc/AGENTS.md` |
| Lifecycle/resources | `lifecycle/` | `lifecycle/AGENTS.md` |
| Platform/menu/badges | `platform/` | `platform/AGENTS.md` |
| Security wrappers | `security/` | `security/AGENTS.md` |

## Utility ownership

- `account/` owns BrowserWindow and WebContentsView account backends.
- `lifecycle/` owns feature execution, cleanup tracking, errors, performance monitors, and context storage.
- `ipc/` owns main-side handler wrappers, rate limiting, dedup, fast-path send helpers, and validators.
- `security/` owns shell wrappers, secure flags, permission/CSP helpers, media access, and encryption key utilities.
- `platform/` owns macOS app menu, tray, badges, icon cache, dock/menu helpers, and window defaults.
- `config/` owns typed electron-store access/cache only; secure flags are not config.

## Resource rules

- Deep performance notes live in `PERFORMANCE_UTILITIES.md`; consult it before changing startup, memory, IPC latency, or renderer sampling utilities.
- Main-process timers/listeners must be tracked with `createTrackedInterval`, `createTrackedTimeout`, `addTrackedListener`, `registerCleanupTask`, or `registerGlobalCleanupCallback`.
- Bare timer exceptions must be documented and rare; `errorHandler` has a circular-dependency exception.
- Cleanups should be idempotent and safe during partial startup failures.

## Import rules

- Utilities may import from `src/shared` freely.
- Avoid feature-to-feature dependencies via utilities. If a utility starts depending on feature state, move the boundary.
- Do not create new barrel files; existing local `index.ts` files are legacy conveniences.
- Prefer small utility modules over large cross-domain catchalls.

## Logging scopes

Use existing logger scopes rather than ad-hoc console output. Keep scope names stable because tests and diagnostics rely on them.

## Anti-patterns

- No BrowserWindow account logic outside `account/` unless it is a narrow platform default.
- No direct `shell.openExternal()`; use `security/shellWrapper.ts`.
- No unvalidated IPC payloads or string-literal IPC channels.
- No config reads for SafeStorage-backed kill switches.
