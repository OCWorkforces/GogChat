# Preload Guide

**Parent:** `../AGENTS.md`

The preload is sandboxed and built as CommonJS because Electron sandboxed preloads cannot load ESM. It exposes a narrow, validated bridge to Google Chat pages.

## Build/runtime constraints

- Keep preload output CJS and imports compatible with `.js` paths.
- Do not remove the preload build `cleanDistPath: false` behavior; main and preload builds share output.
- No Node/config access from preload. Use IPC.
- No raw `ipcRenderer` exposure through `contextBridge`.
- Bare debounce timers are acceptable here; main-process tracked timer helpers are unavailable in the sandbox.

## Bridge surface

`GogChatBridgeAPI` exposes send methods for unread count, favicon changes, notification clicks, online checks, and passkey auth failures, plus subscriptions for search shortcut and online status.

- Validate outgoing data before `ipcRenderer.send`.
- Return unsubscribe functions for subscriptions.
- Do not expose generic invoke/send helpers.

## DOM behavior

- DOM observation uses `MutationObserver`.
- `disableWebAuthn.ts` must be imported first in `src/preload/index.ts`, before any other preload module, to neutralize `navigator.credentials` before Google scripts run.
- Keep selectors and timing constants in shared constants where practical.

## Notification override

- `overrideNotifications.ts` is an intentional separate preload with `contextIsolation: false`.
- Do not import it from `index.ts`.
- `newNotify` must remain an ES5-style function, not an arrow, because it emulates the Notification constructor.
- It uses `asUnsafe` only with documented runtime checks and validates notification data before handoff.

## Tests

Keep coverage around `index.test.ts`, unread count, favicon changes, notification overrides, passkey monitoring, and WebAuthn disabling when touching preload behavior.
