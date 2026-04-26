# src/main/initializers/ — App Lifecycle Initializers

**Generated:** 2026-04-26 · **Commit:** 5fbc125

Extracted from `index.ts` to keep the app entry point a thin orchestrator. Feature registration is split into specialized sub-modules by concern. Shutdown handled separately.

## FILES

| File                                  | Lines | Purpose                                                    |
| ------------------------------------- | ----- | ---------------------------------------------------------- |
| `registerFeatures.ts`                 | 36    | Entry point, delegates to sub-initializers                 |
| `registerSecurityFeatures.ts`         | 43    | Security phase features (before app.ready)                 |
| `registerUIFeatures.ts`               | 68    | UI phase features (inside app.whenReady blocking)          |
| `registerDeferredFeatures.ts`         | 28    | Deferred dispatcher, delegates to 3 specialized modules    |
| `registerDeferredSystemFeatures.ts`   | 113   | System: tray, badges, window state, auto-launch            |
| `registerDeferredWindowFeatures.ts`   | 70    | Window: menus, notifications, links, context menu          |
| `registerDeferredNetworkFeatures.ts`  | 45    | Network: connectivity monitoring                           |
| `featureHelpers.ts`                   | 47    | `createMainWindowFeature()` helper                         |
| `registerAppReady.ts`                 | 128   | app.whenReady orchestration (was 223)                      |
| `registerGlobalCleanups.ts`           | 39    | Lazy-required cleanup callback registration                |
| `registerShutdown.ts`                 | 70    | before-quit handler, delegates diagnostics + destroyers    |
| `shutdownDiagnostics.ts`              | 115   | Cache statistics logging                                   |
| `singletonDestroyers.ts`              | 29    | Aggregated singleton destroy calls                         |

## registerFeatures.ts

**Exports**: `registerAllFeatures(featureManager, callbacks)`

**Callbacks** (bridge to `index.ts` module state):

- `setTrayIcon(icon)` — stores tray reference in `index.ts` module scope
- `registerCleanupTask(name, cleanup)` — delegates to `resourceCleanup`

**Feature list**: 22 features across 4 phases. Security (3) → Critical (1) → UI (3) → Deferred (15). See `../features/AGENTS.md` for full inventory.

**Deferred registration split into 3 specialized modules:**
- `registerDeferredSystemFeatures.ts` — tray, badges, window state, auto-launch, updates, firstLaunch, enforceMacOSAppLocation
- `registerDeferredWindowFeatures.ts` — appMenu, passkey, notifications, externalLinks, closeToTray, contextMenu
- `registerDeferredNetworkFeatures.ts` — inOnline connectivity monitoring

`featureHelpers.ts` provides `createMainWindowFeature()` to eliminate repeated `createLazyFeature` boilerplate for simple mainWindow-scoped features.

**Dependency chain** (topological order resolved by featureManager):

```
trayIcon → badgeIcons, closeToTray
bootstrapPromotion → externalLinks, windowState
singleInstance, deepLinkHandler, bootstrapPromotion → windowState
openAtLogin, externalLinks → appMenu
```

**Pattern**: Synchronous features use `createFeature()`. Lazy-loaded features use `createLazyFeature()` with dynamic `import()`. Both receive `FeatureContext` on init.

## registerShutdown.ts

**Exports**: `registerShutdownHandler({ featureManager })`

**Cleanup order**:

1. `featureManager.cleanup()` — reverse init order
2. `destroyAccountWindowManager()` — after features
3. `runShutdownDiagnostics()` — delegates to `shutdownDiagnostics.ts`
4. `destroyAllSingletons()` — perfMonitor → deduplicator → rateLimiter → iconCache (via `singletonDestroyers.ts`)
5. `app.exit()` — allow quit

**Cache statistics** (logged from `shutdownDiagnostics.ts`): icon cache, config cache, IPC deduplicator, rate limiter, feature manager.

## ANTI-PATTERNS

- **Never** add feature registrations in `index.ts` — add here via `createLazyFeature()`
- **Never** import feature modules at module level in `registerFeatures.ts` (except security/critical) — use dynamic `import()`
- **Never** reorder shutdown steps — feature cleanup MUST precede window manager destruction
- **Never** access `mainWindow` directly — receive via `callbacks` or `featureManager.getContext()`
- **Never** add inline feature logic — delegate to feature module's default export
