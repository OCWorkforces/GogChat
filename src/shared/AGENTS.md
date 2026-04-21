# src/shared/ — Cross-Process Contracts

**Generated:** 2026-04-21 | **Commit:** b12967f

Cross-process contracts: constants, validators (split by domain), types (split into `types/`). Single source of truth for IPC, config, and bridge APIs. **Edit this before touching IPC handlers or preload scripts.** No barrel files, all imports go directly to source modules.

## FILES

| File | Role |
| --- | --- |
| `constants.ts` | `IPC_CHANNELS` (8), `SELECTORS`, `TIMING`, `ICON_TYPES`, `FAVICON_PATTERNS`, `RATE_LIMITS`, `BADGE`, `WHITELISTED_HOSTS`, `URL_PATTERNS`, `DEEP_LINK` |
| `dataValidators.ts` | `validateUnreadCount`, `validateBoolean`, `validateString`, `isSafeObject`, `sanitizeHTML`, `validatePasskeyFailureData`, `validateNotificationData` |
| `urlValidators.ts` | `validateFaviconURL`, `validateExternalURL`, `validateAppleSystemPreferencesURL`, `isWhitelistedHost`, `validateDeepLinkURL`, `isAuthenticatedChatUrl`, `isGoogleAuthUrl` |
| `types/branded.ts` | `Branded<T,Brand>`, `ValidatedURL` nominal types |
| `types/window.ts` | `IAccountWindowManager` (19 methods), `WindowFactory`, `WindowBounds`, `WindowState`, `AccountWindowBounds`, `AccountWindowState`, `AccountWindowsMap` |
| `types/domain.ts` | `IconType`, `UnreadCountData`, `FaviconData`, `OnlineStatusData`, `PasskeyFailureData`, `NotificationData`, `BadgeIconCacheEntry`, `LinkValidationResult`, `ErrorLogEntry`, `PerformanceMetrics` |
| `types/config.ts` | `AppConfig`, `StoreMetadata`, `StoreType`, `StoreKeyPaths` |
| `types/ipc.ts` | `IPCHandler<T>`, `ValidatedIPCMessage<T>`, `RateLimitEntry`, `IPCResponse<T>`, `IPCChannelPayloadMap` |
| `types/bridge.ts` | `GogChatBridgeAPI` + `declare global { Window.gogchat }` |

## KEY EXPORTS

**constants.ts**: `IPC_CHANNELS` (renderer→main + main→renderer), `SELECTORS` (FRAGILE DOM selectors), `WHITELISTED_HOSTS`, `RATE_LIMITS`, `TIMING`, `BADGE`, `FAVICON_PATTERNS`, `DEEP_LINK`, `URL_PATTERNS`, `ICON_TYPES`.

**dataValidators.ts**: data sanitization for IPC payloads. Use `isSafeObject` first, then field validators.

**urlValidators.ts**: URL whitelist enforcement, Google auth detection, deep link validation. All `shell.openExternal()` calls must pass through `validateExternalURL`.

**types/**: import directly from the specific file (e.g. `import type { StoreType } from '../shared/types/config.js'`). No barrel re-exports.

## WORKFLOW: ADDING IPC CHANNEL

1. `constants.ts` — add to `IPC_CHANNELS`
2. `types/domain.ts` (or fitting `types/*.ts`) — add data interface
3. `dataValidators.ts` or `urlValidators.ts` — add validator using `isSafeObject` + existing validators
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
