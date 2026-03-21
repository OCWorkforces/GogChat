# src/main/features/ — Feature Modules

**Generated:** 2026-03-21

20+ self-contained feature modules. All registered via `featureManager.registerAll()` in `index.ts` with 4-phase lifecycle. Lazy-loaded via dynamic imports — deferred features land in `lib/chunks/`. Supports multi-account sessions via bootstrap window promotion.

## FEATURE CONTRACT

Each feature is registered with `createFeature()` (static import) or `createLazyFeature()` (dynamic import). The init function receives `FeatureContext { mainWindow?, trayIcon?, isFirstLaunch?, isDevelopment? }`. Must wrap body in try-catch.

## PHASES & EXECUTION

| Phase      | Timing                        | Execution      |
| ---------- | ----------------------------- | -------------- |
| `security` | Before `app.whenReady()`      | Sequential     |
| `critical` | Inside `app.whenReady()`      | Sequential     |
| `ui`       | Inside `app.whenReady()`      | Parallel batch |
| `deferred` | `setImmediate()` after window | Parallel batch |

## FEATURE INVENTORY

| File                      | Phase      | Returns | IPC channels                                                                      |
| ------------------------- | ---------- | ------- | --------------------------------------------------------------------------------- |
| `certificatePinning.ts`   | `security` | —       | none (cert-error event)                                                           |
| `reportExceptions.ts`     | `security` | —       | none                                                                              |
| `userAgent.ts`            | `critical` | —       | none                                                                              |
| `singleInstance.ts`       | `ui`       | —       | none (second-instance event); receives `{ accountWindowManager }` context         |
| `deepLinkHandler.ts`      | `ui`       | `cleanupDeepLinkHandler()`, `extractDeepLinkFromArgv()` | none (open-url event); `setupDeepLinkListener()` called manually before app.ready; receives `{ accountWindowManager }` context |
| `bootstrapPromotion.ts`   | `ui`       | cleanup function | none (webContents events: did-navigate, did-create-window)                          |
| `trayIcon.ts`             | `deferred` | `Tray`  | none                                                                              |
| `appMenu.ts`              | `deferred` | —       | `SEARCH_SHORTCUT` (sends)                                                         |
| `badgeIcon.ts`            | `deferred` | —       | `FAVICON_CHANGED`, `UNREAD_COUNT` (listens)                                       |
| `windowState.ts`          | `deferred` | —       | none (throttled writes); uses `accountWindowManager` for per-account state        |
| `passkeySupport.ts`       | `deferred` | —       | `PASSKEY_AUTH_FAILED` (listens, 1/30s)                                           |
| `handleNotification.ts`   | `deferred` | —       | `NOTIFICATION_SHOW` (listens)                                                      |
| `inOnline.ts`             | `deferred` | —       | `CHECK_IF_ONLINE` (listens), `ONLINE_STATUS` (sends)                               |
| `externalLinks.ts`        | `deferred` | —       | none (will-navigate event); routes to per-account windows via `createAccountWindow`; exports `toggleExternalLinksGuard` |
| `closeToTray.ts`          | `deferred` | —       | none                                                                              |
| `openAtLogin.ts`          | `deferred` | —       | none                                                                              |
| `appUpdates.ts`           | `deferred` | —       | none                                                                              |
| `contextMenu.ts`          | `deferred` | —       | none                                                                              |
| `firstLaunch.ts`          | `deferred` | —       | none                                                                              |
| `enforceMacOSAppLocation` | `deferred` | —       | none (from `platform.ts`)                                                         |
| `aboutPanel.ts`           | on-demand  | —       | none (called from appMenu, NOT in featureManager)                                 |

## ADDING A NEW FEATURE

1. Create `myFeature.ts` — export an `init(ctx: FeatureContext): void` function with try-catch
2. Add IPC channel to `../../shared/constants.ts` (if needed)
3. Add validator to `../../shared/validators.ts` (if IPC data)
4. Add to `../../preload/index.ts` (if renderer-side sender needed)
5. Register in `../index.ts` via `createLazyFeature('myFeature', 'deferred', () => import('./features/myFeature.js'))`
6. If config needed: `StoreType` in `../../shared/types.ts` + schema in `../config.ts`

**Security checklist:**

- [ ] IPC handlers: rate limit + validate + try-catch
- [ ] External URLs: `validateExternalURL()` before `shell.openExternal()`
- [ ] No `eval()` or dynamic code execution
- [ ] No hardcoded channel strings (use `IPC_CHANNELS`)

## KEY INTER-FEATURE DEPENDENCIES

- `badgeIcon.ts` depends on `trayIcon` context (declared in featureManager)
- `appMenu.ts` imports `autoLaunch()` from `openAtLogin.ts` directly
- `appMenu.ts` imports `toggleExternalLinksGuard()` from `externalLinks.ts` directly
- `singleInstance.ts` calls `processDeepLink()` from `deepLinkHandler.ts` for second-instance args
- `singleInstance.ts` receives `accountWindowManager` via context for dynamic window lookup
- `deepLinkHandler.ts` receives `accountWindowManager` via context
- `externalLinks.ts` depends on `bootstrapPromotion.ts` (`watchBootstrapAccount`) for bootstrap window tracking
- `externalLinks.ts` depends on `accountWindowManager.ts` (`createAccountWindow`, `markAsBootstrap`) for per-account window creation
- `windowState.ts` depends on `accountWindowManager.ts` (`saveAccountWindowState`) for per-account state persistence
- `aboutPanel.ts` is called imperatively from `appMenu.ts`, not via featureManager

## ANTI-PATTERNS

- **Never** add inline feature logic to `index.ts` — register in featureManager
- **Never** initialize features outside their designated phase
- **Never** skip error handling — feature failure must not crash the app
- **Never** store mutable state in module scope without cleanup registration
- **Never** access `ctx.mainWindow` without null/destroyed check in async callbacks
- **Never** route to an account window that is mid-auth-flow without checking `isGoogleAuthUrl()`
- **`passkeySupport.ts`** is macOS-only — guarded with `process.platform !== 'darwin'`

## DYNAMIC IMPORTS

Deferred features use `createLazyFeature()` → dynamic import → land in `lib/chunks/<hash>.js`. Auto-included in asar — no manual bundler config needed.
