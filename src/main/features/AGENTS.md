# src/main/features/ — Feature Modules

**Generated:** 2026-04-30 (commit 315722d)

25+ self-contained feature modules. All registered via `registerAllFeatures()` in `initializers/registerFeatures.ts` with 4-phase lifecycle. Lazy-loaded via dynamic imports, deferred features land in `lib/chunks/`. Supports multi-account via bootstrap window promotion. No re-exports anywhere; imports go to source modules directly.

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
| `certificatePinning.ts` | `security` | none (cert-error event); in-memory validation cache keyed by `hostname:fingerprint` (H3) |
| `reportExceptions.ts`   | `security` | none                                                   |
| `mediaPermissions.ts`   | `security` | none; macOS camera/mic TCC permissions                 |
| `userAgent.ts`          | `critical` | none                                                   |
| `singleInstance.ts`     | `ui`       | none; receives `{ accountWindowManager }` context      |
| `deepLinkHandler.ts`    | `ui`       | none; receives `{ accountWindowManager }` context      |
| `bootstrapPromotion.ts` | `deferred` | none (webContents events); moved from ui phase |
| `trayIcon.ts`           | `deferred` | none; exports `setTrayUnread()` for badgeHandlers to toggle tray unread dot |
| `appMenu.ts`            | `deferred` | `SEARCH_SHORTCUT` (sends); uses `menuActionRegistry`, `helpMenuBuilder` |
| `helpMenuBuilder.ts`    | `deferred` | none; builds Help submenu (relaunch/reset); used by appMenu |
| `badgeIcon.ts`          | `deferred` | none; delegates to `badgeHandlers`                     |
| `badgeHandlers.ts`      | `deferred` | `FAVICON_CHANGED`, `UNREAD_COUNT` (listens); decideIcon + updateBadgeIcon + calls `setTrayUnread`; both handlers use `withDeduplication` (H2) |
| `windowState.ts`        | `deferred` | none; uses `accountWindowManager`                      |
| `passkeySupport.ts`     | `deferred` | `PASSKEY_AUTH_FAILED` (listens, 1/30s)                 |
| `handleNotification.ts` | `deferred` | `NOTIFICATION_SHOW` (listens)                          |
| `inOnline.ts`           | `deferred` | `CHECK_IF_ONLINE` (deduplicate: true), `ONLINE_STATUS`     |
| `externalLinks.ts`      | `deferred` | none (will-navigate); self-registers toggle guard in `menuActionRegistry` |
| `closeToTray.ts`        | `deferred` | none                                                   |
| `openAtLogin.ts`        | `deferred` | none; self-registers `autoLaunch` in `menuActionRegistry` |
| `appUpdates.ts`         | `deferred` | none                                                   |
| `contextMenu.ts`        | `deferred` | none (cleanup via `registerCleanupTask`)               |
| `firstLaunch.ts`        | `deferred` | none                                                   |
| `aboutPanel.ts`         | on-demand  | none; self-registers in `menuActionRegistry`, called from appMenu |
| `menuActionRegistry.ts` | utility    | none; registry for feature-provided menu actions (moved from utils/) |
| `deepLinkUtils.ts`      | utility    | none; deep link URL extraction from argv (moved from utils/)        |

## MENU ACTION REGISTRY

Features that expose actions consumed by `appMenu.ts` must self-register via `registerMenuAction<K>(id, { label, handler })` from `./menuActionRegistry.ts`. The registry is fully typed — `MenuActionMap` maps each `MenuActionId` to its exact handler signature. **Never** import from other features directly — use the registry.

- Registered actions: `aboutPanel` (aboutPanel.ts), `autoLaunch` (openAtLogin.ts), `toggleExternalLinksGuard` (externalLinks.ts), `processDeepLink` (deepLinkHandler.ts).

**Self-registration timing**: `registerMenuAction()` is called at module load time (import-time side effect), NOT inside the feature's `init()` function. `singleInstance.ts` calls `getMenuAction('processDeepLink')` at runtime inside the `second-instance` event handler.

**bootstrapPromotion re-exports pattern**: `bootstrapPromotion.ts` re-exports `watchBootstrapAccount` and `cleanupBootstrapPromotion` from `../utils/bootstrapWatcher.ts` to preserve the existing public API — do not refactor this into direct imports downstream.

## ADDING A NEW FEATURE

