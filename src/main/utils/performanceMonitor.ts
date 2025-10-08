/**
 * Performance Monitor
 * Tracks startup performance metrics and provides timing information
 * Helps measure the impact of optimizations
 */

import log from 'electron-log';

/**
 * Performance metrics tracker
 */
class PerformanceMonitor {
  private startTime: number;
  private markers: Map<string, number> = new Map();
  private enabled: boolean = true;

  constructor() {
    this.startTime = Date.now();
    log.debug('[Performance] Performance monitoring started');
  }

  /**
   * Mark a point in time with a label
   * @param name - Marker name/label
   * @param logMessage - Optional custom message to log
   */
  mark(name: string, logMessage?: string): void {
    if (!this.enabled) return;

    const elapsed = Date.now() - this.startTime;
    this.markers.set(name, elapsed);

    const message = logMessage || name;
    log.info(`[Performance] ${message}: ${elapsed}ms`);
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
   * Log summary of all metrics
   */
  logSummary(): void {
    if (!this.enabled) return;

    log.info('[Performance] ========== Performance Summary ==========');
    log.info(`[Performance] Total startup time: ${this.getTotalElapsed()}ms`);

    const sortedMarkers = Array.from(this.markers.entries())
      .sort((a, b) => a[1] - b[1]);

    sortedMarkers.forEach(([name, time]) => {
      log.info(`[Performance]   ${name}: ${time}ms`);
    });

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
    this.startTime = Date.now();
    log.debug('[Performance] Monitor reset');
  }
}

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
