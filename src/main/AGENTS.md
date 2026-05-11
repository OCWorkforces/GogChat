# src/main/ — Main Process

**Generated:** 2026-05-10

Electron main process. Node.js environment with full system access. Owns app lifecycle, BrowserWindow creation, native integrations, encrypted config, and IPC handling. `index.ts` is a thin orchestrator — all feature registration and shutdown logic lives in `initializers/`.

## WHERE TO LOOK

| Task | File | Notes |
| --- | --- | --- |
| App init sequence | `index.ts` | Thin orchestrator, delegates to initializers/ |
| Feature specs (declarative)  | `initializers/{security,ui,deferred}.spec.ts` | `FeatureSpec[]` arrays compiled into `generated/featurePlan.ts` at build time |
| Feature plan codegen         | `../../scripts/featurePlanPlugin.js` | Rsbuild plugin: parses specs, topo-sorts, emits `generated/featurePlan.ts` |
| Feature runtime walker       | `utils/featureRunner.ts` | `runPhase('security'\|'critical'\|'ui'\|'deferred', ctx)` — replaces `featureManager` |
| Feature context store        | `utils/featureContextStore.ts` | Holds live `FeatureContext` for post-init readers |
| WebContentsView backend      | `utils/accountViewManager.ts` | Opt-in alternative to `accountWindowManager`, gated by `app.useWebContentsView` config |
| CDP RUM telemetry            | `features/cdpTelemetry.ts` + `utils/cdpMetrics.ts` | Local Chrome DevTools Protocol metrics; killable via `secureFlags.disableCdpTelemetry` |
| IPC fast path                | `utils/ipcFastPath.ts` | Sync `registerFastHandler` for hot one-way channels (skips Promise allocation) |
| Perf budget gate (CI)        | `../../scripts/check-perf-budget.js` + `../../scripts/headless-startup.js` | Headless run produces `performance-metrics.json` → 9 metrics gated |
| Shutdown handler | `initializers/registerShutdown.ts` | 70 lines; delegates diagnostics + destroyers |
| Shutdown diagnostics | `initializers/shutdownDiagnostics.ts` | Cache stats logging |
| Singleton destroyers | `initializers/singletonDestroyers.ts` | Centralized destroy registry |
| Global cleanups | `initializers/registerGlobalCleanups.ts` | Lazy-required cleanup callbacks |
| Cache warmer | `utils/cacheWarmer.ts` | Icon cache warm orchestration; disjoint warmup sets |
| Multi-account mgr | `utils/accountWindowManager.ts` | Per-account windows + bootstrap |
| Idle session maintenance | `utils/accountSessionMaintenance.ts` | `getAccountActivityTracker()` / `destroyAccountActivityTracker()`; periodic `clearCodeCaches()` on idle accounts |
| BrowserWindow factory | `windowWrapper.ts` | 71 lines; defaults + handlers extracted |
| CSP headers | `utils/cspHeaderHandler.ts` | Strips COEP/COOP for benign hosts |
| Window event logging | `utils/windowEventLogger.ts` | Centralized navigation/load logs |
| Window health | `utils/windowHealthMonitor.ts` | Renderer crash + unresponsive tracking |
| Window defaults | `utils/windowDefaults.ts` | Shared BrowserWindow options |
| Encrypted config | `config.ts` | AES-256-GCM; schema paired with `../shared/types/config.ts`; use `configGet`/`configSet` — never `store.get(...) as T` |
| Secure flags | `utils/secureFlags.ts` | `getDisableCertPinning()`/`setDisableCertPinning()`; safeStorage (macOS Keychain); NOT in electron-store |
| Feature modules | `features/` (27+, incl. `cdpTelemetry`) | See `features/AGENTS.md` |
| Utility modules | `utils/` (~50, incl. `featureRunner`, `featureContextStore`, `accountViewManager`, `ipcFastPath`, `cdpMetrics`) | See `utils/AGENTS.md` |
| Initializer modules | `initializers/` (8 — declarative specs + lifecycle) | See `initializers/AGENTS.md` |

Note: BrowserWindow `webPreferences` uses conditional assignment for `partition` (rather than `partition: partition ?? undefined`) for `exactOptionalPropertyTypes` compatibility.

## INIT ORDER (DO NOT REORDER)

```
BEFORE app.ready:
  setupCertificatePinning()   ← MUST precede any HTTP
  reportExceptions()           ← catches startup panics
  mediaPermissions()            ← macOS camera/mic TCC checks
  enforceSingleInstance()      ← exits if duplicate running
  (no global feature-register call — specs declared in `initializers/*.spec.ts` and compiled by `scripts/featurePlanPlugin.js`)
  setupDeepLinkListener()      ← open-url event (before app.ready)

app.whenReady() — critical + ui phases (blocking):
  initializeErrorHandler()
  Promise.all([registerGlobalCleanups(), security phase])   ← PARALLEL
  Promise.all([critical phase (userAgent), initializeStore()])  ← PARALLEL
  accountWindowManager → session.preconnect('persist:account-0')  ← DNS/TCP/TLS warmup
  createAccountWindow(url, 0) → markAsBootstrap(0)
  featureContextStore.update({ mainWindow, accountWindowManager })
  runPhase('ui', ctx):
    singleInstance → deepLinkHandler

setImmediate() — deferred (non-blocking):
  warmInitialIcons()  ← moved here; 256.png loaded on-demand in windowWrapper
  runPhase('deferred', ctx):
  trayIcon, appMenu, badgeIcons, bootstrapPromotion, windowState, passkeySupport,
  handleNotification, inOnline, externalLinks, closeToTray,
  openAtLogin, appUpdates, contextMenu, firstLaunch,
  enforceMacOSAppLocation, cdpTelemetry
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
- **Never** register features in `index.ts` — add an entry to the relevant `initializers/*.spec.ts`
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

 `mainWindow`: module-level global, set after `windowWrapper()`. Close-to-tray: `window.hide()` (not destroy). `activate` uses `getMostRecentWindow()`. `window-all-closed` → `app.exit()`. Shutdown: `registerShutdownHandler()` → `before-quit` → `event.preventDefault()` → async cleanup → `cleanupAll(ctx)` (await, via `featureRunner`) → `destroyAccountWindowManager()` → `app.exit()`. Multi-account uses per-account `BrowserWindow` instances via `accountWindowManager`, or per-account `WebContentsView` instances via `accountViewManager` when `app.useWebContentsView` is enabled.
 Logger scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.feature('Name')`. Log file: `~/Library/Logs/GogChat/main.log`. **Never log** passwords or credential-bearing URLs.
