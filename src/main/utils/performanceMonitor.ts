/**
 * Performance Monitor
 * Tracks startup performance metrics and provides timing information
 * Helps measure the impact of optimizations
 *
 * Features:
 * - Timing markers for key lifecycle events
 * - Memory usage tracking
 * - <3s startup target validation
 * - JSON export for CI/CD integration
 * - Module loading time tracking
 */

import log from 'electron-log';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Performance target thresholds
 */
const PERFORMANCE_TARGETS = {
  STARTUP_TIME_MS: 3000, // <3s target
  WARNING_THRESHOLD_MS: 2500,
  CRITICAL_THRESHOLD_MS: 3500,
} as const;

/**
 * Memory snapshot interface
 */
interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Performance metrics export interface
 */
interface PerformanceMetrics {
  startupTime: number;
  markers: Record<string, number>;
  memorySnapshots: MemorySnapshot[];
  targetMet: boolean;
  warnings: string[];
  timestamp: string;
  appVersion: string;
}

/**
 * Performance metrics tracker
 */
class PerformanceMonitor {
  private startTime: number;
  private markers: Map<string, number> = new Map();
  private memorySnapshots: MemorySnapshot[] = [];
  private warnings: string[] = [];
  private enabled: boolean = true;

  constructor() {
    this.startTime = Date.now();
    this.captureMemorySnapshot('startup');
    log.debug('[Performance] Performance monitoring started');
  }

  /**
   * Capture memory snapshot at current point in time
   * @param label - Label for this snapshot
   */
  private captureMemorySnapshot(label: string): void {
    if (!this.enabled) return;

    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now() - this.startTime,
      heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100, // MB
      heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
      external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
      rss: Math.round((memUsage.rss / 1024 / 1024) * 100) / 100,
    };

