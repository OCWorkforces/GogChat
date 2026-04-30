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

import { getIconCache, destroyIconCache, INITIAL_ICON_PATHS } from './iconCache';
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

  describe('Insertion-Order LRU Eviction', () => {
    it('should evict in Map insertion order on overflow (insertion-order LRU)', () => {
      const cache = getIconCache();

      // Fill cache to max
      for (let i = 0; i < 50; i++) {
        cache.getIcon(`test/icon-${i}.png`);
      }
      expect(cache.getCacheSize()).toBe(50);

      // Overflow — oldest insertion (icon-0) must be evicted
      cache.getIcon('test/icon-overflow.png');
      expect(cache.getCacheSize()).toBe(50);

      const stats = cache.getStats();
      expect(stats.icons[0]).toBe('test/icon-1.png'); // icon-0 evicted; icon-1 now oldest
      expect(stats.icons[stats.icons.length - 1]).toBe('test/icon-overflow.png');
      expect(stats.icons).not.toContain('test/icon-0.png');
    });

    it('should refresh recency on cache hit (delete+reinsert moves to most-recent)', () => {
      const cache = getIconCache();

      for (let i = 0; i < 50; i++) {
        cache.getIcon(`test/icon-${i}.png`);
      }

      // Re-access icon-0 — should move to end (most-recent)
      cache.getIcon('test/icon-0.png');

      // Overflow — icon-1 should now be oldest and evicted
      cache.getIcon('test/icon-new.png');
      expect(cache.getCacheSize()).toBe(50);

      const stats = cache.getStats();
      expect(stats.icons).toContain('test/icon-0.png');
      expect(stats.icons).not.toContain('test/icon-1.png');
      expect(stats.icons).toContain('test/icon-new.png');
    });
  });

  describe('Disjointness Invariant (INITIAL ∩ ADDITIONAL = ∅)', () => {
    it('INITIAL_ICON_PATHS must be disjoint from cacheWarmer ADDITIONAL_ICON_PATHS', async () => {
      // Read cacheWarmer.ts source and extract ADDITIONAL_ICON_PATHS to enforce
      // the cross-file disjointness invariant at test time.
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(path.join(__dirname, 'cacheWarmer.ts'), 'utf8');
      const match = src.match(/ADDITIONAL_ICON_PATHS\s*=\s*\[([\s\S]*?)\]\s*as const/);
      expect(match, 'ADDITIONAL_ICON_PATHS must be defined in cacheWarmer.ts').toBeTruthy();
      const additionalPaths = Array.from(match![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
      expect(additionalPaths.length).toBeGreaterThan(0);

      const initialSet = new Set<string>(INITIAL_ICON_PATHS);
      const overlap = additionalPaths.filter((p) => initialSet.has(p as string));
      expect(
        overlap,
        `INITIAL and ADDITIONAL icon sets must be disjoint, found overlap: ${overlap.join(', ')}`
      ).toEqual([]);
    });

    it('INITIAL_ICON_PATHS contains exactly the canonical first-paint icons', () => {
      expect([...INITIAL_ICON_PATHS]).toEqual([
        'resources/icons/tray/iconTemplate.png',
        'resources/icons/tray/iconTemplate@2x.png',
        'resources/icons/normal/16.png',
      ]);
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

  describe('warmCache with some empty icons', () => {
    it('should not count empty icons in loaded count', () => {
      const cache = getIconCache();
      let callCount = 0;

      // Make every other icon empty
      vi.mocked(nativeImage.createFromPath).mockImplementation(() => {
        callCount++;
        const isEmpty = callCount % 2 === 0;
        return {
          isEmpty: () => isEmpty,
          getSize: () => ({ width: isEmpty ? 0 : 16, height: isEmpty ? 0 : 16 }),
        } as ReturnType<typeof nativeImage.createFromPath>;
      });

      const loaded = cache.warmCache();

      // With 9 common icons and every other being empty,
      // loaded should be less than total
      // With 3 INITIAL icons and every other being empty, loaded should be < 3
      expect(loaded).toBeLessThan(3);
    });
  });
});
