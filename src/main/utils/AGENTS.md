# src/main/utils/ — Main Process Utilities

**Generated:** 2026-04-21 · **Commit:** b12967f

39 utility modules. All singletons follow `getXxx()` / `destroyXxx()`. `resourceCleanup.ts` uses lazy `require()` to avoid coupling. Cleanup callbacks registered via `registerBuiltInGlobalCleanups()` (lives in `../initializers/registerGlobalCleanups.ts`). Singleton destroyers + shutdown diagnostics also live in `../initializers/`.

## MODULE INVENTORY

| File | Lines | Purpose | Singleton |
| --- | --- | --- | --- |
| `featureManager.ts` | 458 | Feature lifecycle + re-exports config types; includes `createFeature`/`createLazyFeature`/`initializeFeature` | `getFeatureManager()` |
| `accountWindowManager.ts` | 437 | Multi-account BrowserWindow mgmt; implements `IAccountWindowManager` | `getAccountWindowManager()` |
| `resourceCleanup.ts` | 372 | Tracked intervals/timeouts/listeners; lazy `require()` only | `getCleanupManager()` |
| `config.ts` (parent) | — | See `../config.ts` | — |
| `performanceMonitor.ts` | 259 | Startup timing + memory snapshots | `getPerformanceMonitor()` |
| `ipcHelper.ts` | 265 | Secure IPC handler factories | `getIPCManager()` |
| `ipcDeduplicator.ts` | 263 | Dedup rapid same-key requests | `getDeduplicator()` |
| `accountWindowRegistry.ts` | 255 | Window registration, lookup, lifecycle | exported fns |
| `errorHandler.ts` | 245 | Structured error wrapping | `getErrorHandler()` |
| `iconCache.ts` | 219 | NativeImage preload cache | `getIconCache()` |
| `bootstrapWatcher.ts` | 205 | Bootstrap window navigation watching | exported fns |
| `rateLimiter.ts` | 199 | IPC DoS prevention | `getRateLimiter()` |
| `configCache.ts` | 179 | In-memory layer for electron-store | `addCacheLayer()` |
| `configSchema.ts` | 159 | electron-store schema | exported const |
| `platformUtils.ts` | 159 | Platform utilities singleton | `getPlatformUtils()` |
| `cacheWarmer.ts` | 157 | Icon cache warm + deferred phase + dev profiling | exported fns |
| `platformHelpers.ts` | 141 | macOS platform helpers (enforceLocation) | exported fns |
| `performanceExport.ts` | 128 | Performance export/log helpers | exported fns |
| `encryptionKey.ts` | 128 | SafeStorage encryption key mgmt | exported fns |
| `mediaAccess.ts` | 123 | macOS camera/mic TCC permissions | exported fns |
| `windowUtils.ts` | 121 | Window events/health/defaults (merged) | exported fns |
| `logger.ts` | 112 | Scoped structured logging | `logger.*` |
| `featureSorter.ts` | 110 | Topological sort for feature deps | exported fns |
| `configProfiler.ts` | 106 | Dev-only store perf profiler | — |
| `featureConfigTypes.ts` | — | Canonical types: `FeaturePriority`, `FeatureContext`, `FeatureConfig`, `FeatureState` (extracted to break cycles) | exported types |
| `performanceTypes.ts` | — | Canonical: `PERFORMANCE_TARGETS`, `MemorySnapshot`, `PerformanceMetrics`, `PerformanceMonitorReader` (extracted to break cycles) | exported types/const |
| `permissionHandler.ts` | 98 | Chromium permission handlers | exported fns |
| `benignLogFilter.ts` | 93 | Filter benign console messages | exported fns |
| `packageInfo.ts` | 78 | package.json singleton | `getPackageInfo()` |
| `cspHeaderHandler.ts` | 78 | Strip COEP/COOP for benign hosts | exported fns |
| `bootstrapTracker.ts` | 74 | Tracks bootstrap window state | exported fns |
| `ipcDeduplicationPatterns.ts` | 70 | `createDeduplicatedHandler`, `withDeduplication` | exported fns |
| `accountRouter.ts` | 65 | Window creation + routing logic | exported fns |
| `platformDetection.ts` | 53 | macOS detection (isMacOS, arch) | exported fns |
| `errorUtils.ts` | 49 | Zero-dep error helpers (breaks cycles) | exported fns |
| `ipcCommonValidators.ts` | 48 | Common IPC validation helpers | exported const |
| `cleanupTypes.ts` | 30 | Shared cleanup types | exported types |

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` — zero static util imports; lazy `require()` via callbacks registered in `../initializers/registerGlobalCleanups.ts`.
`ipcHelper` → `rateLimiter`, `logger`, `errorHandler`. `ipcDeduplicator` → `logger`, `errorHandler`.
`featureManager.ts` re-exports from `featureConfigTypes.ts`. `performanceMonitor.ts` consumes `performanceTypes.ts`. Both extracted to break circular deps (former `featureTypes.ts` deleted; `ipc.ts` barrel deleted).
`errorUtils.ts` — zero util imports. Breaks cycle between `ipcHelper` / `ipcDeduplicator` / `resourceCleanup`.
`cleanupTypes.ts` — extracted from `resourceCleanup.ts` to break circular dep.
`cacheWarmer.ts` → `iconCache`, `performanceMonitor`, `featureManager`, `configProfiler`. Called from `app.whenReady()` orchestration.
`bootstrapTracker.ts` → used by `accountWindowManager.ts`.
`permissionHandler.ts` / `cspHeaderHandler.ts` / `benignLogFilter.ts` / `windowUtils.ts` → used by `windowWrapper.ts`.
`accountWindowManager.ts` implements `IAccountWindowManager` from `shared/types/window.ts`.
Menu action registry + deepLinkUtils live in `../features/`, NOT here.

## KEY PATTERNS

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`. Implements 19-method `IAccountWindowManager` interface.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS`.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `setupWindowCleanup()`, `registerCleanupTask()`, `registerGlobalCleanupCallback()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up.

**Feature creation**: `createFeature()` / `createLazyFeature()` from `featureManager`; types from `featureConfigTypes`.

**Error handler**: `initializeFeature('name', async () => {...}, 'phase')`, `wrapAsync({ feature, operation }, async () => {...})`.

**Cache warmer**: `cacheWarmer.warmAfterReady()` — orchestrates icon warm + deferred phase + dev profiling.

## LOGGER SCOPES

`logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.config`, `logger.window`, `logger.feature('Name')`. Log: `~/Library/Logs/GogChat/main.log`. **Never log** credentials.

## ANTI-PATTERNS

- **Never** call `setInterval`/`setTimeout` without tracked wrappers
- **Never** create IPC handlers without cleanup return value
- **Never** use `electron-log` directly — use `logger.*` scopes
- **Never** read `package.json` with `fs.readFileSync` — use `packageInfo.ts`
- **Never** read `encryption-key.enc` directly — use `encryptionKey.ts`
- **Never** call `getOrCreateEncryptionKey()` before `app.ready`
- **Never** read electron-store in hot paths — cache via `configCache.ts`
- **Never** add static util imports to `resourceCleanup.ts` — use lazy `require()` via global cleanup callback
- **Never** recreate `featureTypes.ts` or `ipc.ts` barrel — types live in `featureConfigTypes.ts` / `performanceTypes.ts`; import directly
