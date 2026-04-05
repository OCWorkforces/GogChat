# src/shared/ — Cross-Process Contracts

**Generated:** 2026-04-05

5 source files: `constants.ts`, `types.ts`, `validators.ts`, `urlValidators.ts`, `dataValidators.ts`. Single source of truth for all cross-process contracts. **Edit this before touching IPC handlers or preload scripts.**

## FILES

| File | Role |
| --- | --- |
| `constants.ts` | IPC channel names, DOM selectors, timing, rate limits, whitelist |
| `types.ts` | TypeScript interfaces for IPC data, config schema, bridge API |
| `validators.ts` | Input sanitization — all IPC data must pass through here |
| `urlValidators.ts` | URL whitelist validation, Google auth URL detection, host checks |
| `dataValidators.ts` | Data validation helpers for complex objects |

## KEY EXPORTS

**constants.ts**: `IPC_CHANNELS` (renderer→main + main→renderer), `SELECTORS` (FRAGILE DOM selectors), `WHITELISTED_HOSTS`, `RATE_LIMITS`, `TIMING`, `BADGE`, `FAVICON_PATTERNS`, `DEEP_LINK`, `URL_PATTERNS`.

**types.ts**: `GogChatBridgeAPI`, `StoreType`, `AppConfig`, `WindowState`, `Bounds`, `IconType`, `PasskeyFailureData`, `FaviconData`, `UnreadCountData`, `AccountWindowState`, `AccountWindowsMap`, `IPCResponse<T>`, `IPCChannelPayloadMap`, `Branded<T,Brand>`, `ValidatedURL`, `StoreMetadata`.

**validators.ts**: `validateUnreadCount`, `validateFaviconURL`, `validateExternalURL`, `isWhitelistedHost`, `validateBoolean`, `validateString`, `isSafeObject`, `sanitizeHTML`, `validatePasskeyFailureData`, `isAuthenticatedChatUrl`, `isGoogleAuthUrl`, `validateDeepLinkURL`, `validateNotificationData`, `validateAppleSystemPreferencesURL`.

## WORKFLOW: ADDING IPC CHANNEL

1. `constants.ts` — add to `IPC_CHANNELS`
2. `types.ts` — add data interface
3. `validators.ts` — add validator using `isSafeObject` + existing validators
4. Preload: `ipcRenderer.send()` + expose on `GogChatBridgeAPI`
5. Main: `ipcMain.on()` → validate → handle → catch

## WORKFLOW: ADDING CONFIG FIELD

1. Add to `AppConfig` in `types.ts`
2. Add default + schema in `src/main/config.ts`
3. Add IPC handler in relevant feature (with validation)

## ANTI-PATTERNS

- **NEVER** hardcode IPC channel strings — use `IPC_CHANNELS`
- **NEVER** skip validators in IPC handlers — all untrusted input
- **NEVER** add types without validators — pair always
- **NEVER** use `isSafeObject` result without TypeScript type assertion