    this.memorySnapshots.push(snapshot);
    log.debug(
      `[Performance] Memory snapshot [${label}]: ${snapshot.heapUsed}MB heap, ${snapshot.rss}MB RSS`
    );
  }

  /**
   * Mark a point in time with a label
   * @param name - Marker name/label
   * @param logMessage - Optional custom message to log
   * @param captureMemory - Whether to capture memory snapshot at this marker
   */
  mark(name: string, logMessage?: string, captureMemory: boolean = false): void {
    if (!this.enabled) return;

    const elapsed = Date.now() - this.startTime;
    this.markers.set(name, elapsed);

    const message = logMessage || name;
    log.info(`[Performance] ${message}: ${elapsed}ms`);

    // Capture memory snapshot if requested
    if (captureMemory) {
      this.captureMemorySnapshot(name);
    }

    // Check against warning threshold
    if (
      elapsed > PERFORMANCE_TARGETS.WARNING_THRESHOLD_MS &&
      elapsed < PERFORMANCE_TARGETS.CRITICAL_THRESHOLD_MS
    ) {
      const warning = `Marker '${name}' at ${elapsed}ms approaching target threshold (${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms)`;
      this.warnings.push(warning);
      log.warn(`[Performance] ${warning}`);
    } else if (elapsed > PERFORMANCE_TARGETS.CRITICAL_THRESHOLD_MS) {
      const warning = `Marker '${name}' at ${elapsed}ms EXCEEDS target threshold (${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms)`;
      this.warnings.push(warning);
      log.error(`[Performance] ${warning}`);
    }
  }

  /**
   * Measure time between two markers
   * @param startMarker - Starting marker name
   * @param endMarker - Ending marker name
   * @returns Duration in milliseconds, or null if markers not found
   */
  measure(startMarker: string, endMarker: string): number | null {
    const startTime = this.markers.get(startMarker);
    const endTime = this.markers.get(endMarker);

    if (startTime === undefined || endTime === undefined) {
      log.warn(`[Performance] Cannot measure: marker(s) not found (${startMarker}, ${endMarker})`);
      return null;
    }

    const duration = endTime - startTime;
    log.info(`[Performance] ${startMarker} → ${endMarker}: ${duration}ms`);
    return duration;
  }

  /**
   * Get all recorded metrics
   * @returns Object with all markers and their timestamps
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.markers);
  }

  /**
   * Get total elapsed time since monitor started
   * @returns Total elapsed time in milliseconds
   */
  getTotalElapsed(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if startup time target was met
   * @returns True if startup time is under target
   */
  isTargetMet(): boolean {
    const totalTime = this.getTotalElapsed();
    return totalTime < PERFORMANCE_TARGETS.STARTUP_TIME_MS;
  }

  /**
   * Get memory usage statistics
   * @returns Memory statistics object
   */
  getMemoryStats(): {
    initial: MemorySnapshot;
    current: MemorySnapshot;
    peak: MemorySnapshot;
  } | null {
    if (this.memorySnapshots.length === 0) return null;
    // Safe to use ! since we checked length > 0
    const current = this.memorySnapshots[this.memorySnapshots.length - 1]!;
    const initial = this.memorySnapshots[0]!;
    const peak = this.memorySnapshots.reduce(
      (max, snap) => (snap.heapUsed > max.heapUsed ? snap : max),
      initial
    );
    return { initial, current, peak };
  }

  /**
   * Export metrics to JSON format
   * @param outputPath - Optional file path to write JSON (defaults to userData/performance-metrics.json)
   * @returns Performance metrics object
   */
  exportToJSON(outputPath?: string): PerformanceMetrics {
    const totalTime = this.getTotalElapsed();
    const metrics: PerformanceMetrics = {
      startupTime: totalTime,
      markers: Object.fromEntries(this.markers),
      memorySnapshots: this.memorySnapshots,
      targetMet: this.isTargetMet(),
      warnings: this.warnings,
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
    };

    if (outputPath) {
      try {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, JSON.stringify(metrics, null, 2));
        log.info(`[Performance] Metrics exported to: ${outputPath}`);
      } catch (error) {
        log.error('[Performance] Failed to export metrics:', error);
      }
    }

    return metrics;
  }

  /**
   * Log summary of all metrics
   */
  logSummary(): void {
    if (!this.enabled) return;

    const totalTime = this.getTotalElapsed();
    const targetMet = this.isTargetMet();
    const memStats = this.getMemoryStats();

    log.info('[Performance] ========== Performance Summary ==========');
    log.info(`[Performance] Total startup time: ${totalTime}ms`);

    // Target validation
    if (targetMet) {
      log.info(
        `[Performance] ✅ Target met: ${totalTime}ms < ${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms`
      );
    } else {
      log.error(
        `[Performance] ❌ Target MISSED: ${totalTime}ms >= ${PERFORMANCE_TARGETS.STARTUP_TIME_MS}ms`
      );
    }

    // Markers timeline
    log.info('[Performance] --- Timing Markers ---');
    const sortedMarkers = Array.from(this.markers.entries()).sort((a, b) => a[1] - b[1]);
    sortedMarkers.forEach(([name, time]) => {
      log.info(`[Performance]   ${name}: ${time}ms`);
    });

    // Memory statistics
    if (memStats) {
      log.info('[Performance] --- Memory Statistics ---');
      log.info(
        `[Performance]   Initial: ${memStats.initial.heapUsed}MB heap, ${memStats.initial.rss}MB RSS`
      );
      log.info(
        `[Performance]   Current: ${memStats.current.heapUsed}MB heap, ${memStats.current.rss}MB RSS`
      );
      log.info(
        `[Performance]   Peak: ${memStats.peak.heapUsed}MB heap, ${memStats.peak.rss}MB RSS`
      );
      log.info(
        `[Performance]   Growth: ${(memStats.current.heapUsed - memStats.initial.heapUsed).toFixed(2)}MB`
      );
    }

    // Warnings
    if (this.warnings.length > 0) {
      log.info('[Performance] --- Warnings ---');
      this.warnings.forEach((warning) => {
        log.warn(`[Performance]   ${warning}`);
      });
    }

    log.info('[Performance] =======================================');
  }

  /**
   * Enable or disable performance monitoring
   * @param enabled - Whether to enable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    log.debug(`[Performance] Monitoring ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset all markers and start time
   */
  reset(): void {
    this.markers.clear();
    this.memorySnapshots = [];
    this.warnings = [];
    this.startTime = Date.now();
    this.captureMemorySnapshot('reset');
    log.debug('[Performance] Monitor reset');
  }
}

// Export types
export type { PerformanceMetrics, MemorySnapshot };
export { PERFORMANCE_TARGETS };

// Create singleton instance
let instance: PerformanceMonitor | null = null;

/**
 * Get the singleton performance monitor instance
 * @returns PerformanceMonitor instance
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}

/**
 * Destroy the performance monitor singleton
 */
export function destroyPerformanceMonitor(): void {
  if (instance) {
    instance.reset();
    instance = null;
    log.debug('[Performance] Destroyed performance monitor');
  }
}

// Export convenience singleton for easy access
export const perfMonitor = getPerformanceMonitor();
