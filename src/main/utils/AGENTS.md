# src/main/utils/ — Main Process Utilities

**Generated:** 2026-03-30

22 utility modules. All singletons follow `getXxx()` / `destroyXxx()` pattern. Cleanup registered lazily via `registerBuiltInGlobalCleanups()` — no direct imports from other utils at module level in `resourceCleanup.ts`.

## MODULE INVENTORY

| File                      | Lines | Purpose                                | Singleton                   |
| ------------------------- | ----- | -------------------------------------- | --------------------------- |
| `accountWindowManager.ts` | 437   | Multi-account BrowserWindow management | `getAccountWindowManager()` |
| `featureManager.ts`       | 363   | Feature lifecycle orchestrator        | `getFeatureManager()`       |
| `ipcHelper.ts`            | 351   | Secure IPC handler factories           | `getIPCManager()`           |
| `platform.ts`            | 338   | macOS platform utils                  | `getPlatformUtils()`        |
| `performanceMonitor.ts`  | 334   | Startup timing + memory snapshots     | `getPerformanceMonitor()`   |
| `ipcDeduplicator.ts`     | 321   | Dedup rapid same-key requests         | `getDeduplicator()`         |
| `errorHandler.ts`        | 318   | Structured error wrapping             | `getErrorHandler()`         |
| `resourceCleanup.ts`     | 271   | Interval/listener/task cleanup        | `getCleanupManager()`       |
| `iconCache.ts`           | 218   | NativeImage preload cache             | `getIconCache()`            |
| `bootstrapWatcher.ts`    | 205   | Bootstrap window navigation watching   | exported functions         |
| `rateLimiter.ts`        | 191   | IPC DoS prevention                    | `getRateLimiter()`          |
| `trackedResources.ts`   | 168   | Tracked timeout/interval/listener      | exported functions         |
| `configCache.ts`        | 157   | In-memory layer for electron-store     | `addCacheLayer()`          |
| `featureTypes.ts`       | 143   | Feature config types + factory fns     | exported functions        |
| `encryptionKey.ts`      | 116   | SafeStorage encryption key management  | exported functions        |
| `logger.ts`             | 112   | Scoped structured logging              | `logger.*`                 |
| `featureSorter.ts`      | 110   | Topological sort for feature deps     | exported functions        |
| `configProfiler.ts`     | 106   | Dev-only store perf profiler          | —                          |
| `packageInfo.ts`        | 78    | package.json singleton                | `getPackageInfo()`         |
| `menuActionRegistry.ts` | 52    | Decouples features from appMenu        | exported functions        |
| `ipcCommonValidators.ts`| 48    | Common IPC validation helpers         | exported const             |
| `deepLinkUtils.ts`      | 27    | Deep link URL parsing                 | exported functions        |
## MOST-REFERENCED UTILITIES
`resourceCleanup` (6 features), `accountWindowManager` (5), `ipcHelper` (5), `rateLimiter` (4), `iconCache` (4), `platform` (4), `performanceMonitor` (3), `packageInfo` (3), `errorHandler` (3).

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` uses lazy `require()` via `registerBuiltInGlobalCleanups()` — no static imports from other utils. Called once in `index.ts` after `app.whenReady()`.
`ipcHelper` → `rateLimiter`, `logger`, `errorHandler`. `ipcDeduplicator` → `logger`, `errorHandler`.
`menuActionRegistry.ts` — zero imports from other utils. Pure in-memory `Map<string, MenuAction>`.

## KEY PATTERNS

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS` in constants.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `registerCleanupTask()`, `registerGlobalCleanupCallback()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up. Global cleanups are registered lazily via `registerBuiltInGlobalCleanups()` to avoid coupling.

**Menu action registry**: `registerMenuAction(id, { label, handler })` / `getMenuAction(id)` / `clearMenuActions()`. Features self-register actions; appMenu consumes them. Eliminates feature→feature imports.

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
