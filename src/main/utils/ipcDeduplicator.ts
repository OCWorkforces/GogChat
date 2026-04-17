/**
 * IPC Deduplicator Utility
 * Prevents duplicate IPC requests from being processed in quick succession
 * Useful for debouncing rapid state changes and preventing redundant work
 */

import { logger } from './logger.js';
import { toError } from './errorUtils.js';
import { createTrackedInterval } from './resourceCleanup.js';

/**
 * Deduplication configuration
 */
export interface DeduplicationConfig {
  /** Time window in milliseconds to consider requests as duplicates */
  windowMs?: number;
  /** Maximum number of cached keys before cleanup */
  maxCacheSize?: number;
  /** Whether to log deduplications */
  debug?: boolean;
}

/**
 * Request cache entry
 */
interface CacheEntry<T> {
  promise: Promise<T>;
  timestamp: number;
  resolvers: Array<{
    resolve: (value: T) => void;
    reject: (error: Error) => void;
  }>;
}

type CacheEntryAny = CacheEntry<unknown>;

/**
 * IPC Request Deduplicator
 * Groups multiple identical requests into a single execution
 */
export class IPCDeduplicator {
  private cache = new Map<string, CacheEntryAny>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private config: Required<DeduplicationConfig>;
  private stats = {
    deduplicatedCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };

  constructor(config: DeduplicationConfig = {}) {
    this.config = {
      windowMs: config.windowMs ?? 100, // Default 100ms window
      maxCacheSize: config.maxCacheSize ?? 100,
      debug: config.debug ?? false,
    };

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Deduplicate a request by key
   * Multiple calls with the same key within the time window will share the same promise
   */
  async deduplicate<T>(key: string, fn: () => Promise<T>, windowMs?: number): Promise<T> {
    const effectiveWindow = windowMs ?? this.config.windowMs;
    const now = Date.now();

    // Check for existing pending request
    const existing = this.cache.get(key);

    if (existing && now - existing.timestamp <= effectiveWindow) {
      // Request is still within the deduplication window
      this.stats.cacheHits++;
      this.stats.deduplicatedCount++;

      if (this.config.debug) {
        logger.ipc.debug(`Deduplicating request: ${key}`);
      }

      // Return the existing promise
      return existing.promise as Promise<T>;
    }

    // No existing request or window expired, execute new request
    this.stats.cacheMisses++;

    if (this.config.debug) {
      logger.ipc.debug(`Executing new request: ${key}`);
    }

    // Clean cache if too large
    if (this.cache.size >= this.config.maxCacheSize) {
      this.cleanOldEntries();
    }

    // Create new promise
    const promise = fn()
      .then((result) => {
        // Resolve all waiting promises
        const entry = this.cache.get(key);
        if (entry) {
          entry.resolvers.forEach(({ resolve }) => resolve(result));
        }
        return result;
      })
      .catch((error: unknown) => {
        // Reject all waiting promises
        const entry = this.cache.get(key);
        if (entry) {
          entry.resolvers.forEach(({ reject }) => reject(toError(error)));
        }
        throw error;
      })
      .finally(() => {
        // Don't immediately remove from cache, let it expire naturally
        // This allows for better deduplication of rapid successive calls
      });

    // Store in cache
    this.cache.set(key, {
      promise,
      timestamp: now,
      resolvers: [],
    });

    return promise;
  }

  /**
   * Deduplicate with custom key generation
   */
  async deduplicateWithKey<T, A extends unknown[]>(
    keyFn: (...args: A) => string,
    fn: (...args: A) => Promise<T>,
    ...args: A
  ): Promise<T> {
    const key = keyFn(...args);
    return this.deduplicate(key, () => fn(...args));
  }

  /**
   * Create a deduplicated version of a function
   */
  createDeduplicated<T, A extends unknown[]>(
    fn: (...args: A) => Promise<T>,
    keyFn: (...args: A) => string,
    windowMs?: number
  ): (...args: A) => Promise<T> {
    return (...args: A) => {
      const key = keyFn(...args);
      return this.deduplicate(key, () => fn(...args), windowMs);
    };
  }

  /**
   * Clear a specific key from cache
   */
  clear(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries
   */
  clearAll(): void {
    this.cache.clear();
    this.stats.deduplicatedCount = 0;
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  /**
   * Get deduplication statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Start automatic cleanup of old entries
   */
  private startCleanup(): void {
    // Run cleanup every second
    this.cleanupInterval = createTrackedInterval(
      () => {
        this.cleanOldEntries();
      },
      1000,
      'ipc-deduplicator-cleanup'
    );
  }

  /**
   * Clean entries older than the deduplication window
   */
  private cleanOldEntries(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.windowMs * 2) {
        expiredKeys.push(key);
      }
    }

    if (expiredKeys.length > 0) {
      expiredKeys.forEach((key) => this.cache.delete(key));

      if (this.config.debug && expiredKeys.length > 0) {
        logger.ipc.debug(`Cleaned ${expiredKeys.length} expired cache entries`);
      }
    }
  }

  /**
   * Destroy the deduplicator and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
  }
}

/**
 * Global deduplicator instance
 */
let globalDeduplicator: IPCDeduplicator | null = null;

/**
 * Get or create the global deduplicator instance
 */
export function getDeduplicator(): IPCDeduplicator {
  if (!globalDeduplicator) {
    globalDeduplicator = new IPCDeduplicator({
      windowMs: 100,
      maxCacheSize: 100,
      debug: process.env.NODE_ENV === 'development',
    });
  }
  return globalDeduplicator;
}

/**
 * Destroy the global deduplicator
 */
export function destroyDeduplicator(): void {
  if (globalDeduplicator) {
    globalDeduplicator.destroy();
    globalDeduplicator = null;
  }
}
