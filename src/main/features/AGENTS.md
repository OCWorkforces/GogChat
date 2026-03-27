# src/main/features/ — Feature Modules

**Generated:** 2026-03-27

20 self-contained feature modules. All registered via `featureManager.registerAll()` in `index.ts` with 4-phase lifecycle. Lazy-loaded via dynamic imports — deferred features land in `lib/chunks/`. Supports multi-account via bootstrap window promotion.

## FEATURE CONTRACT

Each feature is registered with `createFeature()` (static) or `createLazyFeature()` (dynamic). Init receives `FeatureContext { mainWindow?, trayIcon?, isFirstLaunch?, isDevelopment? }`. Must wrap body in try-catch.

## PHASES

| Phase      | Timing                        | Execution      |
| ---------- | ----------------------------- | -------------- |
| `security` | Before `app.whenReady()`      | Sequential     |
| `critical` | Inside `app.whenReady()`      | Sequential     |
| `ui`       | Inside `app.whenReady()`      | Parallel batch |
| `deferred` | `setImmediate()` after window | Parallel batch |

## FEATURE INVENTORY

| File                    | Phase      | IPC channels                                           |
| ----------------------- | ---------- | ------------------------------------------------------ |
| `certificatePinning.ts` | `security` | none (cert-error event)                                |
| `reportExceptions.ts`   | `security` | none                                                   |
| `userAgent.ts`          | `critical` | none                                                   |
| `singleInstance.ts`     | `ui`       | none; receives `{ accountWindowManager }` context      |
| `deepLinkHandler.ts`    | `ui`       | none; receives `{ accountWindowManager }` context      |
| `bootstrapPromotion.ts` | `ui`       | none (webContents events)                              |
| `trayIcon.ts`           | `deferred` | none                                                   |
| `appMenu.ts`            | `deferred` | `SEARCH_SHORTCUT` (sends)                              |
| `badgeIcon.ts`          | `deferred` | `FAVICON_CHANGED`, `UNREAD_COUNT` (listens)            |
| `windowState.ts`        | `deferred` | none; uses `accountWindowManager`                      |
| `passkeySupport.ts`     | `deferred` | `PASSKEY_AUTH_FAILED` (listens, 1/30s)                 |
| `handleNotification.ts` | `deferred` | `NOTIFICATION_SHOW` (listens)                          |
| `inOnline.ts`           | `deferred` | `CHECK_IF_ONLINE`, `ONLINE_STATUS`                     |
| `externalLinks.ts`      | `deferred` | none (will-navigate); routes via `createAccountWindow` |
| `closeToTray.ts`        | `deferred` | none                                                   |
| `openAtLogin.ts`        | `deferred` | none                                                   |
| `appUpdates.ts`         | `deferred` | none                                                   |
| `contextMenu.ts`        | `deferred` | none (cleanup via `registerCleanupTask`)               |
| `firstLaunch.ts`        | `deferred` | none                                                   |
| `aboutPanel.ts`         | on-demand  | none (called from appMenu, NOT in featureManager)      |

## ADDING A NEW FEATURE

1. Create `myFeature.ts` — export `init(ctx: FeatureContext): void` with try-catch
2. Add IPC channel to `../../shared/constants.ts` (if needed)
3. Add validator to `../../shared/validators.ts` (if IPC data)
4. Add to `../../preload/index.ts` (if renderer-side sender needed)
5. Register in `../index.ts` via `createLazyFeature('myFeature', 'deferred', () => import('./features/myFeature.js'))`
6. If config needed: `StoreType` in `../../shared/types.ts` + schema in `../config.ts`

## KEY DEPENDENCIES

- `badgeIcons` → `trayIcon` | `appMenu` → `openAtLogin`, `externalLinks`
- `windowState` → `singleInstance`, `deepLinkHandler`, `bootstrapPromotion`
- `externalLinks` → `bootstrapPromotion`, `accountWindowManager`
- `closeToTray` → `trayIcon` | `singleInstance` → `deepLinkHandler`

## ANTI-PATTERNS

- **Never** add inline feature logic to `index.ts` — register in featureManager
- **Never** initialize features outside their designated phase
- **Never** skip error handling — feature failure must not crash the app
- **Never** store mutable state in module scope without cleanup registration
- **Never** access `ctx.mainWindow` without null/destroyed check in async callbacks
- **Never** route to an account window mid-auth-flow without checking `isGoogleAuthUrl()`
- **Never** skip dependency declarations in `featureManager.registerAll()`

## DYNAMIC IMPORTS

Deferred features use `createLazyFeature()` → dynamic import → `lib/chunks/<hash>.js`. Auto-included in asar.

## COMPLEXITY RANKING

| File                    | Lines | Notes                                 |
| ----------------------- | ----- | ------------------------------------- |
| `appMenu.ts`            | 294   | 2 declared deps + 3 direct imports    |
| `externalLinks.ts`      | 288   | URL validation, account routing       |
| `bootstrapPromotion.ts` | 249   | Auth detection, child window handling |
| `certificatePinning.ts` | 187   | Cert validation before app.ready      |
| `deepLinkHandler.ts`    | 182   | Protocol registration, deep linking   |
| `windowState.ts`        | 175   | 3 declared deps (most coupled)        |
