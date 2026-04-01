/**
 * Tests for Icon Cache Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';

// Mock Electron before importing iconCache
vi.mock('electron', () => ({
  app: {
    getAppPath: () => path.join(__dirname, '../../..'),
    getName: () => 'gogchat',
    getPath: (name: string) => `/fake/path/${name}`,
  },
  nativeImage: {
    createFromPath: vi.fn((_path: string) => ({
      isEmpty: () => false,
      getSize: () => ({ width: 16, height: 16 }),
    })),
  },
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getIconCache, destroyIconCache } from './iconCache';
import { nativeImage } from 'electron';

describe('IconCacheManager', () => {
  beforeEach(() => {
    // Clean up before each test
    destroyIconCache();
  });

  afterEach(() => {
    // Clean up after each test
    destroyIconCache();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const cache1 = getIconCache();
      const cache2 = getIconCache();

      expect(cache1).toBe(cache2);
    });

    it('should create new instance after destroy', () => {
      const cache1 = getIconCache();
      destroyIconCache();
      const cache2 = getIconCache();

      expect(cache1).not.toBe(cache2);
    });
  });

  describe('Cache Operations', () => {
    it('should start with empty cache', () => {
      const cache = getIconCache();
      expect(cache.getCacheSize()).toBe(0);
    });

    it('should cache icons after loading', () => {
      const cache = getIconCache();

      // Load an icon (will fail in test environment but still cached)
      cache.getIcon('test/path.png');

      expect(cache.getCacheSize()).toBe(1);
    });

    it('should return same icon on subsequent calls', () => {
      const cache = getIconCache();

      const icon1 = cache.getIcon('test/path.png');
      const icon2 = cache.getIcon('test/path.png');

      expect(icon1).toBe(icon2);
      expect(cache.getCacheSize()).toBe(1);
    });

    it('should clear all cached icons', () => {
      const cache = getIconCache();

      cache.getIcon('test/path1.png');
      cache.getIcon('test/path2.png');
      expect(cache.getCacheSize()).toBe(2);

      cache.clear();
      expect(cache.getCacheSize()).toBe(0);
    });
  });

  describe('warmCache', () => {
    it('should pre-load common icons', () => {
      const cache = getIconCache();

      const loaded = cache.warmCache();

      // In test environment, icons won't actually load but cache will be populated
      expect(cache.getCacheSize()).toBeGreaterThan(0);
      expect(loaded).toBeGreaterThanOrEqual(0);
    });

    it('should not duplicate icons on multiple warmCache calls', () => {
      const cache = getIconCache();

      cache.warmCache();
      const firstSize = cache.getCacheSize();

      cache.warmCache();
      const secondSize = cache.getCacheSize();

      expect(secondSize).toBe(firstSize);
    });
  });

  describe('getStats', () => {
    it('should return correct cache statistics', () => {
      const cache = getIconCache();

      cache.getIcon('test/icon1.png');
      cache.getIcon('test/icon2.png');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.icons).toContain('test/icon1.png');
      expect(stats.icons).toContain('test/icon2.png');
    });

    it('should return empty stats for empty cache', () => {
      const cache = getIconCache();

      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.icons).toEqual([]);
    });
  });

  describe('Memory Management', () => {
    it('should properly clean up on destroy', () => {
      const cache = getIconCache();

      cache.getIcon('test/path.png');
      expect(cache.getCacheSize()).toBe(1);

      destroyIconCache();

      // New instance should be empty
      const newCache = getIconCache();
      expect(newCache.getCacheSize()).toBe(0);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entry when cache exceeds maxCacheSize', () => {
      vi.useFakeTimers();
      const cache = getIconCache();

      // Fill cache to max (50 items) with distinct timestamps
      for (let i = 0; i < 50; i++) {
        vi.advanceTimersByTime(1);
        cache.getIcon(`test/icon-${i}.png`);
      }
      expect(cache.getCacheSize()).toBe(50);

      // Add one more to trigger eviction
      vi.advanceTimersByTime(1);
      cache.getIcon('test/icon-overflow.png');
      expect(cache.getCacheSize()).toBe(50);

      // First icon should have been evicted (least recently used)
      const stats = cache.getStats();
      expect(stats.icons).not.toContain('test/icon-0.png');
      expect(stats.icons).toContain('test/icon-overflow.png');

      vi.useRealTimers();
    });

    it('should evict correct entry when items have different access times', () => {
      vi.useFakeTimers();
      const cache = getIconCache();

      // Fill cache to max with distinct timestamps
      for (let i = 0; i < 50; i++) {
        vi.advanceTimersByTime(1);
        cache.getIcon(`test/icon-${i}.png`);
      }

      // Access the first icon to update its lastAccessed
      vi.advanceTimersByTime(1);
      cache.getIcon('test/icon-0.png');

      // Add new icon — icon-1 should be evicted (least recently accessed now)
      vi.advanceTimersByTime(1);
      cache.getIcon('test/icon-new.png');
      expect(cache.getCacheSize()).toBe(50);

      const stats = cache.getStats();
      expect(stats.icons).toContain('test/icon-0.png');
      expect(stats.icons).not.toContain('test/icon-1.png');
      expect(stats.icons).toContain('test/icon-new.png');

      vi.useRealTimers();
    });
  });

  describe('Empty icon handling', () => {
    it('should not cache icons that are empty', () => {
      const cache = getIconCache();

      // Mock createFromPath to return an empty image for this specific call
      vi.mocked(nativeImage.createFromPath).mockReturnValueOnce({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
      } as ReturnType<typeof nativeImage.createFromPath>);

      cache.getIcon('test/empty-icon.png');

      expect(cache.getCacheSize()).toBe(0);
    });

    it('should log error for empty icons', async () => {
      const log = await import('electron-log');
      const cache = getIconCache();

      vi.mocked(nativeImage.createFromPath).mockReturnValueOnce({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
      } as ReturnType<typeof nativeImage.createFromPath>);

      cache.getIcon('test/empty-icon.png');

      expect(log.default.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load icon')
      );
    });
  });

  describe('getStats with populated cache', () => {
    it('should track access counts and most/least accessed', () => {
      const cache = getIconCache();

      cache.getIcon('test/icon-a.png');
      cache.getIcon('test/icon-b.png');
      cache.getIcon('test/icon-c.png');

      // Access icon-a multiple times
      cache.getIcon('test/icon-a.png');
      cache.getIcon('test/icon-a.png');

      const stats = cache.getStats();

      expect(stats.size).toBe(3);
      expect(stats.maxSize).toBe(50);
      expect(stats.totalAccesses).toBeGreaterThan(3);
      expect(stats.mostAccessed).toBe('test/icon-a.png');
      expect(stats.leastAccessed).toBeDefined();
    });
  });
});
