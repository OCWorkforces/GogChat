# src/preload/ — Preload Scripts

**Generated:** 2026-03-25
## OVERVIEW

Bridge between Electron main process and GogChat renderer. 8 scripts compiled as **CJS** (required — `sandbox: true` blocks ESM). All loaded via `index.ts` as single bundle; `overrideNotifications.ts` is the sole exception.

## SCRIPTS

| File                       | Purpose                                                    | Direction     |
| -------------------------- | ---------------------------------------------------------- | ------------- |
| `index.ts`                 | `contextBridge` → `window.GogChat` API                       | —             |
| `faviconChanged.ts`        | MutationObserver on `<head>` → favicon changes             | renderer→main |
| `unreadCount.ts`           | MutationObserver on `document.body` → DOM badge            | renderer→main |
| `offline.ts`               | Online/offline bridge; redirect on reconnect               | bidirectional |
| `passkeyMonitor.ts`        | Wraps `navigator.credentials.*`; reports WebAuthn failures | renderer→main |
| `searchShortcut.ts`        | Focuses `input[name="q"]` on IPC trigger                   | main→renderer |
| `overrideNotifications.ts` | Intercepts `window.Notification`; adds click handler       | renderer→main |
| `disableWebAuthn.ts`       | Disables WebAuthn per config                               | —             |

## WINDOW.GogChat API (`GogChatBridgeAPI`)

Defined in `../shared/types.ts`. Source of truth — update types first, then implement here.

```
renderer → main:   sendUnreadCount, sendFaviconChanged, sendNotificationClicked,
                   checkIfOnline, reportPasskeyFailure
main → renderer:   onSearchShortcut (returns cleanup fn), onOnlineStatus (returns cleanup fn)
```

All methods validate input via `../shared/validators.ts` before sending.

## CRITICAL: `overrideNotifications.ts`

- Loaded **separately** via `webPreferences.additionalPreloadScripts` with `contextIsolation: false`
- **NEVER** import in `index.ts` — it must load in a different context
- Only exception to `contextIsolation: true` rule — minimal attack surface (Notification API only)

## DOM OBSERVATION PATTERN

All DOM monitoring uses `MutationObserver` — no polling. Pattern:

```typescript
let observer: MutationObserver | null = null;

const cleanup = () => {
  observer?.disconnect();
  observer = null;
};

window.addEventListener('DOMContentLoaded', () => {
  observer = new MutationObserver(() => processChanges());
  observer.observe(target, { childList: true, subtree: true });
});
window.addEventListener('beforeunload', cleanup);
```

- `faviconChanged.ts`: observes `<head>`, childList + attributes
- `unreadCount.ts`: observes `document.body`, childList + subtree + characterData

## OFFLINE FLOW

```
offline.html button → window.dispatchEvent('app:checkIfOnline')
  → offline.ts → ipcRenderer.send('checkIfOnline')
  → main checks net → ipcRenderer.on('onlineStatus', online)
  → online=true → window.location = GogChat_URL
  → online=false → location.reload()
```

Offline page uses `window.dispatchEvent` (no direct IPC access from offline.html).

## ADDING A NEW PRELOAD SCRIPT

1. Create `newFeature.ts` in this directory
2. Use `ipcRenderer` (not `contextBridge`) for IPC — contextBridge only in `index.ts`
3. Add `import './newFeature.js'` to `index.ts` (`.js` extension — built CJS)
4. Add IPC channel to `../shared/constants.ts` `IPC_CHANNELS`
5. If exposing to renderer, extend `GogChatBridgeAPI` in `../shared/types.ts`

## IPC CHANNEL NAMES

All channel names live in `../shared/constants.ts`. **Never hardcode strings.**

## ANTI-PATTERNS

- **NEVER** import `overrideNotifications.ts` from `index.ts` — wrong context
- **NEVER** poll with `setInterval` — use MutationObserver
- **NEVER** skip cleanup on `beforeunload` — memory leak
- **NEVER** bypass validators before `ipcRenderer.send` — security boundary
- **NEVER** change preload build to ESM — `sandbox: true` requires CJS
