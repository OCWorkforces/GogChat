# src/preload/ — Preload Scripts

**Generated:** 2026-04-24 | **Commit:** 2275f2a

Bridge between Electron main process and GogChat renderer. 8 scripts compiled as **CJS** (required, `sandbox: true` blocks ESM). All loaded via `index.ts` except `overrideNotifications.ts`.

## SCRIPTS

| File                       | Purpose                                                    | Direction     |
| -------------------------- | ---------------------------------------------------------- | ------------- |
| `index.ts`                 | `contextBridge` → `window.gogchat` API                     | —             |
| `disableWebAuthn.ts`       | Disables `navigator.credentials` via property override     | —             |
| `faviconChanged.ts`        | MutationObserver on `link[rel*=icon]` → favicon changes    | renderer→main |
| `unreadCount.ts`           | MutationObserver + debounce on unread count element        | renderer→main |
| `passkeyMonitor.ts`        | Wraps `navigator.credentials.*`; reports WebAuthn failures | renderer→main |
| `searchShortcut.ts`        | Cmd+K focus handler on search input                        | main→renderer |
| `offline.ts`               | Online/offline bridge; redirect on reconnect               | bidirectional |
| `overrideNotifications.ts` | Separate preload (`contextIsolation:false`); click handler | renderer→main |

## WINDOW.gogchat API (`GogChatBridgeAPI`)

Defined in `../shared/types/bridge.ts`. Renderer→main (5): `sendUnreadCount`, `sendFaviconChanged`, `sendNotificationClicked`, `checkIfOnline`, `reportPasskeyFailure`. Main→renderer (2): `onSearchShortcut`, `onOnlineStatus` (both return unsubscribe fn). All outgoing data validated via `../shared/dataValidators.ts` and `../shared/urlValidators.ts`. No re-exports, all imports direct to source modules.

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
4. If exposing to renderer, extend `GogChatBridgeAPI` in `../shared/types/bridge.ts`

## ANTI-PATTERNS

- **NEVER** import `overrideNotifications.ts` from `index.ts` — wrong context
- **NEVER** poll with `setInterval` — use MutationObserver
- **NEVER** skip cleanup on `beforeunload` — memory leak
- **NEVER** bypass validators before `ipcRenderer.send`
- **NEVER** change preload build to ESM — `sandbox: true` requires CJS
