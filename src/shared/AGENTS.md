# src/shared/ — Cross-Process Contracts

**Generated:** 2026-04-30 | **Commit:** 315722d

Cross-process contracts: constants, validators (split by domain), types (split into `types/`, 7 files). Single source of truth for IPC, config, and bridge APIs. **Edit this before touching IPC handlers or preload scripts.** No barrel files, all imports go directly to source modules.

## FILES

| File | Role |
| --- | --- |
| `constants.ts` | `IPC_CHANNELS` (8, `as const satisfies Record<string, string>`), `IPCChannelName` type, `SELECTORS`, `TIMING`, `ICON_TYPES`, `FAVICON_PATTERNS`, `RATE_LIMITS`, `BADGE`, `WHITELISTED_HOSTS`, `URL_PATTERNS`, `DEEP_LINK` |
| `dataValidators.ts` | `validateUnreadCount`, `validateBoolean`, `validateString`, `isSafeObject`, `sanitizeHTML`, `validatePasskeyFailureData`, `validateNotificationData` |
| `urlValidators.ts` | `validateFaviconURL`, `validateExternalURL`, `validateAppleSystemPreferencesURL`, `isWhitelistedHost`, `validateDeepLinkURL`, `isAuthenticatedChatUrl`, `isGoogleAuthUrl`. Parse-once pattern: URLs parsed once per call, result reused. Internal helpers: `tryParseURL()`, `isWhitelistedHostInternal()` |
| `typeUtils.ts` | `assertNever(value)` — exhaustiveness helper for discriminated union `switch` defaults; throws `GogChatError` if a case is unhandled |
| `types/branded.ts` | `Branded<T,Brand>`, `ValidatedURL` nominal types, `asValidatedURL()` helper |
| `types/window.ts` | `IAccountWindowManager` (22 methods), `WindowFactory`, `WindowBounds`, `WindowState`, `AccountWindowBounds`, `AccountWindowState`, `AccountWindowsMap` |
| `types/domain.ts` | `IconType`, `IconState` (discriminated union), `PasskeyErrorType` union (8 WebAuthn values), `UnreadCountData`, `FaviconData`, `OnlineStatusData`, `PasskeyFailureData`, `NotificationData`, `BadgeIconCacheEntry`, `LinkValidationResult`, `ErrorLogEntry`, `PerformanceMetrics` (all readonly) |
| `types/config.ts` | `AppConfig`, `StoreMetadata`, `StoreType`, `StoreKeyPaths` |
| `types/ipc.ts` | `IPCHandler<T>`, `ValidatedIPCMessage<T,C>` (channel typed as `IPCChannelName`), `RateLimitEntry`, `IPCResponse<T>`, `IPCChannelPayloadMap` (computed keys `[IPC_CHANNELS.X]`) |
| `types/bridge.ts` | `GogChatBridgeAPI` + `declare global { Window.gogchat }` |
| `types/errors.ts` | `ErrorCode` union (14 codes: `IPC_*`, `CONFIG_*`, `WINDOW_*`, `FEATURE_*`, `UNKNOWN`); shared between `GogChatError` subclasses in `src/main/utils/errors.ts` |

## KEY EXPORTS

**constants.ts**: `IPC_CHANNELS` (renderer→main + main→renderer, `as const satisfies Record<string, string>`), `IPCChannelName` derived type, `SELECTORS` (FRAGILE DOM selectors), `WHITELISTED_HOSTS`, `RATE_LIMITS`, `TIMING`, `BADGE`, `FAVICON_PATTERNS`, `DEEP_LINK`, `URL_PATTERNS`, `ICON_TYPES`.

**dataValidators.ts**: data sanitization for IPC payloads. Use `isSafeObject` first, then field validators.

**urlValidators.ts**: URL whitelist enforcement, Google auth detection, deep link validation. All `shell.openExternal()` calls must pass through `validateExternalURL`. Uses parse-once pattern — each validator parses the URL once and reuses the result, with shared internal helpers `tryParseURL()` and `isWhitelistedHostInternal()`.

**types/**: import directly from the specific file (e.g. `import type { StoreType } from '../shared/types/config.js'`). No barrel re-exports.

**typeUtils.ts**: `assertNever()` — call in `default:` branch of a `switch` over a discriminated union to get a compile-time error when a new variant is added but unhandled.

## WORKFLOW: ADDING IPC CHANNEL

1. `constants.ts` — add to `IPC_CHANNELS`; `IPCChannelName` updates automatically
2. `types/domain.ts` (or fitting `types/*.ts`) — add data interface
3. `dataValidators.ts` or `urlValidators.ts` — add validator using `isSafeObject` + existing validators; pair `PasskeyErrorType`-style union if the field has a bounded set of values
4. Preload: `ipcRenderer.send()` + expose on `GogChatBridgeAPI`
5. Main: `ipcMain.on()` → validate → handle → catch

## WORKFLOW: ADDING CONFIG FIELD

1. Add to `AppConfig` in `types/config.ts`
2. Add default + schema in `src/main/config.ts`
3. Add IPC handler in relevant feature (with validation)

## ANTI-PATTERNS

- **NEVER** hardcode IPC channel strings — use `IPC_CHANNELS`
- **NEVER** skip validators in IPC handlers — all untrusted input
- **NEVER** add types without validators — pair always
- **NEVER** use `isSafeObject` result without TypeScript type assertion

## KEY PATTERNS

- **Branded error codes**: `ErrorCode` union in `types/errors.ts` is the contract; `GogChatError` subclasses (`IPCError`, `ConfigError`) carry one. Throw typed errors with `{ cause }` chaining instead of bare `Error`.
- **Exhaustive switches**: Use `assertNever(x)` from `typeUtils.ts` in `default:` for any `switch` over a discriminated union (`IconState`, `PasskeyErrorType`, `ErrorCode`). Compiler flags missing cases; runtime throws `GogChatError` if reached.
