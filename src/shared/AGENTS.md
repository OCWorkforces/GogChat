# src/shared/ — Cross-Process Contracts

**Generated:** 2026-03-21
## OVERVIEW

5 source files: `constants.ts`, `types.ts`, `validators.ts`, `environment.ts`, `urls.ts`. Single source of truth for all cross-process contracts. Changes here propagate to both Electron main and preload bundles. **Edit this before touching IPC handlers or preload scripts.**

## FILES

| File            | Role                                                             |
| --------------- | ---------------------------------------------------------------- |
| `constants.ts`  | IPC channel names, DOM selectors, timing, rate limits, whitelist |
| `types.ts`      | TypeScript interfaces for IPC data, config schema, bridge API    |
| `validators.ts` | Input sanitization — all IPC data must pass through here         |

## KEY EXPORTS FROM `constants.ts`

```typescript
IPC_CHANNELS; // renderer→main: UNREAD_COUNT, FAVICON_CHANGED, NOTIFICATION_CLICKED,
//                CHECK_IF_ONLINE, PASSKEY_AUTH_FAILED
// main→renderer: SEARCH_SHORTCUT, ONLINE_STATUS

SELECTORS; // GogChat DOM selectors — FRAGILE, may break on Google HTML changes
// CHAT_GROUP, SPACES_GROUP, UNREAD_HEADING, SEARCH_INPUT,
// FAVICON_ICON, FAVICON_SHORTCUT

WHITELISTED_HOSTS; // accounts.google.com, accounts.youtube.com, chat.google.com, mail.google.com

RATE_LIMITS; // IPC_DEFAULT=10/s, IPC_UNREAD_COUNT=5/s, IPC_FAVICON=5/s

TIMING; // WINDOW_STATE_SAVE=500ms, CONNECTIVITY_CHECK=5000ms,
// EXTERNAL_LINKS_REGUARD=5min

BADGE; // MAX_COUNT=9999, CACHE_LIMIT=99

FAVICON_PATTERNS; // Regex: NORMAL, BADGE — detect GogChat state from favicon URL

DEEP_LINK;       // gogchat:// protocol config, allowed path prefixes
URL_PATTERNS;    // GMAIL_PREFIX, CHAT_PREFIX, DOWNLOAD patterns
```

## KEY EXPORTS FROM `types.ts`

```typescript
GogChatBridgeAPI; // window.GogChat interface — source of truth for preload API
StoreType; // electron-store schema — { window: WindowState, app: AppConfig }
AppConfig; // autoCheckForUpdates, autoLaunchAtLogin, startHidden,
// hideMenuBar, disableSpellChecker, suppressPasskeyDialog
WindowState / Bounds; // bounds: {x,y,width,height}, isMaximized
IconType; // 'offline' | 'normal' | 'badge'
PasskeyFailureData; // { errorType, timestamp }
FaviconData; // { href, type: IconType, timestamp }
UnreadCountData; // { count, timestamp }
AccountWindowState; // Per-account window state for multi-account BrowserWindows
AccountWindowsMap;  // Maps account index → AccountWindowState
IPCResponse<T>;     // Discriminated union for IPC replies
IPCChannelPayloadMap; // Maps IPC channel string → payload type
Branded<T, Brand>;  // Nominal typing — prevents mixing structurally-identical types
ValidatedURL;       // URL validated by validateExternalURL/validateFaviconURL
StoreMetadata;      // Cache versioning for store invalidation
```

## KEY EXPORTS FROM `validators.ts`

| Function                        | Guards Against                                           |
| ------------------------------- | -------------------------------------------------------- |
| `validateUnreadCount(v)`        | NaN, negative, overflow (max 9999), non-numeric          |
| `validateFaviconURL(v)`         | Non-string, >2048 chars, non-http/https/data protocols   |
| `validateExternalURL(v)`        | javascript:, file:, data:, vbscript:, credentials in URL |
| `isWhitelistedHost(url, host)`  | Navigation outside WHITELISTED_HOSTS                     |
| `validateBoolean(v)`            | Accepts true/false, "true"/"false", 1/0                  |
| `validateString(v, maxLen)`     | Type check + length limit (default 1000)                 |
| `isSafeObject(v)`               | Prevents prototype pollution — checks plain object only  |
| `sanitizeHTML(html)`            | XSS — escapes &, <, >, ", ', /                           |
| `validatePasskeyFailureData(v)` | Whitelist of known WebAuthn error types          |
| `isAuthenticatedChatUrl(v)` | Non-auth URLs, wrong protocol, no /u/N path         |
| `isGoogleAuthUrl(v)`        | Non-HTTPS, subdomains, wrong hostname              |
| `validateDeepLinkURL(v)`    | Invalid protocol, path not in ALLOWED_PATH_PREFIXES |
| `validateNotificationData(v)` | title>500, body>5000, invalid icon URL            |
| `validateAppleSystemPreferencesURL(v)` | Non-exact match (whitelist-only)        |

## WORKFLOW: ADDING NEW IPC CHANNEL

1. `constants.ts` — add to `IPC_CHANNELS`
2. `types.ts` — add data interface (e.g. `NewFeatureData`)
3. `validators.ts` — add `validateNewFeatureData()` using `isSafeObject` + existing validators
4. Preload: `ipcRenderer.send(IPC_CHANNELS.NEW_FEATURE, data)` + expose on `GogChatBridgeAPI`
5. Main: `ipcMain.on(IPC_CHANNELS.NEW_FEATURE, (_, raw) => { validate → handle → catch })`

## WORKFLOW: ADDING CONFIG FIELD

1. Add to `AppConfig` in `types.ts`
2. Add default value + schema in `src/main/config.ts`
3. Add IPC handler in relevant feature (with validation)

## SELECTORS ARE FRAGILE

`SELECTORS` keys map to GogChat's live DOM. If unread count or favicon monitoring breaks, these are the first suspects. Check GogChat HTML for current `data-tooltip`, `role`, `name` attributes.

## ANTI-PATTERNS

- **NEVER** hardcode IPC channel strings — use `IPC_CHANNELS`
- **NEVER** skip validators in IPC handlers — all untrusted input
- **NEVER** add types without validators — pair always
- **NEVER** use `as any` in validators — type safety is the point
- **NEVER** use `isSafeObject` result without TypeScript type assertion — it's a type guard
