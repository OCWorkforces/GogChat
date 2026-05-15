# src/main/utils/ — Main Process Utilities

**Generated:** 2026-05-14

~50 utility modules. All singletons follow `getXxx()` / `destroyXxx()`. `resourceCleanup.ts` uses lazy `require()` to avoid coupling. Cleanup callbacks registered via `registerBuiltInGlobalCleanups()` (lives in `../initializers/registerGlobalCleanups.ts`). Singleton destroyers + shutdown diagnostics also live in `../initializers/`. Feature lifecycle moved out of utils: build-time plan in `../generated/featurePlan.ts`, runtime walker in `featureRunner.ts`, context in `featureContextStore.ts`.

## MODULE INVENTORY

| File | Lines | Purpose | Singleton |
| --- | --- | --- | --- |
| `featureRunner.ts` | 109 | Walks build-time `FEATURE_PLAN` per phase; sequential batches with parallel specs; tracks initialized for reverse-order `cleanupAll`. Replaces the deleted 485-line `featureManager.ts` | exported fns |
| `featureContextStore.ts` | 22 | Holds the live `FeatureContext` for any feature reading `mainWindow` / `accountWindowManager` post-init | exported fns |
| `accountViewManager.ts` | 569 | Opt-in WebContentsView backend (`app.useWebContentsView` flag); single host BrowserWindow + per-account views; alternative to `accountWindowManager` | `getAccountViewManager()` |
| `ipcFastPath.ts` | 54 | `registerFastHandler` for sync one-way IPC (e.g. `FAVICON_CHANGED`, `UNREAD_COUNT`) — keeps rate limit + validator, skips Promise alloc | exported fns |
| `cdpMetrics.ts` | 144 | Local-only CDP metrics buffer + persistence; powers `features/cdpTelemetry.ts` | exported fns |
| `accountWindowManager.ts` | 532 | Multi-account BrowserWindow mgmt; serialized writes, queue isolation; implements `IAccountWindowManager`; hydrate/dehydrate state machine; dispatches to `accountViewManager` when `app.useWebContentsView=true`; uses branded `AccountIndex` and `AccountPartition` types | `getAccountWindowManager()` |
| `resourceCleanup.ts` | 308 | Tracked intervals/timeouts/listeners; lazy `require()` only; `AbortController`-driven timer fan-out for batched cancellation | `getCleanupManager()` |
| `config.ts` (parent) | — | See `../config.ts` | — |
| `performanceMonitor.ts` | 259 | Startup timing + memory snapshots | `getPerformanceMonitor()` |
| `ipcHelper.ts` | 315 | Secure IPC handler factories; `IPCHandlerConfig.channel: IPCChannelName`; `NoInfer<T>` on `data` param; optional deduplication via `withDeduplication` | `getIPCManager()` |
| `ipcDeduplicator.ts` | 317 | Dedup rapid same-key requests; on-demand cleanup scheduling; **opt-in** per handler via `withDeduplication` or `createDeduplicatedHandler`; resolver-storage path simplified (resolvers map deleted, all callers go through `withDeduplication`) | `getDeduplicator()` |
| `accountWindowRegistry.ts` | 255 | Window registration, lookup, lifecycle; Map keys typed as branded `AccountIndex` and `WebContentsId` | exported fns |
| `errorHandler.ts` | 245 | Structured error wrapping | `getErrorHandler()` |
| `errors.ts` | 42 | Typed error subclasses: `GogChatError` base, `IPCError`, `ConfigError`; native `Error.cause` chaining for IPC, config, encryption errors | exported classes |
| `iconCache.ts` | 220 | NativeImage preload cache; O(1) Map insertion-order LRU (T5+T8) | `getIconCache()` |
| `bootstrapWatcher.ts` | 205 | Bootstrap window navigation watching | exported fns |
| `rateLimiter.ts` | 199 | IPC DoS prevention | `getRateLimiter()` |
| `configCache.ts` | 181 | In-memory layer for electron-store with O(1) LRU eviction; **read-through, no TTL** — entries invalidated only by `set`/`delete`/`clear` | `addCacheLayer()` |
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
| `accountSessionMaintenance.ts` | 162 | Periodic `clearCodeCaches()` on idle accounts (M3a); idle threshold = `clearCodeCaches` timer; registered in `registerGlobalCleanups.ts` | `getAccountActivityTracker()` / `destroyAccountActivityTracker()` |
| `platformDetection.ts` | 53 | macOS detection (isMacOS, arch) | exported fns |
| `errorUtils.ts` | 49 | Zero-dep error helpers (breaks cycles) | exported fns |
| `ipcCommonValidators.ts` | 50 | Common IPC validation helpers | exported const |
| `cleanupTypes.ts` | 30 | Shared cleanup types | exported types |

