/**
 * Singleton Destroyers
 *
 * Aggregates the destroy functions for singleton instances that need cleanup
 * during graceful shutdown. Centralized here so `registerShutdown.ts` keeps a
 * minimal import surface.
 */

import { destroyIconCache } from '../utils/iconCache.js';
import { destroyRateLimiter } from '../utils/rateLimiter.js';
import { destroyDeduplicator } from '../utils/ipcDeduplicator.js';
import { destroyPerformanceMonitor } from '../utils/performanceMonitor.js';

/**
 * Destroy all tracked singleton instances.
 *
 * Order matches the original shutdown sequence:
 *   performanceMonitor → deduplicator → rateLimiter → iconCache.
 *
 * Errors are NOT caught here — callers are responsible for wrapping in
 * try/catch so the broader shutdown sequence can continue.
 */
export function destroyAllSingletons(): void {
  destroyPerformanceMonitor();
  destroyDeduplicator();
  destroyRateLimiter();
  destroyIconCache();
}
