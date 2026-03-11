# src/main/ — Main Process

**Generated:** 2026-02-22

## OVERVIEW

Electron main process. Node.js environment with full system access. Owns app lifecycle, BrowserWindow creation, native integrations, encrypted config, and IPC handling.

## WHERE TO LOOK

| Task                   | File               | Notes                                                   |
| ---------------------- | ------------------ | ------------------------------------------------------- |
| App init sequence      | `index.ts`         | Order is security-critical — see init table below       |
| BrowserWindow creation | `windowWrapper.ts` | One window, reused app lifetime                         |
| Encrypted config       | `config.ts`        | AES-256-GCM; schema paired with `../../shared/types.ts` |
| Feature modules        | `features/`        | See `features/AGENTS.md`                                |
| Utility modules        | `utils/`           | See `utils/AGENTS.md`                                   |

## INIT ORDER (DO NOT REORDER)

```
BEFORE app.ready:
  setupCertificatePinning()   ← network cert validation; MUST precede any HTTP
  reportExceptions()           ← catches startup panics
  enforceSingleInstance()      ← exits process if duplicate running

app.whenReady() — critical (blocking):
  userAgent override
  windowWrapper() → mainWindow
  setupOfflineHandlers()
  checkForInternet()
  createTrayIcon()
  setupAppMenu()
  restoreFirstInstance() handler
  setupWindowState()
  setupExternalLinks()
  setupNotifications()
  setupBadgeIcon()
  setupCloseToTray()

setImmediate() — deferred (non-blocking):
  autoLaunch, appUpdates, contextMenu, firstLaunch
```

**New feature placement rules:**

- Security-critical → before/during app.ready
- UI-critical → in app.whenReady() chain
- Nice-to-have → in setImmediate()

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

```typescript
import store from './config';
const val = store.get('app.autoCheckForUpdates');
store.set('app.startHidden', true);
```

To add setting: (1) `StoreType` in `../../shared/types.ts` → (2) schema entry in `config.ts`.

## ANTI-PATTERNS

- **Never** add inline feature logic to `index.ts` — put in `features/`
- **Never** skip rate limiting on any `ipcMain.on`
- **Never** skip input validation before using IPC data
- **Never** access `mainWindow` without null-check (`mainWindow?.webContents`)
- **Never** move certificate pinning after app.ready
- **Never** modify window security settings (contextIsolation, sandbox, nodeIntegration)

## WINDOW LIFECYCLE & LOGGING

 `mainWindow`: module-level global, lives full app lifetime. Close-to-tray: `window.hide()` (not destroy). `activate` restores window. `window-all-closed` → `app.quit()`.
 Logger scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.feature('Name')`. Log file: `~/Library/Logs/GiChat/main.log`. **Never log** passwords or credential-bearing URLs.
