# src/main/utils/ — Main Process Utilities

**Generated:** 2026-03-25

15 utility modules. Security-critical and performance-critical. All singletons follow `getXxx()` / `destroyXxx()` pattern. All are registered with `resourceCleanup.ts` for graceful shutdown.

## MODULE INVENTORY

| File                      | Purpose                                | Singleton                   | Key type                                                                |
| ------------------------- | -------------------------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `accountWindowManager.ts` | Multi-account BrowserWindow management | `getAccountWindowManager()` | `AccountWindowManager` class with bootstrap tracking                    |
| `encryptionKey.ts`        | SafeStorage encryption key management  | — (exported functions)      | `getOrCreateEncryptionKey()`, `needsMigration()`, `completeMigration()` |
| `rateLimiter.ts`          | IPC DoS prevention                     | `getRateLimiter()`          | sliding-window per channel                                              |
| `ipcHelper.ts`            | Secure IPC handler factories           | `getIPCManager()`           | `IPCHandlerConfig<T>`                                                   |
| `ipcDeduplicator.ts`      | Dedup rapid same-key requests          | `getDeduplicator()`         | 100ms default window                                                    |
| `logger.ts`               | Scoped structured logging              | `logger.*`                  | wraps electron-log                                                      |
| `platform.ts`             | macOS platform utils                   | `getPlatformUtils()`        | `PlatformConfig`                                                        |
| `iconCache.ts`            | NativeImage preload cache              | `getIconCache()`            | warms 9 icons at startup                                                |
| `packageInfo.ts`          | package.json singleton                 | `getPackageInfo()`          | frozen typed object                                                     |
| `configCache.ts`          | In-memory layer for electron-store     | `addCacheLayer()`           | disabled in test env                                                    |
| `configProfiler.ts`       | Dev-only store perf profiler           | —                           | `ENABLE_CONFIG_PROFILING=true`                                          |
| `performanceMonitor.ts`   | Startup timing + memory snapshots      | `getPerformanceMonitor()`   | `perfMonitor` convenience export                                        |
| `featureManager.ts`       | Feature lifecycle orchestrator         | `getFeatureManager()`       | see `features/AGENTS.md`                                                |
| `errorHandler.ts`         | Structured error wrapping              | `getErrorHandler()`         | `wrapAsync`, `wrapSync`                                                 |
| `resourceCleanup.ts`      | Interval/listener/task cleanup         | `getCleanupManager()`       | phases: intervals→listeners→tasks                                       |

## MOST-REFERENCED UTILITIES (by feature import count)

| Rank | Utility                    | Feature Count | Notes                     |
| ---- | -------------------------- | ------------- | ------------------------- |
| 1    | `resourceCleanup.ts`       | 6             | Central cleanup hub        |
| 2    | `accountWindowManager.ts`  | 5             | Multi-account windows      |
| 2    | `ipcHelper.ts`             | 5             | Secure IPC factories       |
| 4    | `rateLimiter.ts`           | 4             | IPC DoS prevention         |
| 4    | `iconCache.ts`             | 4             | Native image cache         |
| 4    | `platform.ts`              | 4             | macOS utils                |
| 7    | `packageInfo.ts`           | 3             | App metadata               |
| 8    | `ipcDeduplicator.ts`       | 1             | Request dedup              |
| 8    | `errorHandler.ts`          | 1             | Error wrapping             |

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` is the most coupled utility — imports from 6 other utils:
`logger`, `rateLimiter`, `ipcDeduplicator`, `ipcHelper`, `iconCache`, `configCache`.

Other cross-utils imports:
- `ipcHelper.ts` → `rateLimiter`, `logger`, `errorHandler`
- `ipcDeduplicator.ts` → `logger`, `errorHandler`
- `featureManager.ts` → `accountWindowManager` (type), `errorHandler`
- `platform.ts` → `logger`

## ACCOUNT WINDOW MANAGER

```typescript
const mgr = getAccountWindowManager();
const win = mgr.createAccountWindow('https://chat.google.com', 0);
mgr.markAsBootstrap(0); // Mark as pre-auth login window
mgr.promoteBootstrap(0); // After auth completes
const state = mgr.getAccountWindowState(0);
mgr.saveAccountWindowState(0);
const idx = mgr.getAccountIndex(someWindow);
mgr.destroyAll();
```

Per-account session partitions: `persist:account-N`. Bootstrap tracking: `markAsBootstrap()` -> `promoteBootstrap()` -> `isBootstrap()`. Window auto-unregisters on `closed` event. Conveniences: `createAccountWindow()`, `getWindowForAccount()`, `getMostRecentWindow()`.

## ENCRYPTION KEY

SafeStorage-backed encryption with legacy deterministic key fallback:

```typescript
import { getOrCreateEncryptionKey, needsMigration, completeMigration } from './encryptionKey.js';

