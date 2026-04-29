# src/shared/types/ — Cross-Process Type Contracts

**Generated:** 2026-04-29 · **Commit:** 3093c79

Canonical TypeScript types shared between main, preload, and renderer processes. All types are `export`-only — no runtime logic, no side effects. Import directly from each file (no barrel re-exports).

## FILES

| File | Lines | Key Exports | Used By |
| --- | --- | --- | --- |
| `branded.ts` | 22 | `Branded<T, Brand>`, `ValidatedURL`, `asValidatedURL(s)` helper | `urlValidators.ts`, `ipcHelper.ts` |
| `bridge.ts` | 28 | `GogChatBridgeAPI`, `declare global { Window.gogchat }` | `src/preload/index.ts`, renderer |
| `config.ts` | 59 | `AppConfig` (incl. `notificationPermissionRequested: boolean`), `StoreMetadata`, `StoreType` (security flags NOT stored here — see `secureFlags.ts`), `StoreKeyPaths` | `src/main/config.ts`, `configCache.ts`, `configSchema.ts` |
| `domain.ts` | 92 | `IconType`, `IconState` (discriminated union), `PasskeyErrorType` union, `UnreadCountData`, `FaviconData`, `OnlineStatusData`, `PasskeyFailureData` (all readonly) | features, utils, preload |
| `ipc.ts` | 64 | `IPCHandler<T>`, `ValidatedIPCMessage<T,C>`, `RateLimitEntry`, `IPCResponse<T>`, `IPCChannelPayloadMap` (computed keys) | `ipcHelper.ts`, `ipcDeduplicator.ts` |
| `window.ts` | 79 | `IAccountWindowManager` (19 methods), `WindowFactory`, `WindowBounds`, `AccountWindowsMap` | `accountWindowManager.ts`, features |

## KEY PATTERNS

- **Branded types**: `ValidatedURL` uses `Branded<string, 'ValidatedURL'>` to enforce validation at the type level — raw strings won't satisfy the type. Use `asValidatedURL(s)` to assert a validated string in code that has already checked it.
- **Config types**: `StoreType` defines the full store shape. `StoreKeyPaths` is a path type for `configGet`/`configSet` type safety (in `src/main/config.ts`). Schema lives in `src/main/config.ts`. **Never** call `store.get(...) as T` directly — use `configGet<K>(key)`. Security-sensitive flags (e.g. cert pinning kill switch) live in `secureFlags.ts` (safeStorage), NOT in StoreType.
- **Window interface**: `IAccountWindowManager` is the contract between main process implementation and feature consumers. 19 methods — add new window operations here.
- **IPC types**: Generic `IPCHandler<T>` and `IPCResponse<T>` ensure type-safe IPC channels. `IPCChannelPayloadMap` uses computed keys `[IPC_CHANNELS.X]` — add new channel payload types here. `ValidatedIPCMessage.channel` is typed as `IPCChannelName`.

## ANTI-PATTERNS

- **Never** add runtime logic — types only
- **Never** create barrel/index files — import directly from each file
- **Never** import from `src/main/` or `src/preload/` — this is a dependency leaf
- **Never** use `any` — use `unknown` or proper branded types
- **Never** duplicate types that exist in a sibling file — re-export from the original