1. Create `myFeature.ts` — export `init(ctx: FeatureContext): void` with try-catch
2. Add IPC channel to `../../shared/constants.ts` (if needed)
3. Add validator to `../../shared/dataValidators.ts` or `../../shared/urlValidators.ts` (if IPC data)
4. Add to `../../preload/index.ts` (if renderer-side sender needed)
5. Register in `../initializers/registerFeatures.ts` via `createLazyFeature('myFeature', 'deferred', () => import('../features/myFeature.js'))`
6. If consumed by appMenu: `registerMenuAction('myAction', { label, handler })` in your feature file
7. If config needed: `StoreType` in `../../shared/types/config.ts` + schema in `../config.ts`; access via `configGet`/`configSet`

## KEY DEPENDENCIES

- `badgeIcons` → `trayIcon` | `appMenu` → `openAtLogin`, `externalLinks` (via registry)
- `windowState` → `singleInstance`, `deepLinkHandler`, `bootstrapPromotion`
- `externalLinks` → `bootstrapPromotion`, `accountWindowManager`
- `closeToTray` → `trayIcon` | `singleInstance` → `deepLinkHandler`

## ANTI-PATTERNS

- **Never** add inline feature logic to `index.ts` — register in featureManager
- **Never** register features in `index.ts` — use `initializers/registerFeatures.ts`
- **Never** initialize features outside their designated phase
- **Never** skip error handling — feature failure must not crash the app
- **Never** store mutable state in module scope without cleanup registration (exception: `closeToTray`, `trayIcon`, `externalLinks`, `openAtLogin` use module-level state with explicit cleanup — intentional where singleton-per-feature is required)
- **Never** perform menu action self-registration inside the `init()` function — `registerMenuAction()` calls happen at module load time (import-time side effect)
- **Never** access `ctx.mainWindow` without null/destroyed check in async callbacks
- **Never** route to an account window mid-auth-flow without checking `isGoogleAuthUrl()`
- **Never** skip dependency declarations in `registerAllFeatures()`
- **Never** import from other features directly — use `menuActionRegistry`

## DYNAMIC IMPORTS

Deferred features use `createLazyFeature()` → dynamic import → `lib/chunks/<hash>.js`. Auto-included in asar.

## COMPLEXITY RANKING

| File | Lines | Notes |
| --- | --- | --- |
| `appMenu.ts` | 190 | Slim orchestrator; delegates Help to `helpMenuBuilder` |
| `badgeHandlers.ts`      | 119 | Favicon/unread IPC + decideIcon + updateBadgeIcon + tray unread; `withDeduplication` on both channels |
| `helpMenuBuilder.ts` | 136 | Help submenu, relaunchApp, resetAppAndRestart |
| `externalLinks.ts`      | 297 | URL validation, account routing |
| `certificatePinning.ts` | 215 | Cert validation before app.ready; validation cache keyed by `hostname:fingerprint` |
| `deepLinkHandler.ts` | 172 | Protocol registration, deep linking |
| `windowState.ts` | 175 | 3 declared deps (most coupled) |
| `handleNotification.ts` | 154 | Notification show/hide logic |
| `inOnline.ts`           | 149 | Online status monitoring |
| `badgeIcon.ts` | 43 | Thin init; wires `badgeHandlers` |
| `passkeySupport.ts` | 122 | Passkey auth event handling |
| `trayIcon.ts` | 113 | System tray icon + menu + `setTrayUnread()` toggle |
| `appUpdates.ts` | 78 | Auto-update check |
| `openAtLogin.ts` | 74 | Auto-launch self-registers in menuActionRegistry |
| `userAgent.ts` | 71 | Custom user-agent override |
| `reportExceptions.ts` | 68 | Startup error capture |
| `bootstrapPromotion.ts` | 60 | Auth detection, child window handling |
| `closeToTray.ts` | 55 | Hide to tray on window close |
| `singleInstance.ts` | 52 | Single-instance enforcement |
| `aboutPanel.ts` | 51 | About dialog self-registration |
| `firstLaunch.ts` | 44 | First-launch onboarding |
| `mediaPermissions.ts` | 36 | Camera/mic TCC permission check |
| `contextMenu.ts` | 36 | Right-click context menu |
|| `menuActionRegistry.ts` | 64 | Typed `MenuActionMap` registry + `registerMenuAction<K>`/`getMenuAction<K>` generics (moved from utils/) |
| `deepLinkUtils.ts` | 27 | Deep link URL extraction from argv (moved from utils/) |
