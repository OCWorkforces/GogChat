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
 * Performance metrics export interface
 */
export interface PerformanceMetrics {
  startupTime: number;
  markers: Record<string, number>;
  memorySnapshots: MemorySnapshot[];
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
}
