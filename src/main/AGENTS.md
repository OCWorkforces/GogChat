# src/main/ — Main Process

**Generated:** 2026-04-29 · **Commit:** 5fffeb1

Electron main process. Node.js environment with full system access. Owns app lifecycle, BrowserWindow creation, native integrations, encrypted config, and IPC handling. `index.ts` is a thin orchestrator — all feature registration and shutdown logic lives in `initializers/`.

## WHERE TO LOOK

| Task | File | Notes |
| --- | --- | --- |
| App init sequence | `index.ts` | Thin orchestrator, delegates to initializers/ |
| Feature registration | `initializers/registerFeatures.ts` | 21 features with phases + deps |
| Shutdown handler | `initializers/registerShutdown.ts` | 70 lines; delegates diagnostics + destroyers |
| Shutdown diagnostics | `initializers/shutdownDiagnostics.ts` | Cache stats logging |
| Singleton destroyers | `initializers/singletonDestroyers.ts` | Centralized destroy registry |
| Global cleanups | `initializers/registerGlobalCleanups.ts` | Lazy-required cleanup callbacks |
| Cache warmer | `initializers/cacheWarmer.ts` | Icon cache warm orchestration |
| Multi-account mgr | `utils/accountWindowManager.ts` | Per-account windows + bootstrap |
| BrowserWindow factory | `windowWrapper.ts` | 71 lines; defaults + handlers extracted |
| CSP headers | `utils/cspHeaderHandler.ts` | Strips COEP/COOP for benign hosts |
| Window event logging | `utils/windowEventLogger.ts` | Centralized navigation/load logs |
| Window health | `utils/windowHealthMonitor.ts` | Renderer crash + unresponsive tracking |
| Window defaults | `utils/windowDefaults.ts` | Shared BrowserWindow options |
| Encrypted config | `config.ts` | AES-256-GCM; schema paired with `../shared/types/config.ts`; use `configGet`/`configSet` — never `store.get(...) as T` |
| Secure flags | `utils/secureFlags.ts` | `getDisableCertPinning()`/`setDisableCertPinning()`; safeStorage (macOS Keychain); NOT in electron-store |
| Feature modules | `features/` (25+) | See `features/AGENTS.md` |
| Utility modules | `utils/` (39) | See `utils/AGENTS.md` |
| Initializer modules | `initializers/` (13) | See `initializers/AGENTS.md` |

## INIT ORDER (DO NOT REORDER)

```
BEFORE app.ready:
  setupCertificatePinning()   ← MUST precede any HTTP
  reportExceptions()           ← catches startup panics
  mediaPermissions()            ← macOS camera/mic TCC checks
  enforceSingleInstance()      ← exits if duplicate running
  registerAllFeatures(fm, cb)  ← delegates to initializers/registerFeatures.ts
  setupDeepLinkListener()      ← open-url event (before app.ready)

app.whenReady() — critical + ui phases (blocking):
  initializeErrorHandler()
  Promise.all([registerGlobalCleanups(), security phase])   ← PARALLEL
  Promise.all([critical phase (userAgent), initializeStore()])  ← PARALLEL
  accountWindowManager → session.preconnect('persist:account-0')  ← DNS/TCP/TLS warmup
  createAccountWindow(url, 0) → markAsBootstrap(0)
  featureManager.updateContext({ mainWindow, accountWindowManager })
  featureManager.initializePhase('ui'):
    singleInstance → deepLinkHandler → bootstrapPromotion

setImmediate() — deferred (non-blocking):
  warmInitialIcons()  ← moved here; 256.png loaded on-demand in windowWrapper
  featureManager.initializePhase('deferred'):
  trayIcon, appMenu, badgeIcons, windowState, passkeySupport,
  handleNotification, inOnline, externalLinks, closeToTray,
  openAtLogin, appUpdates, contextMenu, firstLaunch,
  enforceMacOSAppLocation
```

**New feature placement rules:**

- Security-critical → `security` phase (before app.ready)
- UI-critical → `critical` or `ui` phase (inside app.whenReady)
- Nice-to-have → `deferred` phase (setImmediate after window ready)
- Multi-account features must use `accountWindowManager` for window creation — never use `BrowserWindow` directly

## IPC HANDLER PATTERN (MANDATORY)

```typescript
ipcMain.on(IPC_CHANNELS.MY_CHANNEL, (event, data) => {
  try {
    if (!rateLimiter.isAllowed(IPC_CHANNELS.MY_CHANNEL)) {
      log.warn('[Feature] Rate limited');
      return;
    }
    const validated = validateMyData(data);  // from shared/dataValidators.ts or shared/urlValidators.ts
    handleData(validated);
  } catch (error) {
    log.error('[Feature] Failed:', error);
  }
});
```

All 5 pieces required: channel constant, rate limit, validator, handler, catch.

## CONFIG ACCESS

Config uses `configGet<K>()` / `configSet<K,V>()` typed helpers from `config.ts` — do not call `store.get(...) as T` directly.
Kill switch: `getDisableCertPinning()` from `utils/secureFlags.ts` — stored in safeStorage (macOS Keychain), NOT in electron-store.

```typescript
import { configGet, configSet } from './config';
const val = configGet('app.autoCheckForUpdates'); // boolean | undefined
configSet('app.startHidden', true);
```

To add setting: (1) `StoreType` in `../shared/types/config.ts` → (2) schema entry in `config.ts`.
Common keys: `app.*`, `accountWindows` (type `AccountWindowsMap`), `features.*`, `window.*`.

## ANTI-PATTERNS

- **Never** add inline feature logic to `index.ts` — put in `features/`
- **Never** register features in `index.ts` — use `initializers/registerFeatures.ts`
- **Never** skip rate limiting on any `ipcMain.on`
- **Never** skip input validation before using IPC data
- **Never** access `mainWindow` without null-check (`mainWindow?.webContents`)
- **Never** move certificate pinning after app.ready
- **Never** modify window security settings (contextIsolation, sandbox, nodeIntegration)
- **Never** destroy a window without unregistering from `accountWindowManager`
- **Never** interrupt a bootstrap window mid-auth-flow with `loadURL` — check `isGoogleAuthUrl()` first
- **Never** import from other features directly — use `menuActionRegistry`
- **Never** create barrel/re-export files — import directly from source modules (no `ipc.ts`, no `index.ts` re-exports)
- **Never** import validators from `shared/validators.ts` — split into `shared/dataValidators.ts` + `shared/urlValidators.ts`

## WINDOW LIFECYCLE & LOGGING

 `mainWindow`: module-level global, set after `windowWrapper()`. Close-to-tray: `window.hide()` (not destroy). `activate` uses `getMostRecentWindow()`. `window-all-closed` → `app.exit()`. Shutdown: `registerShutdownHandler()` → `before-quit` → `event.preventDefault()` → async cleanup → `featureManager.cleanup()` (await) → `destroyAccountWindowManager()` → `app.exit()`. Multi-account uses per-account `BrowserWindow` instances via `accountWindowManager`.
 Logger scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.feature('Name')`. Log file: `~/Library/Logs/GogChat/main.log`. **Never log** passwords or credential-bearing URLs.
