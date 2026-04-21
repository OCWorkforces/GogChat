/**
 * Performance Export Helpers
 *
 * File I/O and formatted summary logging helpers for {@link PerformanceMonitor}.
 * Split from `performanceMonitor.ts` to keep the core monitor focused on state
 * management while isolating side-effectful export/logging concerns here.
 */

import log from 'electron-log';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

import type {
  PerformanceMetrics,
  PerformanceMonitorReader,
} from './performanceTypes.js';
import { PERFORMANCE_TARGETS } from './performanceTypes.js';

/**
 * Export monitor metrics to JSON, optionally writing to disk.
 *
 * Builds a `PerformanceMetrics` snapshot from the monitor's public state.
 * If `outputPath` is provided, the JSON is written atomically (creating any
 * missing parent directories). Write errors are logged but never thrown,
 * preserving the original behavior of the class method.
 *
 * @param monitor - PerformanceMonitor instance to read state from
 * @param outputPath - Optional file path to write JSON
 * @returns Performance metrics object
 */
export function exportPerformanceMetrics(
  monitor: PerformanceMonitorReader,
  outputPath?: string
): PerformanceMetrics {
  const metrics: PerformanceMetrics = {
    startupTime: monitor.getTotalElapsed(),
    markers: monitor.getMetrics(),
    memorySnapshots: monitor.getMemorySnapshotList(),
    targetMet: monitor.isTargetMet(),
    warnings: monitor.getWarningsList(),
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
    } catch (error: unknown) {
      log.error('[Performance] Failed to export metrics:', error);
    }
  }

  return metrics;
}

/**
 * Log a formatted summary of monitor state (markers, memory, warnings).
 *
 * Short-circuits when the monitor is disabled, matching the original
 * class-method behavior. Output format is preserved verbatim.
 *
 * @param monitor - PerformanceMonitor instance to summarize
 */
export function logPerformanceSummary(monitor: PerformanceMonitorReader): void {
  if (!monitor.isEnabled()) return;

  const totalTime = monitor.getTotalElapsed();
  const targetMet = monitor.isTargetMet();
  const memStats = monitor.getMemoryStats();
  const markers = monitor.getMetrics();
  const warnings = monitor.getWarningsList();

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
  const sortedMarkers = Object.entries(markers).sort((a, b) => a[1] - b[1]);
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
    log.info(`[Performance]   Peak: ${memStats.peak.heapUsed}MB heap, ${memStats.peak.rss}MB RSS`);
    log.info(
      `[Performance]   Growth: ${(memStats.current.heapUsed - memStats.initial.heapUsed).toFixed(2)}MB`
    );
  }

  // Warnings
  if (warnings.length > 0) {
    log.info('[Performance] --- Warnings ---');
    warnings.forEach((warning) => {
      log.warn(`[Performance]   ${warning}`);
    });
  }

  log.info('[Performance] =======================================');
}