// Get or create key (called by config.ts during store init)
const key = getOrCreateEncryptionKey(); // SafeStorage if available, else legacy

// Check if migration needed (SafeStorage available but no key file)
if (needsMigration()) {
  // Read all data with legacy key, then migrate
  const newKey = completeMigration(); // Generates + stores new key via SafeStorage
}
```

Keys stored at `~/Library/Application Support/GogChat/encryption-key.enc` (SafeStorage-encrypted).
Legacy key: SHA-256 hash of `${app.getName()}-${app.getPath('userData')}`.
Migration happens automatically in `config.ts` `initializeStore()`.

## RATE LIMITER

```typescript
const rateLimiter = getRateLimiter();
if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) return; // 5/sec default
if (!rateLimiter.isAllowed('sensitiveOp', 1)) return; // custom 1/sec
```

Defaults from `../../shared/constants.ts` `RATE_LIMITS`: `IPC_DEFAULT=10`, `IPC_UNREAD_COUNT=5`, `IPC_FAVICON=5`.

## IPC HELPER FACTORIES

Prefer over raw `ipcMain.on()` — bakes in rate limiting, validation, cleanup:

```typescript
// One-way handler (fire-and-forget):
const cleanup = createSecureIPCHandler({
  channel: IPC_CHANNELS.UNREAD_COUNT,
  validator: commonValidators.isNumber,
  handler: (count) => updateBadge(count),
  rateLimit: 5,
});

// Request/reply:
const cleanup = createSecureReplyHandler({
  channel: IPC_CHANNELS.CHECK_IF_ONLINE,
  replyChannel: IPC_CHANNELS.ONLINE_STATUS,
  validator: commonValidators.noData,
  handler: async () => checkNetwork(),
});

// Promise-based (ipcMain.handle):
const cleanup = createSecureInvokeHandler({
  channel: IPC_CHANNELS.GET_CONFIG,
  validator: commonValidators.isString,
  handler: async (key) => store.get(key),
});
// All factories return cleanup() that removes the listener
```

## LOGGER SCOPES

Scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.config`, `logger.window`, `logger.feature('Name').child('sub')`. Dev=debug, Prod=warn/console+info/file. Log: `~/Library/Logs/GogChat/main.log`. **Never log** credentials.

## RESOURCE CLEANUP

Always use tracked wrappers — bare `setInterval`/`setTimeout` won't be cleaned up:

```typescript
const interval = createTrackedInterval(callback, 1000, 'My interval');
addTrackedListener(mainWindow, 'resize', handler, 'Resize handler');
registerCleanupTask('DB close', async () => db.close(), /* critical */ true);
```

`setupWindowCleanup(window)` + `setupAppCleanup()` — call immediately after window creation.

## ERROR HANDLER

Wraps feature init and async operations with structured error context:

```typescript
// Wrap feature initialization:
await initializeFeature('myFeature', async () => { ... }, 'deferred');

// Wrap async operations:
await getErrorHandler().wrapAsync({ feature: 'BadgeIcon', operation: 'update' }, async () => {
  await doRiskyThing();
});
```

Global handlers: `unhandledRejection` (log only), `uncaughtException` → graceful `app.quit()`.

## PLATFORM UTILS

```typescript
const pu = getPlatformUtils();
pu.setBadge(mainWindow, 5);   // macOS: dock badge; Windows: overlay icon
pu.clearBadge(mainWindow);
pu.createTrayIcon();           // auto-sized per platform
pu.getShortcuts().quit;        // 'Cmd+Q' / 'Ctrl+Q'
if (supports.dockBadge()) { ... }  // capability check
```

## ANTI-PATTERNS

- **Never** call `setInterval` / `setTimeout` without `createTrackedInterval` / `createTrackedTimeout`
- **Never** call `addEventListener` on app-lifetime targets without `addTrackedListener`
- **Never** create IPC handlers without cleanup return value or `getIPCManager().register()`
- **Never** use `electron-log` directly in features — use `logger.*` scopes
- **Never** read `package.json` with `fs.readFileSync` — use `packageInfo.ts` singleton
- **Never** read `encryption-key.enc` directly — always use `encryptionKey.ts` functions
- **Never** call `getOrCreateEncryptionKey()` before `app.ready` — SafeStorage requires it on macOS
- **Never** read electron-store in hot paths — cache via `configCache.ts`