## CROSS-UTILS DEPENDENCIES

`resourceCleanup.ts` — zero static util imports; lazy `require()` via callbacks registered in `../initializers/registerGlobalCleanups.ts`.
`ipcHelper` → `rateLimiter`, `logger`, `errorHandler`. `ipcDeduplicator` → `logger`, `errorHandler`.
`featureRunner.ts` consumes `FEATURE_PLAN` from `../generated/featurePlan.ts`. `featureContextStore.ts` is a tiny holder with no util deps. `performanceMonitor.ts` consumes `performanceTypes.ts`; both extracted to break circular deps (former `featureManager.ts` and `featureTypes.ts` deleted; `ipc.ts` barrel deleted).
`errorUtils.ts` — zero util imports. Breaks cycle between `ipcHelper` / `ipcDeduplicator` / `resourceCleanup`.
`cleanupTypes.ts` — extracted from `resourceCleanup.ts` to break circular dep.
`cacheWarmer.ts` → `iconCache`, `performanceMonitor`, `configProfiler`. Called from `app.whenReady()` orchestration. (No longer depends on `featureManager`.)
`bootstrapTracker.ts` → used by `accountWindowManager.ts`.
`permissionHandler.ts` / `cspHeaderHandler.ts` / `benignLogFilter.ts` / `windowUtils.ts` → used by `windowWrapper.ts`.
`accountWindowManager.ts` implements `IAccountWindowManager` from `shared/types/window.ts`; dispatches to `accountViewManager.ts` when `app.useWebContentsView=true`.
Menu action registry lives in `../features/`. `deepLinkUtils.ts` lives at `utils/account/`; `helpMenuBuilder.ts` and `trayIconState.ts` (with `setTrayUnread`) live at `utils/platform/`.

## KEY PATTERNS

**AccountWindowManager**: `createAccountWindow()` → `markAsBootstrap()` → `promoteBootstrap()` → `isBootstrap()`. Per-account partitions: `persist:account-N`. Implements 22-method `IAccountWindowManager` interface. T12/M3: `dehydrateAccount()` destroys idle (5 min blur/hide) windows to free webContents memory while preserving partition; `hydrateAccount()` recreates against same partition with bounds/maximized restore; `routeAccountWindow` auto-hydrates via `HydrationHook`. Bootstrap windows are excluded from dehydration.

**Rate limiter**: `rateLimiter.isAllowed(IPC_CHANNELS.X, limit?)` — defaults from `RATE_LIMITS`.

**IPC helper factories**: `createSecureIPCHandler()`, `createSecureReplyHandler()`, `createSecureInvokeHandler()` — all return cleanup fn. Channel param typed as `IPCChannelName`; `data` uses `NoInfer<T>` to prevent handler signature from widening the inferred type. Prefer over raw `ipcMain.on()`.

**Resource cleanup**: `createTrackedInterval()`, `createTrackedTimeout()`, `addTrackedListener()`, `registerCleanupTask()`, `registerGlobalCleanupCallback()`. Bare `setInterval`/`setTimeout` will NOT be cleaned up.

**Feature lifecycle**: declare in `../initializers/*.spec.ts` as a `FeatureSpec`; build-time codegen (`scripts/featurePlanPlugin.js`) emits `../generated/featurePlan.ts`; `featureRunner.runPhase(phase, ctx)` walks it. Types live in `featureConfigTypes.ts`.

**IPC fast path**: `registerFastHandler({ channel, rateLimit, validator, handler })` from `ipcFastPath.ts` for hot one-way `.send()` channels. Preserves rate limit + validation, removes Promise allocation. NOT for `invoke()` — use `createSecureInvokeHandler` instead.

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
