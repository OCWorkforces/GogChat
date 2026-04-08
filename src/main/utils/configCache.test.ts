/**
 * Tests for configCache utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addCacheLayer, isCachedStore, logCacheStats, clearConfigCache } from './configCache';
import type { CachedStore } from './configCache';
import Store from 'electron-store';
import log from 'electron-log';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ConfigCache', () => {
  let store: Store<{ test: string; nested: { value: number } }>;
  let cachedStore: CachedStore<{ test: string; nested: { value: number } }>;

  beforeEach(() => {
    // Create a fresh store instance
    store = new Store<{ test: string; nested: { value: number } }>({
      name: 'test-config-cache',
      projectName: 'gogchat-test',
      schema: {
        test: {
          type: 'string',
          default: 'default',
        },
        nested: {
          type: 'object',
          properties: {
            value: {
              type: 'number',
              default: 0,
            },
          },
        },
      },
    });

    // Clear store
    store.clear();

    // Add cache layer
    cachedStore = addCacheLayer(store);
  });

  afterEach(() => {
    // Clean up
    if (cachedStore) {
      cachedStore.clear();
    }
  });

  describe('addCacheLayer', () => {
    it('should wrap store with cache methods', () => {
      expect(cachedStore.getCacheStats).toBeDefined();
      expect(cachedStore.clearCache).toBeDefined();
      expect(typeof cachedStore.getCacheStats).toBe('function');
      expect(typeof cachedStore.clearCache).toBe('function');
    });

    it('should preserve original store functionality', () => {
      cachedStore.set('test', 'value');
      expect(cachedStore.get('test')).toBe('value');
    });
  });

  describe('Cache functionality', () => {
    it('should cache get() results', () => {
      cachedStore.set('test', 'cached-value');

      // First read - cache miss
      const value1 = cachedStore.get('test');
      expect(value1).toBe('cached-value');

      // Second read - cache hit
      const value2 = cachedStore.get('test');
      expect(value2).toBe('cached-value');

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should handle cache hits correctly', () => {
      cachedStore.set('test', 'test-value');

      // First read - cache miss
      cachedStore.get('test');

      const statsBefore = cachedStore.getCacheStats();
      const hitsBefore = statsBefore.hits;

      // Second read - cache hit
      cachedStore.get('test');

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.hits).toBe(hitsBefore + 1);
    });

    it('should handle cache misses correctly', () => {
      const statsBefore = cachedStore.getCacheStats();
      const missesBefore = statsBefore.misses;

      // First read of new key - cache miss
      cachedStore.get('test');

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.misses).toBe(missesBefore + 1);
    });

    it('should track write operations', () => {
      const statsBefore = cachedStore.getCacheStats();
      const writesBefore = statsBefore.writes;

      cachedStore.set('test', 'new-value');

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.writes).toBe(writesBefore + 1);
    });

    it('should invalidate cache on set()', () => {
      cachedStore.set('test', 'value1');
      cachedStore.get('test'); // Cache the value

      const statsBefore = cachedStore.getCacheStats();
      const missesBefore = statsBefore.misses;

      // Setting new value should invalidate cache
      cachedStore.set('test', 'value2');

      // Next get should be a cache miss
      const value = cachedStore.get('test');
      expect(value).toBe('value2');

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.misses).toBe(missesBefore + 1);
    });

    it('should invalidate parent keys on nested set()', () => {
      cachedStore.set('nested', { value: 1 });
      cachedStore.get('nested'); // Cache the parent

      // Set nested value - should invalidate parent cache
      cachedStore.set('nested.value' as never, 2 as never);

      const statsBefore = cachedStore.getCacheStats();
      const missesBefore = statsBefore.misses;

      // Reading parent should be a cache miss
      const nested = cachedStore.get('nested');
      expect(nested.value).toBe(2);

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.misses).toBe(missesBefore + 1);
    });

    it('should handle delete() with cache invalidation', () => {
      cachedStore.set('test', 'value');
      cachedStore.get('test'); // Cache the value

      // Delete should invalidate cache
      cachedStore.delete('test' as never);

      // Next get should use default value
      const value = cachedStore.get('test');
      expect(value).toBe('default');
    });

    it('should clear cache on clear()', () => {
      cachedStore.set('test', 'value');
      cachedStore.get('test'); // Cache the value

      const statsBefore = cachedStore.getCacheStats();
      expect(statsBefore.hits + statsBefore.misses).toBeGreaterThan(0);

      // Clear should reset stats
      cachedStore.clear();

      const statsAfter = cachedStore.getCacheStats();
      expect(statsAfter.hits).toBe(0);
      expect(statsAfter.misses).toBe(0);
      expect(statsAfter.writes).toBe(0);
    });

    it('should handle get() with default values', () => {
      // Get key - will use schema default since not set
      const value = cachedStore.get('test');
      expect(value).toBe('default'); // Schema default

      // Second get should hit cache
      const value2 = cachedStore.get('test');
      expect(value2).toBe('default');

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  describe('Cache statistics', () => {
    it('should calculate hit rate correctly', () => {
      cachedStore.set('test', 'value');

      // 1 miss
      cachedStore.get('test');

      // 3 hits
      cachedStore.get('test');
      cachedStore.get('test');
      cachedStore.get('test');

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe('75.0%'); // 3/(3+1) = 75%
    });

    it('should return 0.0% hit rate when no operations', () => {
      const stats = cachedStore.getCacheStats();
      expect(stats.hitRate).toBe('0.0%');
    });

    it('should return correct hit rate with only misses', () => {
      cachedStore.get('test');
      cachedStore.get('nested');

      const stats = cachedStore.getCacheStats();
      expect(stats.hitRate).toBe('0.0%');
    });

    it('should return correct hit rate with only hits', () => {
      cachedStore.set('test', 'value');
      cachedStore.get('test'); // miss
      cachedStore.get('test'); // hit
      cachedStore.get('test'); // hit

      const stats = cachedStore.getCacheStats();
      // Should be 2 hits, 1 miss = 66.7%
      expect(parseFloat(stats.hitRate)).toBeCloseTo(66.7, 0);
    });
  });

  describe('clearCache method', () => {
    it('should manually clear cache without clearing store data', () => {
      cachedStore.set('test', 'value');
      cachedStore.get('test'); // Cache the value

      // Manually clear cache
      cachedStore.clearCache();

      // Value should still be in store
      expect(cachedStore.get('test')).toBe('value');

      // But getting it should be a cache miss
      const stats = cachedStore.getCacheStats();
      expect(stats.misses).toBeGreaterThan(0);
    });
  });

  describe('logCacheStats', () => {
    it('should log cache statistics for cached store', () => {
      cachedStore.set('test', 'value');
      cachedStore.get('test');
      cachedStore.get('test');

      // Should not throw
      expect(() => logCacheStats(cachedStore)).not.toThrow();
    });

    it('should handle store without cache enabled', () => {
      const regularStore = new Store<{ test: string }>({
        name: 'test-regular',
        projectName: 'gogchat-test',
        schema: {
          test: {
            type: 'string',
            default: 'default',
          },
        },
      });

      // Should not throw, just warn
      expect(() => logCacheStats(regularStore as never)).not.toThrow();

      regularStore.clear();
    });
  });

  describe('clearConfigCache', () => {
    it('should be callable', () => {
      // This is just a placeholder function
      expect(() => clearConfigCache()).not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple rapid reads', () => {
      cachedStore.set('test', 'value');

      // Rapid reads
      for (let i = 0; i < 100; i++) {
        cachedStore.get('test');
      }

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBe(99); // First is miss, rest are hits
      expect(stats.misses).toBe(1);
    });

    it('should handle multiple rapid writes', () => {
      for (let i = 0; i < 50; i++) {
        cachedStore.set('test', `value${i}`);
      }

      const stats = cachedStore.getCacheStats();
      expect(stats.writes).toBe(50);
    });

    it('should handle alternating reads and writes', () => {
      for (let i = 0; i < 10; i++) {
        cachedStore.set('test', `value${i}`);
        const value = cachedStore.get('test');
        expect(value).toBe(`value${i}`);
      }

      const stats = cachedStore.getCacheStats();
      expect(stats.writes).toBe(10);
      expect(stats.misses).toBe(10); // Each read after write is a miss
    });

    it('should handle undefined values', () => {
      // Get non-existent key without default
      const value = cachedStore.get('nonexistent' as never);
      expect(value).toBeUndefined();

      // Second get should hit cache
      const value2 = cachedStore.get('nonexistent' as never);
      expect(value2).toBeUndefined();

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should handle nested paths correctly', () => {
      cachedStore.set('nested', { value: 10 });

      // Read nested path
      const value = cachedStore.get('nested.value' as never);
      expect(value).toBe(10);

      // Read again - should be cache hit
      const value2 = cachedStore.get('nested.value' as never);
      expect(value2).toBe(10);

      const stats = cachedStore.getCacheStats();
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  it('should pass defaultValue to underlying store.get() when provided', () => {
    // This covers the `defaultValue !== undefined` branch (line 81)
    // Get a non-existent key with an explicit default value
    const value = cachedStore.get('nonexistent' as never, 'my-default' as never);
    expect(value).toBe('my-default');

    // Second call should hit cache and return cached value (my-default)
    const value2 = cachedStore.get('nonexistent' as never, 'my-default' as never);
    expect(value2).toBe('my-default');

    const stats = cachedStore.getCacheStats();
    expect(stats.hits).toBeGreaterThan(0);
  });
});

describe('isCachedStore type guard', () => {
  it('should return true for a CachedStore (has clearCache method)', () => {
    const store = new Store<{ test: string }>({
      name: 'test-type-guard-cached',
      projectName: 'gogchat-test',
      schema: {
        test: { type: 'string', default: '' },
      },
    });
    const cachedStore = addCacheLayer(store);
    expect(isCachedStore(cachedStore)).toBe(true);
    cachedStore.clear();
  });

  it('should return false for a regular Store (no clearCache method)', () => {
    const regularStore = new Store<{ test: string }>({
      name: 'test-type-guard-regular',
      projectName: 'gogchat-test',
      schema: {
        test: { type: 'string', default: '' },
      },
    });
    expect(isCachedStore(regularStore)).toBe(false);
    regularStore.clear();
  });

  it('should return false for a store-like object without clearCache', () => {
    const fakeLike = { get: vi.fn(), set: vi.fn() } as never;
    expect(isCachedStore(fakeLike)).toBe(false);
  });
});

describe('TTL cache expiry', () => {
  let store: Store<{ test: string }>;
  let cachedStore: CachedStore<{ test: string }>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Store<{ test: string }>({
      name: 'test-ttl-expiry',
      projectName: 'gogchat-test',
      schema: {
        test: { type: 'string', default: 'default' },
      },
    });
    store.clear();
    cachedStore = addCacheLayer(store);
  });

  afterEach(() => {
    cachedStore.clear();
    vi.useRealTimers();
  });

  it('should return cached value within TTL window (30s)', () => {
    cachedStore.set('test', 'ttl-value');
    cachedStore.get('test'); // cache miss — populates cache

    // Advance time by 29 seconds (still within 30s TTL)
    vi.advanceTimersByTime(29_000);

    const value = cachedStore.get('test');
    expect(value).toBe('ttl-value');

    const stats = cachedStore.getCacheStats();
    // 1 miss (first read) + 1 hit (second read within TTL)
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('should expire cache entries after 30s TTL', () => {
    cachedStore.set('test', 'ttl-value');
    cachedStore.get('test'); // cache miss — populates cache

    // Advance time past 30s TTL
    vi.advanceTimersByTime(31_000);

    // This should be a cache miss due to TTL expiry
    const value = cachedStore.get('test');
    expect(value).toBe('ttl-value'); // still returns correct value (from store)

    const stats = cachedStore.getCacheStats();
    // 2 misses: first read + expired read
    expect(stats.misses).toBe(2);
    expect(stats.hits).toBe(0);
  });

  it('should re-cache after TTL expiry on next read', () => {
    cachedStore.set('test', 'original');
    cachedStore.get('test'); // miss — cache populated

    vi.advanceTimersByTime(31_000);
    cachedStore.get('test'); // miss — TTL expired, re-populate cache

    // Immediately read again — should be a hit from re-cached entry
    const value = cachedStore.get('test');
    expect(value).toBe('original');

    const stats = cachedStore.getCacheStats();
    expect(stats.misses).toBe(2); // first read + expired read
    expect(stats.hits).toBe(1); // after re-cache
  });

  it('should expire each key independently', () => {
    cachedStore.set('test', 'value-a');
    cachedStore.get('test'); // miss for 'test'

    vi.advanceTimersByTime(15_000); // 15s elapsed

    // Read a different key — this one starts fresh
    cachedStore.get('nonexistent' as never); // miss for 'nonexistent'

    vi.advanceTimersByTime(16_000); // 31s total for 'test', 16s for 'nonexistent'

    // 'test' should be expired, 'nonexistent' should still be cached
    cachedStore.get('test'); // miss — expired
    cachedStore.get('nonexistent' as never); // hit — still within TTL

    const stats = cachedStore.getCacheStats();
    // misses: test(1) + nonexistent(1) + test-expired(1) = 3
    // hits: nonexistent(1) = 1
    expect(stats.misses).toBe(3);
    expect(stats.hits).toBe(1);
  });
});

describe('LRU eviction', () => {
  let store: Store<Record<string, string>>;
  let cachedStore: CachedStore<Record<string, string>>;

  beforeEach(() => {
    // Use a schema-less store for dynamic key testing
    store = new Store<Record<string, string>>({
      name: 'test-lru-eviction',
      projectName: 'gogchat-test',
    });
    store.clear();
    cachedStore = addCacheLayer(store);
  });

  afterEach(() => {
    cachedStore.clear();
  });

  it('should evict oldest cache entries when cache exceeds 200 max size', () => {
    // Fill cache with 200 entries via reads (each set invalidates, so we set then read)
    for (let i = 0; i < 200; i++) {
      const key = `key-${i}` as never;
      cachedStore.set(key, `value-${i}` as never);
      cachedStore.get(key); // populate cache
    }

    const statsBefore = cachedStore.getCacheStats();
    expect(statsBefore.misses).toBe(200);

    // Now add one more entry — this set() should trigger eviction
    cachedStore.set('overflow-key' as never, 'overflow-value' as never);

    // Read the overflow key to populate cache
    cachedStore.get('overflow-key' as never);

    // The oldest entries should have been evicted
    // Reading 'key-0' should now be a cache miss (evicted)
    const missCountBefore = cachedStore.getCacheStats().misses;
    cachedStore.get('key-0' as never);
    const missCountAfter = cachedStore.getCacheStats().misses;

    // key-0 was evicted, so it should be a miss
    expect(missCountAfter).toBe(missCountBefore + 1);
  });

  it('should keep recent entries when evicting', () => {
    // Fill up beyond capacity
    for (let i = 0; i < 201; i++) {
      const key = `key-${i}` as never;
      cachedStore.set(key, `value-${i}` as never);
      cachedStore.get(key); // populate cache
    }

    // The most recent entries should still be cached
    const hitsBefore = cachedStore.getCacheStats().hits;
    cachedStore.get('key-200' as never); // Most recently added
    const hitsAfter = cachedStore.getCacheStats().hits;
    expect(hitsAfter).toBe(hitsBefore + 1); // cache hit
  });
});

describe('logCacheStats detailed', () => {
  it('should log all stat lines to electron-log', () => {
    const store = new Store<{ test: string }>({
      name: 'test-log-stats-detail',
      projectName: 'gogchat-test',
      schema: {
        test: { type: 'string', default: '' },
      },
    });
    const cachedStore = addCacheLayer(store);

    cachedStore.set('test', 'val');
    cachedStore.get('test'); // miss
    cachedStore.get('test'); // hit

    vi.mocked(log.info).mockClear();
    logCacheStats(cachedStore);

    // Should log header, hits, misses, writes, hitRate, footer
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Cache Statistics'));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Cache hits:'));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Cache misses:'));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Cache writes:'));
    expect(log.info).toHaveBeenCalledWith(expect.stringContaining('Hit rate:'));

    cachedStore.clear();
  });

  it('should warn when store does not have getCacheStats', () => {
    const fakeStore = { get: vi.fn(), set: vi.fn() } as never;
    vi.mocked(log.warn).mockClear();
    logCacheStats(fakeStore);
    expect(log.warn).toHaveBeenCalledWith('[ConfigCache] Store does not have cache enabled');
  });
});

describe('clearConfigCache function', () => {
  it('should log when called', () => {
    vi.mocked(log.debug).mockClear();
    clearConfigCache();
    expect(log.debug).toHaveBeenCalledWith('[ConfigCache] Clear config cache called');
  });
});
