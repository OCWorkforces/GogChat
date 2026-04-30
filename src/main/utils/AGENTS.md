# src/main/utils/ — Main Process Utilities

**Generated:** 2026-04-29 · **Commit:** 846deba

40 utility modules (+1 new: `accountSessionMaintenance.ts`). All singletons follow `getXxx()` / `destroyXxx()`. `resourceCleanup.ts` uses lazy `require()` to avoid coupling. Cleanup callbacks registered via `registerBuiltInGlobalCleanups()` (lives in `../initializers/registerGlobalCleanups.ts`). Singleton destroyers + shutdown diagnostics also live in `../initializers/`.

## MODULE INVENTORY

| File | Lines | Purpose | Singleton |
| --- | --- | --- | --- |
| `featureManager.ts` | 485 | Feature lifecycle + re-exports config types; includes `createFeature`/`createLazyFeature`/`initializeFeature`; parallel phase-grouped cleanup (M2) | `getFeatureManager()` |
| `accountWindowManager.ts` | 532 | Multi-account BrowserWindow mgmt; serialized writes, queue isolation; implements `IAccountWindowManager`; hydrate/dehydrate state machine (M3b) — idle windows dehydrated after 5min blur/hide, recreated on demand | `getAccountWindowManager()` |
| `resourceCleanup.ts` | 308 | Tracked intervals/timeouts/listeners; lazy `require()` only | `getCleanupManager()` |
| `config.ts` (parent) | — | See `../config.ts` | — |
| `performanceMonitor.ts` | 259 | Startup timing + memory snapshots | `getPerformanceMonitor()` |
| `ipcHelper.ts` | 315 | Secure IPC handler factories; `IPCHandlerConfig.channel: IPCChannelName`; `NoInfer<T>` on `data` param; optional deduplication via `withDeduplication` | `getIPCManager()` |
| `ipcDeduplicator.ts` | 317 | Dedup rapid same-key requests; on-demand cleanup scheduling (M1); **opt-in** per handler via `withDeduplication` or `createDeduplicatedHandler` | `getDeduplicator()` |
| `accountWindowRegistry.ts` | 255 | Window registration, lookup, lifecycle | exported fns |
| `errorHandler.ts` | 245 | Structured error wrapping | `getErrorHandler()` |
| `iconCache.ts` | 220 | NativeImage preload cache; O(1) Map insertion-order LRU (T5+T8) | `getIconCache()` |
| `bootstrapWatcher.ts` | 205 | Bootstrap window navigation watching | exported fns |
| `rateLimiter.ts` | 199 | IPC DoS prevention | `getRateLimiter()` |
| `configCache.ts` | 181 | In-memory layer for electron-store with O(1) LRU eviction | `addCacheLayer()` |
| `configSchema.ts` | 159 | electron-store schema | exported const |
| `platformUtils.ts` | 160 | Platform utilities singleton | `getPlatformUtils()` |
| `cacheWarmer.ts` | 160 | Disjoint icon warmup sets (INITIAL_ICON_PATHS ∩ TRAY_ICON_PATHS = ∅); `IDLE_WARM_DELAY_MS` = 8000ms; called in `setImmediate`; DISJOINTNESS INVARIANT enforced by comment | exported fns |
| `platformHelpers.ts` | 142 | macOS platform helpers (enforceLocation) | exported fns |
| `performanceExport.ts` | 125 | Performance export/log helpers | exported fns |
| `encryptionKey.ts` | 166 | SafeStorage encryption key mgmt; `getOrCreateEncryptionKey()` returns `EncryptionKeyResult { key, migrationPending }`; `needsMigration()` deprecated | exported fns + `EncryptionKeyResult` type |
| `secureFlags.ts` | ~120 | safeStorage-backed security flags (`getDisableCertPinning`/`setDisableCertPinning`); persists to `secure-flags.enc`; macOS Keychain | `getDisableCertPinning()` / `setDisableCertPinning()` |
| `mediaAccess.ts` | 123 | macOS camera/mic TCC permissions | exported fns |
| `windowUtils.ts` | 121 | Window events/health/defaults (merged) | exported fns |
| `logger.ts` | 112 | Scoped structured logging | `logger.*` |
| `featureSorter.ts` | 110 | Topological sort for feature deps | exported fns |
| `configProfiler.ts` | 106 | Dev-only store perf profiler | — |
| `featureConfigTypes.ts` | 91 | Canonical types: `FeaturePriority`, `FeatureContext`, `FeatureConfig`, `FeatureState` (extracted to break cycles) | exported types |
| `performanceTypes.ts` | 68 | Canonical: `PERFORMANCE_TARGETS`, `MemorySnapshot`, `PerformanceMetrics`, `PerformanceMonitorReader` (extracted to break cycles) | exported types/const |
| `permissionHandler.ts` | 98 | Chromium permission handlers | exported fns |
| `benignLogFilter.ts` | 93 | Filter benign console messages | exported fns |
| `packageInfo.ts` | 78 | package.json singleton | `getPackageInfo()` |
| `cspHeaderHandler.ts` | 78 | Strip COEP/COOP for benign hosts | exported fns |
| `bootstrapTracker.ts` | 74 | Tracks bootstrap window state | exported fns |
| `ipcDeduplicationPatterns.ts` | 70 | `createDeduplicatedHandler`, `withDeduplication` | exported fns |
| `accountRouter.ts` | 100 | Window creation + routing logic | exported fns |
| `accountSessionMaintenance.ts` | 161 | Periodic `clearCodeCaches()` on idle accounts (M3a); idle threshold = `clearCodeCaches` timer; registered in `registerGlobalCleanups.ts` | `getAccountActivityTracker()` / `destroyAccountActivityTracker()` |
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

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`. Implements 22-method `IAccountWindowManager` interface. T12/M3: `dehydrateAccount()` destroys idle (5 min blur/hide) windows to free webContents memory while preserving partition; `hydrateAccount()` recreates against same partition with bounds/maximized restore; `routeAccountWindow` auto-hydrates via `HydrationHook`. Bootstrap windows are excluded from dehydration.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS`.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Channel param typed as `IPCChannelName`; `data` uses `NoInfer<T>` to prevent handler signature from widening the inferred type. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `registerCleanupTask()`, `registerGlobalCleanupCallback()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up.

**Feature creation**: `createFeature()` / `createLazyFeature()` from `featureManager`; types from `featureConfigTypes`.

**Error handler**: `initializeFeature('name', async () => {...}, 'phase')`, `wrapAsync({ feature, operation }, async () => {...})`.

**Cache warmer**: `cacheWarmer.warmAfterReady()` — orchestrates icon warm + deferred phase + dev profiling.

## LOGGER SCOPES

`logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.config`, `logger.window`, `logger.feature('Name')`. Log: `~/Library/Logs/GogChat/main.log`. **Never log** credentials.

## ANTI-PATTERNS

- **Never** call `setInterval`/`setTimeout` without tracked wrappers (sole exception: `errorHandler.ts` uncaughtException handler — circular dep with `resourceCleanup.ts` makes tracking impossible; acceptable since cleanup is moot during shutdown)
- **Never** create IPC handlers without cleanup return value
- **Never** use `electron-log` directly — use `logger.*` scopes
- **Never** read `package.json` with `fs.readFileSync` — use `packageInfo.ts`
- **Never** read `encryption-key.enc` directly — use `encryptionKey.ts`
- **Never** call `getOrCreateEncryptionKey()` before `app.ready`
- **Never** read electron-store in hot paths — cache via `configCache.ts`
- **Never** add static util imports to `resourceCleanup.ts` — use lazy `require()` via global cleanup callback
- **Never** recreate `featureTypes.ts` or `ipc.ts` barrel — types live in `featureConfigTypes.ts` / `performanceTypes.ts`; import directly

## RESOURCE SCOPE TAXONOMY

Every tracked resource has exactly one scope. Cleanup must match the scope, not the trigger.

**Process-scoped** (lifetime = app process)
- Examples: `ipcMain` handlers, certificate pinning, app menu, autoupdater, global cleanup callbacks.
- Cleanup: only on app quit, via `singletonDestroyers` / `featureManager.cleanup()`.
- NEVER teardown on window close, even the last window.

**Window-scoped** (lifetime = single BrowserWindow)
- Examples: `webContents` listeners, per-session `webRequest` handlers, navigation guards, window-tracked timeouts.
- Cleanup: when that specific window emits `closed`, via `addTrackedListener(window, ...)`.
- Use the window as the cleanup key, not the account or process.

**Account-scoped** (lifetime = account)
- Examples: `persist:account-N` session partitions, persisted window bounds, bootstrap state in `bootstrapTracker`.
- Cleanup: when the account is removed, via `accountWindowManager` removal flow.
- Survives window close (re-login reuses the partition).

**Anti-pattern**: window-close cleanup must NEVER touch process-scoped resources. Calling `ipcMain.removeAllListeners()` (or any `ipcMain.remove*`) inside a window `closed` handler kills handlers other windows still need. This was the root cause of the H1 bug surfaced during the performance audit.
