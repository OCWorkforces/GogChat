/**
 * Tests for Icon Cache Manager
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {getIconCache, destroyIconCache} from './iconCache';

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
});
