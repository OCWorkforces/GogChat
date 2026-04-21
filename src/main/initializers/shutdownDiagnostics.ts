/**
 * Shutdown Diagnostics
 *
 * Comprehensive cache statistics logging emitted during graceful shutdown.
 * Purely diagnostic — has no effect on shutdown behavior.
 */

import log from 'electron-log';
import type Store from 'electron-store';
import type { FeatureManager } from '../utils/featureManager.js';
import { getIconCache } from '../utils/iconCache.js';
import { getStore } from '../config.js';
import type { CachedStore } from '../utils/configCache.js';
import { getDeduplicator } from '../utils/ipcDeduplicator.js';
import { getRateLimiter } from '../utils/rateLimiter.js';
import type { StoreType } from '../../shared/types.js';

/**
 * Type guard to check if a store has cache enabled
 */
function isCachedStore(store: Store<StoreType>): store is CachedStore<StoreType> {
  return typeof (store as CachedStore<StoreType>).getCacheStats === 'function';
}

/**
 * Log comprehensive cache statistics on app quit.
 * Provides visibility into cache performance for optimization.
 */
export function logShutdownDiagnostics(featureManager: FeatureManager): void {
  try {
    // Icon Cache Statistics
    const iconCache = getIconCache();
    const iconStats = iconCache.getStats();

    log.info('[Main] --- Icon Cache Statistics ---');
    log.info(`[Main]   Total icons cached: ${iconStats.size}/${iconStats.maxSize}`);
    log.info(`[Main]   Total accesses: ${iconStats.totalAccesses}`);
    log.info(`[Main]   Most accessed: ${iconStats.mostAccessed || 'N/A'}`);
    log.info(`[Main]   Least accessed: ${iconStats.leastAccessed || 'N/A'}`);
    log.info(
      `[Main]   Average accesses per icon: ${iconStats.size > 0 ? (iconStats.totalAccesses / iconStats.size).toFixed(2) : '0'}`
    );

    // Config Cache Statistics
    try {
      const storeInstance = getStore();
      if (isCachedStore(storeInstance)) {
        const configStats = storeInstance.getCacheStats();
        const hitRate = parseFloat(configStats.hitRate.replace('%', ''));

        log.info('[Main] --- Config Cache Statistics ---');
        log.info(`[Main]   Cache hits: ${configStats.hits}`);
        log.info(`[Main]   Cache misses: ${configStats.misses}`);
        log.info(`[Main]   Cache writes: ${configStats.writes}`);
        log.info(`[Main]   Hit rate: ${configStats.hitRate}`);
        log.info(
          `[Main]   Performance: ${hitRate > 80 ? 'Excellent' : hitRate > 60 ? 'Good' : 'Poor'}`
        );
      }
    } catch {
      log.debug('[Main] Store not initialized or cache disabled');
    }

    // IPC Deduplicator Statistics
    try {
      const deduplicator = getDeduplicator();
      const dedupStats = deduplicator.getStats();

      log.info('[Main] --- IPC Deduplicator Statistics ---');
      log.info(`[Main]   Cache hits (deduplicated): ${dedupStats.cacheHits}`);
      log.info(`[Main]   Cache misses (executed): ${dedupStats.cacheMisses}`);
      log.info(`[Main]   Total deduplicated: ${dedupStats.deduplicatedCount}`);
      log.info(
        `[Main]   Deduplication rate: ${dedupStats.cacheHits + dedupStats.cacheMisses > 0 ? ((dedupStats.cacheHits / (dedupStats.cacheHits + dedupStats.cacheMisses)) * 100).toFixed(1) : '0'}%`
      );
    } catch (error: unknown) {
      log.debug('[Main] IPC deduplicator not available:', error);
    }

    // Rate Limiter Statistics
    try {
      const rateLimiter = getRateLimiter();
      const allStats = rateLimiter.getAllStats();
      let totalBlocked = 0;
      let totalMessages = 0;

      for (const [, stats] of allStats) {
        totalBlocked += stats.totalBlocked;
        totalMessages += stats.messagesLastSecond + stats.totalBlocked;
      }

      log.info('[Main] --- Rate Limiter Statistics ---');
      log.info(`[Main]   Active channels: ${allStats.size}`);
      log.info(`[Main]   Total blocked: ${totalBlocked}`);
      log.info(`[Main]   Total messages: ${totalMessages}`);
      log.info(
        `[Main]   Block rate: ${totalMessages > 0 ? ((totalBlocked / totalMessages) * 100).toFixed(1) : '0'}%`
      );
    } catch (error: unknown) {
      log.debug('[Main] Rate limiter not available:', error);
    }

    // Feature Manager Statistics
    const summary = featureManager.getSummary();
    log.info('[Main] --- Feature Manager Statistics ---');
    log.info(`[Main]   Total features: ${summary.total}`);
    log.info(`[Main]   Initialized: ${summary.initialized}`);
    log.info(`[Main]   Failed: ${summary.failed}`);
    log.info(`[Main]   Pending: ${summary.pending}`);
    log.info(`[Main]   Total init time: ${summary.totalTime}ms`);
  } catch (error: unknown) {
    log.error('[Main] Failed to log comprehensive cache statistics:', error);
  }
}
