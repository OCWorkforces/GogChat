# src/main/features/ — Feature Modules

**Generated:** 2026-02-22

## OVERVIEW

18 self-contained feature modules. Each exports a default function. Some are loaded synchronously in `app.whenReady()`, others deferred via `setImmediate()`. `featureManager.ts` provides an optional structured manager (not yet used in main `index.ts` — migration in progress).

## FEATURE CONTRACT
Export default `(mainWindow: BrowserWindow, tray?: Tray) => void`. Must wrap body in try-catch. Return `void` or an object (e.g. `trayIcon.ts` returns `Tray`). IPC handlers inside: rate limit + validate (see `../AGENTS.md`).

## FEATURE MANAGER (`featureManager.ts`)

Optional structured lifecycle — **not yet wired into `index.ts`** (migration in progress).

Singleton: `getFeatureManager()`. Methods: `register()`, `initializeCritical()`, `initializeDeferred()`, `cleanup()`, `getStatus()`.

Priorities: `CRITICAL=0`, `HIGH=1`, `MEDIUM=2`, `LOW=3`, `DEFERRED=4`. Context carries `mainWindow`, `trayIcon`, `isFirstLaunch`, `isDevelopment`.

## FEATURE INVENTORY

| File                    | Phase        | Returns | IPC channel used               |
| ----------------------- | ------------ | ------- | ------------------------------ |
| `certificatePinning.ts` | BEFORE ready | —       | none (cert-error event)        |
| `reportExceptions.ts`   | BEFORE ready | —       | none                           |
| `singleInstance.ts`     | BEFORE ready | boolean | none                           |
| `userAgent.ts`          | app.ready    | —       | none                           |
| `trayIcon.ts`           | app.ready    | `Tray`  | none                           |
| `appMenu.ts`            | app.ready    | —       | SEARCH_SHORTCUT (send)         |
| `windowState.ts`        | app.ready    | —       | none (throttled writes)        |
| `externalLinks.ts`      | app.ready    | —       | none (will-navigate)           |
| `handleNotification.ts` | app.ready    | —       | NOTIFICATION_CLICKED           |
| `badgeIcon.ts`          | app.ready    | —       | UNREAD_COUNT                   |
| `closeToTray.ts`        | app.ready    | —       | none                           |
| `inOnline.ts`           | app.ready    | —       | CHECK_IF_ONLINE, ONLINE_STATUS |
| `passkeySupport.ts`     | app.ready    | —       | PASSKEY_AUTH_FAILED            |
| `openAtLogin.ts`        | deferred     | —       | none                           |
| `appUpdates.ts`         | deferred     | —       | none                           |
| `contextMenu.ts`        | deferred     | —       | none                           |
| `firstLaunch.ts`        | deferred     | —       | none                           |
| `aboutPanel.ts`         | on-demand    | —       | none (called from menu)        |

## ADDING A NEW FEATURE

1. Create `myFeature.ts` — export default function with try-catch
2. Add IPC channel to `../../shared/constants.ts` (if needed)
3. Add validator to `../../shared/validators.ts` (if IPC data)
4. Add to `../../preload/index.ts` (if renderer-side sender needed)
5. Import + call in `../index.ts` at the correct phase
6. If config needed: `StoreType` in `../../shared/types.ts` + schema in `../config.ts`

**Security checklist:**

- [ ] IPC handlers: rate limit + validate + try-catch
- [ ] External URLs: `validateExternalURL()` before `shell.openExternal()`
- [ ] No `eval()` or dynamic code execution
- [ ] No hardcoded channel strings (use `IPC_CHANNELS`)

## ANTI-PATTERNS

- **Never** initialize features outside their designated phase (order matters)
- **Never** skip error handling — feature failure must not crash the app
- **Never** store mutable state in module scope without cleanup registration
- **Never** access `window` param without null/destroyed check in async callbacks
- **`passkeySupport.ts`** is macOS-only — guard all code with `platform.isMac`

## DYNAMIC IMPORTS
Deferred features land in `lib/chunks/<hash>.js` via dynamic import in `index.ts`. Output auto-included in asar — no manual bundler config needed.
