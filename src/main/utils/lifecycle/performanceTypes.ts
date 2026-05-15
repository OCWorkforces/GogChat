/**
 * Performance Monitor Shared Types
 *
 * Standalone type and constant definitions shared between
 * {@link performanceMonitor} and {@link performanceExport}. Extracted into
 * its own module to break the type-only circular dependency that existed
 * between `performanceMonitor.ts` ↔ `performanceExport.ts`.
 *
 * Both modules import from this file. `performanceMonitor.ts` re-exports
 * these symbols for backward compatibility.
 *
 * @module performanceTypes
 */

/**
 * Performance target thresholds
 */
export const PERFORMANCE_TARGETS = {
  STARTUP_TIME_MS: 3000, // <3s target
  WARNING_THRESHOLD_MS: 2500,
  CRITICAL_THRESHOLD_MS: 3500,
} as const;

/**
 * Memory snapshot interface
 */
export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Per-renderer / GPU / utility process memory snapshot.
 * Captured periodically via `app.getAppMetrics()` to enable
 * measuring memory improvements introduced in later optimization phases.
 */
export interface RendererMemorySnapshot {
  /** Milliseconds since perf monitor start */
  timestamp: number;
  /** Renderer / GPU / utility process ID */
  pid: number;
  /** Which account (0, 1, 2…) if known. Undefined for non-renderer processes. */
  accountIndex?: number;
  /** Process kind reported by Electron */
  type: 'renderer' | 'gpu' | 'utility';
  /** Memory metrics in MB (rounded to 2 decimals) */
  memory: {
    /** Working set size — currently pinned to physical RAM (mapped from `workingSetSize`) */
    residentSet: number;
    /** Peak working set size ever pinned (mapped from `peakWorkingSetSize`) */
    peakResidentSet: number;
    /** Private (non-shared) bytes — only available on Windows; 0 elsewhere */
    private: number;
  };
  /** CPU usage percentage as reported by Electron's ProcessMetric */
  cpuPercent: number;
}

/**
 * Single IPC round-trip latency sample. Captured opportunistically by
 * instrumented IPC handlers (Wave 0 primitive — recorders are wired in
 * later waves). Backward-compatible: consumers may ignore the field.
 */
export interface IPCLatencySample {
  /** Milliseconds since perf monitor start when the sample was recorded. */
  timestamp: number;
  /** IPC channel name (must be a registered `IPCChannelName` at call sites). */
  channel: string;
  /** Measured duration in milliseconds (handler entry → response/return). */
  durationMs: number;
  /** Optional renderer/account context used to slice latency by account. */
  accountIndex?: number;
  /** Optional discriminator for handler kind (`on` / `reply` / `invoke`). */
  kind?: 'on' | 'reply' | 'invoke' | 'fast';
}

/**
 * Single memory-pressure latency sample. Used to track the wall-clock cost
 * of memory-related operations (e.g. `clearCodeCaches`, hydrate/dehydrate)
 * so later waves can budget them. Backward-compatible: consumers may ignore
 * the field.
 */
export interface MemoryLatencySample {
  /** Milliseconds since perf monitor start when the sample was recorded. */
  timestamp: number;
  /** Operation label (e.g. `'clearCodeCaches'`, `'dehydrateAccount'`). */
  operation: string;
  /** Measured duration in milliseconds. */
  durationMs: number;
  /** Optional account index for per-account memory ops. */
  accountIndex?: number;
}

/**
 * Performance metrics export interface
 */
export interface PerformanceMetrics {
  startupTime: number;
  markers: Record<string, number>;
  memorySnapshots: MemorySnapshot[];
  rendererSnapshots: RendererMemorySnapshot[];
  /**
   * Optional IPC latency samples recorded during the run. Optional so older
   * exports / external readers without this field remain valid.
   */
  ipcLatencySamples?: IPCLatencySample[];
  /**
   * Optional memory-operation latency samples recorded during the run.
   * Optional so older exports / external readers without this field remain valid.
   */
  memoryLatencySamples?: MemoryLatencySample[];
  targetMet: boolean;
  warnings: string[];
  timestamp: string;
  appVersion: string;
}

/**
 * Read-only view of {@link PerformanceMonitor} consumed by the export/log
 * helpers in `performanceExport.ts`. Defining it here (instead of importing
 * the concrete `PerformanceMonitor` class type) breaks the type-only
 * circular dependency between `performanceMonitor.ts` and
 * `performanceExport.ts`. The concrete class structurally satisfies this
 * interface.
 */
export interface PerformanceMonitorReader {
  getTotalElapsed(): number;
  getMetrics(): Record<string, number>;
  getMemorySnapshotList(): MemorySnapshot[];
  isTargetMet(): boolean;
  getWarningsList(): string[];
  isEnabled(): boolean;
  getMemoryStats(): {
    initial: MemorySnapshot;
    current: MemorySnapshot;
    peak: MemorySnapshot;
  } | null;
  getRendererSnapshots(): RendererMemorySnapshot[];
  /**
   * Internal accessor for the IPC latency samples list. Default implementations
   * may return an empty array if no samples were recorded.
   * @internal
   */
  getIpcLatencySamples(): IPCLatencySample[];
  /**
   * Internal accessor for the memory latency samples list. Default implementations
   * may return an empty array if no samples were recorded.
   * @internal
   */
  getMemoryLatencySamples(): MemoryLatencySample[];
}
