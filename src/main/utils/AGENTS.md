# src/main/utils/ — Main Process Utilities

**Generated:** 2026-02-22

## OVERVIEW

13 utility modules. Security-critical and performance-critical. All singletons follow `getXxx()` / `destroyXxx()` pattern. All are registered with `resourceCleanup.ts` for graceful shutdown.

## MODULE INVENTORY

| File                    | Purpose                            | Singleton             | Key type                          |
| ----------------------- | ---------------------------------- | --------------------- | --------------------------------- |
| `rateLimiter.ts`        | IPC DoS prevention                 | `getRateLimiter()`    | sliding-window per channel        |
| `ipcHelper.ts`          | Secure IPC handler factories       | `getIPCManager()`     | `IPCHandlerConfig<T>`             |
| `ipcDeduplicator.ts`    | Dedup rapid same-key requests      | `getDeduplicator()`   | 100ms default window              |
| `logger.ts`             | Scoped structured logging          | `logger.*`            | wraps electron-log                |
| `platform.ts`           | Cross-platform abstractions        | `getPlatformUtils()`  | `PlatformConfig`                  |
| `iconCache.ts`          | NativeImage preload cache          | `getIconCache()`      | warms 7 icons at startup          |
| `packageInfo.ts`        | package.json singleton             | direct import         | frozen typed object               |
| `configCache.ts`        | In-memory layer for electron-store | direct import         | disabled in test env              |
| `configProfiler.ts`     | Dev-only store perf profiler       | —                     | runs in dev mode only             |
| `performanceMonitor.ts` | Startup timing markers             | direct import         | ~0.01ms overhead                  |
| `featureManager.ts`     | Feature lifecycle orchestrator     | `getFeatureManager()` | see `features/AGENTS.md`          |
| `errorHandler.ts`       | Structured error utilities         | —                     |                                   |
| `resourceCleanup.ts`    | Interval/listener/task cleanup     | `getCleanupManager()` | phases: intervals→listeners→tasks |

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
const cleanup = createSecureIPCHandler({
  channel: IPC_CHANNELS.UNREAD_COUNT,
  validator: commonValidators.isNumber,
  handler: (count) => updateBadge(count),
  rateLimit: 5,
});
// cleanup() removes the listener
```

## LOGGER SCOPES
Scopes: `logger.security`, `logger.ipc`, `logger.performance`, `logger.main`, `logger.config`, `logger.window`, `logger.feature('Name').child('sub')`. Dev=debug, Prod=warn/console+info/file. Log: `~/Library/Logs/GiChat/main.log`. **Never log** credentials.

## RESOURCE CLEANUP

Always use tracked wrappers — bare `setInterval`/`setTimeout` won't be cleaned up:

```typescript
const interval = createTrackedInterval(callback, 1000, 'My interval');
addTrackedListener(mainWindow, 'resize', handler, 'Resize handler');
registerCleanupTask('DB close', async () => db.close(), /* critical */ true);
```

`setupWindowCleanup(window)` + `setupAppCleanup()` — call immediately after window creation.

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
- **Never** read electron-store in hot paths — cache via `configCache.ts`
