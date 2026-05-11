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
 * Performance metrics export interface
 */
export interface PerformanceMetrics {
  startupTime: number;
  markers: Record<string, number>;
  memorySnapshots: MemorySnapshot[];
  rendererSnapshots: RendererMemorySnapshot[];
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
}
