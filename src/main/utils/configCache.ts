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
 * Extended store type with cache methods
 */
export interface CachedStore<T extends Record<string, unknown>> extends Store<T> {
  getCacheStats(): CacheStats & { hitRate: string };
  clearCache(): void;
}

/**
 * Add caching layer to electron-store
 * @param store - electron-store instance
 * @returns Store with caching enabled
 */
export function addCacheLayer<T extends Record<string, unknown>>(store: Store<T>): CachedStore<T> {
  // In-memory cache
  const cache = new Map<string, unknown>();
  const stats: CacheStats = { hits: 0, misses: 0, writes: 0 };

  const originalGet = store.get.bind(store);
  const originalSet = store.set.bind(store);
  const originalDelete = store.delete.bind(store);
  const originalClear = store.clear.bind(store);

  // Cast once to the target type — all subsequent augmentation is typed
  const cachedStore = store as CachedStore<T>;

  // Wrap get() with caching
  // The implementation uses `any` internally to satisfy electron-store's complex overloaded
  // signature, while the public interface (CachedStore<T>) remains fully typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedStore.get = function (key: any, defaultValue?: any): any {
    // Check cache first
    if (cache.has(key as string)) {
      stats.hits++;
      log.debug(`[ConfigCache] Cache hit: ${String(key)}`);
      return cache.get(key as string);
    }
    // Cache miss - read from store
    stats.misses++;
    const value =
      defaultValue !== undefined
        ? originalGet(key as never, defaultValue as never)
        : originalGet(key as never);
    cache.set(key as string, value);
    log.debug(`[ConfigCache] Cache miss: ${String(key)}, value cached`);
    return value;
  };
  // Wrap set() with cache invalidation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedStore.set = function (key: any, value?: any): void {
    stats.writes++;
    invalidateCacheForKey(key as string, cache);
    return originalSet(key as never, value as never);
  };
  // Wrap delete() with cache invalidation
  cachedStore.delete = function (key: string): void {
    invalidateCacheForKey(key, cache);
    // Call originalDelete with proper typing - the bound method already has correct signature
    return originalDelete(key);
  };
  // Wrap clear() with full cache clear
  cachedStore.clear = function (): void {
    cache.clear();
    stats.hits = 0;
    stats.misses = 0;
    stats.writes = 0;
    log.debug('[ConfigCache] Cache cleared');
    return originalClear();
  };
  // Add cache stats method
  cachedStore.getCacheStats = function (): CacheStats & { hitRate: string } {
    const total = stats.hits + stats.misses;
    const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : '0.0';
    return { ...stats, hitRate: `${hitRate}%` };
  };
  // Add manual cache clear method
  cachedStore.clearCache = function (): void {
    const size = cache.size;
    cache.clear();
    log.info(`[ConfigCache] Manually cleared ${size} cached entries`);
  };

  log.info('[ConfigCache] Cache layer enabled for electron-store');
  return cachedStore;
}

/**
 * Invalidate cache entries for a key and its parent paths
 * @param key - Key to invalidate (e.g., 'app.hideMenuBar')
 * @param cache - Cache map
 */
function invalidateCacheForKey(key: string, cache: Map<string, unknown>): void {
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
export function logCacheStats<T extends Record<string, unknown>>(store: CachedStore<T>): void {
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

/**
 * Clear config cache - placeholder for compatibility
 */
export function clearConfigCache(): void {
  log.debug('[ConfigCache] Clear config cache called');
}
