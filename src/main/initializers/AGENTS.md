# src/main/initializers/ — App Lifecycle Initializers

**Generated:** 2026-03-30

Extracted from `index.ts` to keep the app entry point a thin orchestrator. Two modules that handle the two most complex concerns in `index.ts`: feature registration and graceful shutdown.

## FILES

| File                        | Lines | Purpose                                                              |
| --------------------------- | ----- | -------------------------------------------------------------------- |
| `registerFeatures.ts`      | 36    | Entry point — delegates to sub-initializers                           |
| `registerSecurityFeatures.ts` | 43  | Security phase features (before app.ready)                          |
| `registerShutdown.ts`     | 161   | before-quit handler — cleanup, window teardown, cache stats          |
| `registerUIFeatures.ts`   | 68    | UI phase features (inside app.whenReady blocking)                   |
| `registerDeferredFeatures.ts` | 185 | Deferred phase features (setImmediate after window ready)         |
| `featureHelpers.ts`       | 47    | Shared `createFeature()` / `createLazyFeature()` helpers            |
## registerFeatures.ts
## registerFeatures.ts

**Exports**: `registerAllFeatures(featureManager, callbacks)`

**Callbacks** (bridge to `index.ts` module state):

- `setTrayIcon(icon)` — stores tray reference in `index.ts` module scope
- `registerCleanupTask(name, cleanup)` — delegates to `resourceCleanup`

**Feature list**: 21 features across 4 phases. Security (2) → Critical (1) → UI (3) → Deferred (15). See `../features/AGENTS.md` for full inventory.

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
3. `logComprehensiveCacheStatistics()` — icon/config/dedup/rate-limit/feature stats
4. `app.exit()` — allow quit

**Cache statistics logged**: icon cache (size/accesses/hit-rate), config cache (hits/misses/writes), IPC deduplicator (cache hits/misses/dedup rate), rate limiter (channels/blocked/total), feature manager (total/initialized/failed/time).

## ANTI-PATTERNS

- **Never** add feature registrations in `index.ts` — add here via `createLazyFeature()`
- **Never** import feature modules at module level in `registerFeatures.ts` (except security/critical) — use dynamic `import()`
- **Never** reorder shutdown steps — feature cleanup MUST precede window manager destruction
- **Never** access `mainWindow` directly — receive via `callbacks` or `featureManager.getContext()`
- **Never** add inline feature logic — delegate to feature module's default export
