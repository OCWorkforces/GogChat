/**
 * Tests for configCache utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { addCacheLayer, logCacheStats, clearConfigCache } from './configCache';
import type { CachedStore } from './configCache';
import Store from 'electron-store';

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
      projectName: 'gchat-test',
      name: 'test-config-cache',
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
        projectName: 'gchat-test',
        name: 'test-regular',
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
});
