# LM — src/main/utils/lifecycle/ — Feature Runtime & Lifecycle

**Generated:** 2026-05-14

Core infrastructure for feature execution, error handling, performance monitoring, and resource cleanup. `featureRunner.ts` walks the build-time plan; everything else supports it. All singletons expose `getXxx()`/`destroyXxx()`.

## FILES

| File                     | Lines | Purpose                                                                                                                                     |
| ------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `featureRunner.ts`       | 109   | Walks `generated/featurePlan.ts` by phase; sequential security/critical, parallel batches for ui/deferred; reverse-order `cleanupAll()`     |
| `featureContextStore.ts` | 22    | Holds live `FeatureContext` (`mainWindow?`, `accountWindowManager?`, `isFirstLaunch?`) for post-init readers                                |
| `errorHandler.ts`        | ~80   | Top-level `process.on('uncaughtException')` + `unhandledRejection`; wraps errors in `GogChatError` with feature init guard                  |
| `errors.ts`              | ~60   | `GogChatError` base, `IPCError`, `ConfigError` subclasses; `{ cause }` chaining; uses `ErrorCode` union from `../../shared/types/errors.ts` |
| `errorUtils.ts`          | ~40   | `isGogChatError()` type guard, error classification, retry helpers                                                                          |
| `performanceMonitor.ts`  | ~450  | Startup timing markers, memory snapshots, per-renderer sampling, bounded IPC/memory latency sample buffers                                  |
| `performanceExport.ts`   | ~130  | Formats `performance-metrics.json` for CI perf budget gate (`scripts/check-perf-budget.js`), conditionally exporting latency samples        |
| `performanceTypes.ts`    | ~155  | Typed interfaces for timing markers, memory readings, renderer snapshots, and IPC/memory latency samples                                    |
| `resourceCleanup.ts`     | 308   | Tracked intervals/timeouts/listeners; lazy `require()` to decouple; `AbortController`-driven timer fan-out                                  |
| `logger.ts`              | ~50   | Structured logger with feature-scoped prefixes; writes to `~/Library/Logs/GogChat/main.log`                                                 |
| `cleanupTypes.ts`        | ~45   | Type definitions for `SingletonDestroyer` union and cleanup contracts                                                                       |
| `configProfiler.ts`      | ~25   | Build-time config shape validation; ensures store keys match `StoreType`                                                                    |
| `index.ts`               | 1     | Barrel re-export of all above                                                                                                               |

## KEY PATTERNS

- **Feature lifecycle**: `featureRunner` is the single runtime orchestrator — no `FeatureManager` class. Features are `init(ctx)` + optional `cleanup(ctx)`.
- **Error chaining**: Always use `{ cause }` for error propagation. Never throw bare `Error` when a `GogChatError` subclass exists.
- **Cleanup tracking**: All intervals/timeouts go through `resourceCleanup`. Bare `setTimeout`/`setInterval` are **NEVER** used.
- **Singleton pattern**: `getXxx()` returns or creates; `destroyXxx()` cleans up. Called from `singletonDestroyers.ts` during shutdown.
- **Performance latency samples**: `PerformanceMonitor.recordIpcLatency()` and `recordMemoryLatency()` are bounded FIFO buffers exposed via `getIpcLatencySamples()` / `getMemoryLatencySamples()` and exported only when non-empty.
