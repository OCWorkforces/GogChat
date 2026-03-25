# src/main/features/ — Feature Modules

**Generated:** 2026-03-25

20 self-contained feature modules. All registered via `featureManager.registerAll()` in `index.ts` with 4-phase lifecycle. Lazy-loaded via dynamic imports — deferred features land in `lib/chunks/`. Supports multi-account sessions via bootstrap window promotion.

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
| `externalLinks.ts`        | `deferred` | —       | none (will-navigate event); routes to per-account windows via `createAccountWindow`; uses `validateExternalURL()` for all external links; exports `toggleExternalLinksGuard` |
| `closeToTray.ts`          | `deferred` | —       | none                                                                              |
| `openAtLogin.ts`          | `deferred` | —       | none                                                                              |
| `appUpdates.ts`           | `deferred` | —       | none                                                                              |
| `contextMenu.ts`           | `deferred` | —       | none (cleanup registered via `registerCleanupTask`)                               |
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

- `badgeIcons.ts` depends on `trayIcon` (declared in featureManager)
- `appMenu.ts` depends on `openAtLogin`, `externalLinks` (declared in featureManager)
- `windowState.ts` depends on `singleInstance`, `deepLinkHandler`, `bootstrapPromotion` (declared in featureManager)
- `externalLinks.ts` depends on `bootstrapPromotion` (declared in featureManager)
- `closeToTray.ts` depends on `trayIcon` (declared in featureManager)
- `singleInstance.ts` calls `processDeepLink()` from `deepLinkHandler.ts` for second-instance args
- `singleInstance.ts` receives `accountWindowManager` via context for dynamic window lookup
- `deepLinkHandler.ts` receives `accountWindowManager` via context
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
- **Never** skip dependency declarations in `featureManager.registerAll()` — undeclared deps may init before prerequisite
- **`passkeySupport.ts`** is macOS-only — guarded with `process.platform !== 'darwin'`

## DYNAMIC IMPORTS
Deferred features use `createLazyFeature()` → dynamic import → land in `lib/chunks/<hash>.js`. Auto-included in asar — no manual bundler config needed.
## COMPLEXITY RANKING

| File                    | Lines | Phase      | Notes                                       |
| ----------------------- | ----- | ---------- | ------------------------------------------- |
| `appMenu.ts`             | 294   | `deferred` | 2 declared deps + 3 direct imports         |
| `externalLinks.ts`       | 288   | `deferred` | URL validation, account routing             |
| `bootstrapPromotion.ts`  | 249   | `ui`       | Auth detection, child window handling       |
| `certificatePinning.ts`  | 187   | `security` | Cert validation before app.ready             |
| `deepLinkHandler.ts`     | 182   | `ui`       | Protocol registration, deep linking         |
| `windowState.ts`         | 175   | `deferred` | 3 declared deps (most coupled feature)      |
| `handleNotification.ts`  | 154   | `deferred` | Notification creation, auto-dismiss          |
| `inOnline.ts`            | 154   | `deferred` | Connectivity checks, offline page loading    |
| `badgeIcon.ts`           | 141   | `deferred` | IPC + deduplication + icon caching           |
| `passkeySupport.ts`      | 122   | `deferred` | macOS-only (guarded by `process.platform`)  |
| `trayIcon.ts`            |  90   | `deferred` | —                                           |
| `contextMenu.ts`         |   8   | `deferred` | Minimal — cleanup via `registerCleanupTask` |
| `firstLaunch.ts`         |   9   | `deferred` | Minimal                                     |
| `userAgent.ts`           |  15   | `critical` | Minimal                                     |
| `openAtLogin.ts`         |  45   | `deferred` | —                                           |
| `closeToTray.ts`         |  55   | `deferred` | —                                           |
| `aboutPanel.ts`          |  47   | on-demand  | Called imperatively from appMenu             |
| `appUpdates.ts`          |  34   | `deferred` | —                                           |
| `reportExceptions.ts`    |  18   | `security` | Minimal                                     |
| `singleInstance.ts`      |  39   | `ui`       | Imports from deepLinkHandler directly       |

