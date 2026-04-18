# src/main/utils/ — Main Process Utilities

**Generated:** 2026-04-18

32 utility modules. All singletons follow `getXxx()` / `destroyXxx()` pattern. Cleanup registered lazily via `registerBuiltInGlobalCleanups()` — no direct imports from other utils at module level in `resourceCleanup.ts`.

## MODULE INVENTORY

| File                      | Lines | Purpose                                  | Singleton                   |
| ------------------------- | ----- | ---------------------------------------- | --------------------------- |
| `accountWindowManager.ts` | 437   | Multi-account BrowserWindow management   | `getAccountWindowManager()` |
| `accountWindowRegistry.ts` | 255   | Window registration, lookup, lifecycle   | exported functions          |
| `featureManager.ts`       | 363   | Feature lifecycle orchestrator           | `getFeatureManager()`       |
| `platformUtils.ts`        | 159   | Platform utilities singleton            | `getPlatformUtils()`        |
| `platformHelpers.ts`      | 141   | macOS platform helpers (enforceLocation) | exported functions         |
| `platformDetection.ts`    | 53    | macOS detection helpers (isMacOS, arch)  | exported functions         |
| `performanceMonitor.ts`   | 292   | Startup timing + memory snapshots        | `getPerformanceMonitor()`   |
| `ipcDeduplicator.ts`      | 263   | Dedup rapid same-key requests            | `getDeduplicator()`         |
| `errorHandler.ts`         | 245   | Structured error wrapping                | `getErrorHandler()`         |
| `ipcHelper.ts`            | 264   | Secure IPC handler factories             | `getIPCManager()`           |
| `resourceCleanup.ts`      | 372   | Interval/timeout/listener/task cleanup     | `getCleanupManager()`       |
| `iconCache.ts`            | 218   | NativeImage preload cache                | `getIconCache()`            |
| `bootstrapWatcher.ts`     | 205   | Bootstrap window navigation watching     | exported functions          |
| `rateLimiter.ts`          | 199   | IPC DoS prevention                       | `getRateLimiter()`          |
| `configCache.ts`          | 179   | In-memory layer for electron-store       | `addCacheLayer()`           |
| `configSchema.ts`         | 159   | electron-store schema definition         | exported const              |
| `featureTypes.ts`         | 178   | Feature config types + `initializeFeature` | exported functions        |
| `encryptionKey.ts`        | 128   | SafeStorage encryption key management    | exported functions          |
| `mediaAccess.ts`          | 123   | macOS camera/mic TCC permissions         | exported functions          |
| `logger.ts`               | 112   | Scoped structured logging                | `logger.*`                  |
| `featureSorter.ts`        | 110   | Topological sort for feature deps        | exported functions          |
| `configProfiler.ts`       | 106   | Dev-only store perf profiler             | —                           |
| `permissionHandler.ts`    | 98    | Chromium permission request/check handlers | exported functions        |
| `benignLogFilter.ts`      | 93    | Filter benign console messages           | exported functions          |
| `packageInfo.ts`          | 78    | package.json singleton                   | `getPackageInfo()`          |
| `cspHeaderHandler.ts`     | 78    | Strip COEP/COOP headers for benign hosts | exported functions          |
| `bootstrapTracker.ts`     | 74    | Tracks bootstrap window state            | exported functions          |
| `accountRouter.ts`         | 65    | Window creation and routing logic        | exported functions          |
| `errorUtils.ts`           | 49    | Zero-dependency error helpers            | exported functions          |
| `ipcCommonValidators.ts`  | 48    | Common IPC validation helpers            | exported const              |
| `cleanupTypes.ts`         | 30    | Shared cleanup types                     | exported types              |
| `windowUtils.ts`          | 121   | Merged window utilities (events/health/defaults) | exported functions   |
| `performanceExport.ts`    | 128   | Performance export/log helpers           | exported functions          |
| `ipcDeduplicationPatterns.ts` | 70 | Dedup patterns (createDeduplicatedHandler) | exported functions      |
`platformUtils`/`platformHelpers`/`platformDetection` (split from former platform module), `accountWindowManager` (5), `ipcHelper` (4), `resourceCleanup` (4 — also absorbs tracked intervals/timeouts/listeners previously in a separate tracked-resources module), `rateLimiter` (3), `iconCache` (3), `packageInfo` (3).

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` uses lazy `require()` via `registerBuiltInGlobalCleanups()` — no static imports from other utils. Called once in `index.ts` after `app.whenReady()`.
`ipcHelper` → `rateLimiter`, `logger`, `errorHandler`. `ipcDeduplicator` → `logger`, `errorHandler`.
`cleanupTypes.ts` — extracted from `resourceCleanup.ts` to break circular dependency. Exports `EventHandler`, `EventTarget`, `CleanupConfig` types.
`errorUtils.ts` — zero imports from other utils. Extracted to break circular dependency between `ipcHelper`, `ipcDeduplicator`, and `resourceCleanup`.
`permissionHandler.ts` → used by `windowWrapper.ts`. Chromium permission request/check handlers.
`cspHeaderHandler.ts` → used by `windowWrapper.ts`. Also imported by `benignLogFilter.ts`.
`benignLogFilter.ts` → used by `windowWrapper.ts`. Filters benign console messages.
`windowUtils.ts` → used by `windowWrapper.ts`. Unified module for window event logging, health monitoring, and store-backed defaults (previously three separate files).
`ipcDeduplicationPatterns.ts` → used alongside `ipcDeduplicator.ts`. Provides `createDeduplicatedHandler`, `withDeduplication` patterns.
`performanceExport.ts` → used alongside `performanceMonitor.ts`. Provides `exportPerformanceMetrics`, `logPerformanceSummary`.
`bootstrapTracker.ts` → used by `accountWindowManager.ts`. Tracks bootstrap window state.
Menu action registry now lives in `../features/menuActionRegistry.ts` (moved from utils/). `deepLinkUtils.ts` also moved to `../features/deepLinkUtils.ts`.
`configSchema.ts` → used by `config.ts`. Exports `schema` and `CACHE_VERSION`.

## KEY PATTERNS

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS` in constants.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `setupWindowCleanup()`, `registerCleanupTask()`, `registerGlobalCleanupCallback()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up. Global cleanups are registered lazily via `registerBuiltInGlobalCleanups()` to avoid coupling.

**Menu action registry**: `registerMenuAction(id, { label, handler })` / `getMenuAction(id)` / `clearMenuActions()`. Features self-register actions; appMenu consumes them. Eliminates feature→feature imports. Now located in `../features/menuActionRegistry.ts`.

**Error handler**: `initializeFeature('name', async () => {...}, 'phase')`, `wrapAsync({ feature, operation }, async () => {...})`.

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
- **Never** add static util imports to `resourceCleanup.ts` — use `registerGlobalCleanupCallback()` + lazy `require()`
