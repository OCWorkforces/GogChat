/**
 * Config Store Cache Layer
 * Adds in-memory caching to electron-store to reduce encryption/decryption overhead
 * Only implement if profiling shows benefit (>0.1ms per read)
 */

import log from 'electron-log';
import type Store from 'electron-store';

/**
 * Cache statistics for monitoring
 */
interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
}

/**
 * Add caching layer to electron-store
 * @param store - electron-store instance
 * @returns Store with caching enabled
 */
export function addCacheLayer<T extends Record<string, any>>(store: Store<T>): Store<T> {
  // In-memory cache
  const cache = new Map<string, any>();
  const stats: CacheStats = {hits: 0, misses: 0, writes: 0};

  // Store original methods
  const originalGet = store.get.bind(store);
  const originalSet = store.set.bind(store);
  const originalDelete = store.delete.bind(store);
  const originalClear = store.clear.bind(store);

  // Wrap get() with caching
  (store as any).get = function(key: string, defaultValue?: any) {
    // Check cache first
    if (cache.has(key)) {
      stats.hits++;
      log.debug(`[ConfigCache] Cache hit: ${key}`);
      return cache.get(key);
    }

    // Cache miss - read from store
    stats.misses++;
    const value = originalGet(key, defaultValue);
    cache.set(key, value);
    log.debug(`[ConfigCache] Cache miss: ${key}, value cached`);

    return value;
  };

  // Wrap set() with cache invalidation
  (store as any).set = function(key: string, value: any) {
    stats.writes++;

    // Invalidate cache for this key and parent paths
    invalidateCacheForKey(key, cache);

    // Write to store
    return originalSet(key, value);
  };

  // Wrap delete() with cache invalidation
  (store as any).delete = function(key: string) {
    invalidateCacheForKey(key, cache);
    return originalDelete(key);
  };

  // Wrap clear() with full cache clear
  (store as any).clear = function() {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.writes = 0;
    log.debug('[ConfigCache] Cache cleared');
    return originalClear();
  };

  // Add cache stats method
  (store as any).getCacheStats = function(): CacheStats & {hitRate: string} {
    const total = stats.hits + stats.misses;
    const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : '0.0';
    return {...stats, hitRate: `${hitRate}%`};
  };

  // Add manual cache clear method
  (store as any).clearCache = function() {
    const size = cache.size;
    cache.clear();
    log.info(`[ConfigCache] Manually cleared ${size} cached entries`);
  };

  log.info('[ConfigCache] Cache layer enabled for electron-store');
  return store;
}

/**
 * Invalidate cache entries for a key and its parent paths
 * @param key - Key to invalidate (e.g., 'app.hideMenuBar')
 * @param cache - Cache map
 */
function invalidateCacheForKey(key: string, cache: Map<string, any>): void {
  // Delete the exact key
  cache.delete(key);

  // Delete parent keys (e.g., 'app.hideMenuBar' invalidates 'app')
  const parts = key.split('.');
  for (let i = 0; i < parts.length; i++) {
    const partialKey = parts.slice(0, i + 1).join('.');
    cache.delete(partialKey);
  }

  log.debug(`[ConfigCache] Invalidated cache for: ${key} and parent paths`);
}

/**
 * Log cache statistics
 * @param store - Store with cache enabled
 */
export function logCacheStats(store: any): void {
  if (typeof store.getCacheStats !== 'function') {
    log.warn('[ConfigCache] Store does not have cache enabled');
    return;
  }

  const stats = store.getCacheStats();
  log.info('[ConfigCache] ========== Cache Statistics ==========');
  log.info(`[ConfigCache] Cache hits: ${stats.hits}`);
  log.info(`[ConfigCache] Cache misses: ${stats.misses}`);
  log.info(`[ConfigCache] Cache writes: ${stats.writes}`);
  log.info(`[ConfigCache] Hit rate: ${stats.hitRate}`);
  log.info('[ConfigCache] =========================================');
}
