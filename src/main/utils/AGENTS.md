# src/main/utils/ — Main Process Utilities

**Generated:** 2026-03-27

15 utility modules. All singletons follow `getXxx()` / `destroyXxx()` pattern. All registered with `resourceCleanup.ts` for graceful shutdown.

## MODULE INVENTORY

| File                      | Purpose                                | Singleton                   |
| ------------------------- | -------------------------------------- | --------------------------- |
| `accountWindowManager.ts` | Multi-account BrowserWindow management | `getAccountWindowManager()` |
| `encryptionKey.ts`        | SafeStorage encryption key management  | exported functions          |
| `rateLimiter.ts`          | IPC DoS prevention                     | `getRateLimiter()`          |
| `ipcHelper.ts`            | Secure IPC handler factories           | `getIPCManager()`           |
| `ipcDeduplicator.ts`      | Dedup rapid same-key requests          | `getDeduplicator()`         |
| `logger.ts`               | Scoped structured logging              | `logger.*`                  |
| `platform.ts`             | macOS platform utils                   | `getPlatformUtils()`        |
| `iconCache.ts`            | NativeImage preload cache              | `getIconCache()`            |
| `packageInfo.ts`          | package.json singleton                 | `getPackageInfo()`          |
| `configCache.ts`          | In-memory layer for electron-store     | `addCacheLayer()`           |
| `configProfiler.ts`       | Dev-only store perf profiler           | —                           |
| `performanceMonitor.ts`   | Startup timing + memory snapshots      | `getPerformanceMonitor()`   |
| `featureManager.ts`       | Feature lifecycle orchestrator         | `getFeatureManager()`       |
| `errorHandler.ts`         | Structured error wrapping              | `getErrorHandler()`         |
| `resourceCleanup.ts`      | Interval/listener/task cleanup         | `getCleanupManager()`       |

## MOST-REFERENCED UTILITIES

`resourceCleanup` (6 features), `accountWindowManager` (5), `ipcHelper` (5), `rateLimiter` (4), `iconCache` (4), `platform` (4), `packageInfo` (3).

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` is most coupled — imports from 6 utils: `logger`, `rateLimiter`, `ipcDeduplicator`, `ipcHelper`, `iconCache`, `configCache`.
`ipcHelper` → `rateLimiter`, `logger`, `errorHandler`. `ipcDeduplicator` → `logger`, `errorHandler`.

## KEY PATTERNS

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS` in constants.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `registerCleanupTask()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up.

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
