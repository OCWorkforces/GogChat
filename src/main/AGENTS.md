# src/main/ — Main Process

**Generated:** 2026-03-30

Electron main process. Node.js environment with full system access. Owns app lifecycle, BrowserWindow creation, native integrations, encrypted config, and IPC handling. `index.ts` is a thin orchestrator — all feature registration and shutdown logic lives in `initializers/`.

## WHERE TO LOOK

| Task | File | Notes |
| --- | --- | --- |
| App init sequence | `index.ts` | Thin orchestrator, delegates to initializers/ |
| Feature registration | `initializers/registerFeatures.ts` | All 21 features with phases + deps |
| Shutdown handler | `initializers/registerShutdown.ts` | Graceful cleanup + cache stats |
| Multi-account mgr | `utils/accountWindowManager.ts` | Per-account windows + bootstrap |
| BrowserWindow creation | `windowWrapper.ts` | Per-account factory with partition support |
| Encrypted config | `config.ts` | AES-256-GCM; schema paired with `../../shared/types.ts` |
| Feature modules | `features/` | See `features/AGENTS.md` |
| Utility modules | `utils/` | See `utils/AGENTS.md` |
| Initializer modules | `initializers/` | See `initializers/AGENTS.md` |

## INIT ORDER (DO NOT REORDER)

```
BEFORE app.ready:
  setupCertificatePinning()   ← MUST precede any HTTP
  reportExceptions()           ← catches startup panics
  enforceSingleInstance()      ← exits if duplicate running
  registerAllFeatures(fm, cb)  ← delegates to initializers/registerFeatures.ts
  setupDeepLinkListener()      ← open-url event (before app.ready)

app.whenReady() — critical + ui phases (blocking):
  initializeErrorHandler()
  registerBuiltInGlobalCleanups()  ← lazy require() for cleanup callbacks
  userAgent override
  windowWrapper() → mainWindow
  featureManager.initializePhase('security') → 'critical'
  initializeStore()              ← re-init for SafeStorage (requires app.ready)
  accountWindowManager → createAccountWindow(url, 0) → markAsBootstrap(0)
  featureManager.updateContext({ mainWindow, accountWindowManager })
  iconCache.warmCache()
  featureManager.initializePhase('ui'):
    singleInstance → deepLinkHandler → bootstrapPromotion

setImmediate() — deferred (non-blocking):
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
    const validated = validateMyData(data);
    handleData(validated);
  } catch (error) {
    log.error('[Feature] Failed:', error);
  }
});
```

All 5 pieces required: channel constant, rate limit, validator, handler, catch.

## CONFIG ACCESS

Config uses SafeStorage-backed encryption keys with legacy deterministic key fallback.
Migration from legacy → SafeStorage happens automatically on first run.
Kill switch: `app.disableCertPinning` config option.

```typescript
import store from './config';
const val = store.get('app.autoCheckForUpdates');
store.set('app.startHidden', true);
```

To add setting: (1) `StoreType` in `../../shared/types.ts` → (2) schema entry in `config.ts`.
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

## WINDOW LIFECYCLE & LOGGING

 `mainWindow`: module-level global, set after `windowWrapper()`. Close-to-tray: `window.hide()` (not destroy). `activate` uses `getMostRecentWindow()`. `window-all-closed` → `app.exit()`. Shutdown: `registerShutdownHandler()` → `before-quit` → `event.preventDefault()` → async cleanup → `featureManager.cleanup()` (await) → `destroyAccountWindowManager()` → `app.exit()`. Multi-account uses per-account `BrowserWindow` instances via `accountWindowManager`.
 Logger scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.feature('Name')`. Log file: `~/Library/Logs/GogChat/main.log`. **Never log** passwords or credential-bearing URLs.
