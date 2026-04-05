# src/preload/ — Preload Scripts

**Generated:** 2026-04-05

Bridge between Electron main process and GogChat renderer. 8 scripts + 1 standalone disableWebAuthn compiled as **CJS** (required — `sandbox: true` blocks ESM). All loaded via `index.ts` except `overrideNotifications.ts`.

## SCRIPTS

| File                       | Purpose                                                    | Direction     |
| -------------------------- | ---------------------------------------------------------- | ------------- |
| `index.ts`                 | `contextBridge` → `window.GogChat` API                     | —             |
| `faviconChanged.ts`        | MutationObserver on `<head>` → favicon changes             | renderer→main |
| `unreadCount.ts`           | MutationObserver on `document.body` → DOM badge            | renderer→main |
| `offline.ts`               | Online/offline bridge; redirect on reconnect               | bidirectional |
| `passkeyMonitor.ts`        | Wraps `navigator.credentials.*`; reports WebAuthn failures | renderer→main |
| `searchShortcut.ts`        | Focuses `input[name="q"]` on IPC trigger                   | main→renderer |
| `overrideNotifications.ts` | Intercepts `window.Notification`; adds click handler       | renderer→main |
| `disableWebAuthn.ts`       | Disables `navigator.credentials` via property override     | —             |

## WINDOW.GogChat API (`GogChatBridgeAPI`)

Defined in `../shared/types.ts`. Renderer→main: `sendUnreadCount`, `sendFaviconChanged`, `sendNotificationClicked`, `checkIfOnline`, `reportPasskeyFailure`. Main→renderer: `onSearchShortcut`, `onOnlineStatus` (both return cleanup fn). All methods validate via `../shared/validators.ts`.

## CRITICAL: `overrideNotifications.ts`

Loaded **separately** via `webPreferences.additionalPreloadScripts` with `contextIsolation: false`. **NEVER** import in `index.ts` — must load in different context. Only exception to `contextIsolation: true`.

## CRITICAL: `disableWebAuthn.ts`

Sets `navigator.credentials = undefined` via `Object.defineProperty` to prevent WebAuthn/U2F auth issues in Google Chat. Side-effect module — imported in `index.ts`. Logs success or warning if property is non-configurable. Tested with jsdom (`disableWebAuthn.test.ts`).

## DOM OBSERVATION

All DOM monitoring uses `MutationObserver` — no polling. `faviconChanged`: observes `<head>`, childList + attributes. `unreadCount`: observes `document.body`, childList + subtree + characterData. Always clean up on `beforeunload`.

## ADDING NEW PRELOAD SCRIPT

1. Create `newFeature.ts` — use `ipcRenderer` (not `contextBridge`)
2. Add `import './newFeature.js'` to `index.ts` (`.js` extension — built CJS)
3. Add IPC channel to `../shared/constants.ts`
4. If exposing to renderer, extend `GogChatBridgeAPI` in `../shared/types.ts`

## ANTI-PATTERNS

- **NEVER** import `overrideNotifications.ts` from `index.ts` — wrong context
- **NEVER** poll with `setInterval` — use MutationObserver
- **NEVER** skip cleanup on `beforeunload` — memory leak
- **NEVER** bypass validators before `ipcRenderer.send`
- **NEVER** change preload build to ESM — `sandbox: true` requires CJS
