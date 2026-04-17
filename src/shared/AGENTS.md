# src/shared/ — Cross-Process Contracts

**Generated:** 2026-04-05

5 source modules: `constants.ts`, `types.ts` (thin barrel → `types/`), `validators.ts`, `urlValidators.ts`, `dataValidators.ts`. Single source of truth for all cross-process contracts. **Edit this before touching IPC handlers or preload scripts.**

## FILES

| File | Role |
| --- | --- |
| `constants.ts` | IPC channel names, DOM selectors, timing, rate limits, whitelist |
| `types.ts` | Thin barrel re-exporting everything under `types/` (backward-compat for `../shared/types.js` imports) |
| `types/branded.ts` | `Branded<T,Brand>`, `ValidatedURL` nominal types |
| `types/window.ts` | `WindowBounds`, `WindowState`, `AccountWindowBounds`, `AccountWindowState`, `AccountWindowsMap`, `WindowFactory` |
| `types/domain.ts` | Domain IPC payloads: `IconType`, `UnreadCountData`, `FaviconData`, `OnlineStatusData`, `PasskeyFailureData`, `NotificationData`, `BadgeIconCacheEntry`, `LinkValidationResult`, `ErrorLogEntry`, `PerformanceMetrics` |
| `types/config.ts` | `AppConfig`, `StoreMetadata`, `StoreType` |
| `types/ipc.ts` | `IPCHandler<T>`, `ValidatedIPCMessage<T>`, `RateLimitEntry`, `IPCResponse<T>`, `IPCChannelPayloadMap` |
| `types/bridge.ts` | `GogChatBridgeAPI` + `declare global { Window.gogchat }` |
| `types/index.ts` | Barrel that aggregates the above and hosts the `StoreKeyPaths<T>` helper |
| `validators.ts` | Input sanitization — all IPC data must pass through here |
| `urlValidators.ts` | URL whitelist validation, Google auth URL detection, host checks |
| `dataValidators.ts` | Data validation helpers for complex objects |

## KEY EXPORTS

**constants.ts**: `IPC_CHANNELS` (renderer→main + main→renderer), `SELECTORS` (FRAGILE DOM selectors), `WHITELISTED_HOSTS`, `RATE_LIMITS`, `TIMING`, `BADGE`, `FAVICON_PATTERNS`, `DEEP_LINK`, `URL_PATTERNS`.

**types.ts** (re-exports from `./types/`): `GogChatBridgeAPI`, `StoreType`, `AppConfig`, `WindowState`, `WindowBounds`, `IconType`, `PasskeyFailureData`, `FaviconData`, `UnreadCountData`, `AccountWindowState`, `AccountWindowsMap`, `WindowFactory`, `IPCResponse<T>`, `IPCChannelPayloadMap`, `IPCHandler<T>`, `ValidatedIPCMessage<T>`, `RateLimitEntry`, `Branded<T,Brand>`, `ValidatedURL`, `StoreMetadata`, `StoreKeyPaths<T>`, `BadgeIconCacheEntry`, `LinkValidationResult`, `ErrorLogEntry`, `PerformanceMetrics`, `NotificationData`, `OnlineStatusData`. Add new types in the appropriate `types/*.ts` domain file; the barrel re-exports automatically.

**validators.ts**: `validateUnreadCount`, `validateFaviconURL`, `validateExternalURL`, `isWhitelistedHost`, `validateBoolean`, `validateString`, `isSafeObject`, `sanitizeHTML`, `validatePasskeyFailureData`, `isAuthenticatedChatUrl`, `isGoogleAuthUrl`, `validateDeepLinkURL`, `validateNotificationData`, `validateAppleSystemPreferencesURL`.

## WORKFLOW: ADDING IPC CHANNEL

1. `constants.ts` — add to `IPC_CHANNELS`
2. `types/domain.ts` (or another fitting `types/*.ts` file) — add data interface; the barrel re-exports it
3. `validators.ts` — add validator using `isSafeObject` + existing validators
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
