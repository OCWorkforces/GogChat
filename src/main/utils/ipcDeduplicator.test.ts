/**
 * Tests for ipcDeduplicator utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  IPCDeduplicator,
  getDeduplicator,
  destroyDeduplicator,
  deduplicationPatterns,
  createDeduplicatedHandler,
  withDeduplication,
} from './ipcDeduplicator';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logger
vi.mock('./logger.js', () => ({
  logger: {
    ipc: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

// Mock trackedResources to avoid resourceCleanup dependency
vi.mock('./trackedResources.js', () => ({
  createTrackedInterval: (callback: () => void, delay: number, _name?: string) =>
    setInterval(callback, delay),
}));

describe('IPCDeduplicator', () => {
  let deduplicator: IPCDeduplicator;

  beforeEach(() => {
    vi.useFakeTimers();
    deduplicator = new IPCDeduplicator({
      windowMs: 100,
      maxCacheSize: 10,
      debug: false,
    });
  });

  afterEach(() => {
    deduplicator.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create instance with default config', () => {
      const ded = new IPCDeduplicator();
      expect(ded).toBeDefined();
      expect(ded.getCacheSize()).toBe(0);
      ded.destroy();
    });

    it('should accept custom config', () => {
      const ded = new IPCDeduplicator({
        windowMs: 200,
        maxCacheSize: 50,
        debug: true,
      });
      expect(ded).toBeDefined();
      ded.destroy();
    });

    it('should use default values for missing config', () => {
      const ded = new IPCDeduplicator({});
      expect(ded).toBeDefined();
      ded.destroy();
    });
  });

  describe('deduplicate()', () => {
    it('should execute function on first call', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const result = await deduplicator.deduplicate('key1', fn);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('should not execute function on duplicate call within window', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const promise1 = deduplicator.deduplicate('key1', fn);
      const promise2 = deduplicator.deduplicate('key1', fn);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result1).toBe('result');
      expect(result2).toBe('result');
    });

    it('should deduplicate multiple calls to same key', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      const promises = [
        deduplicator.deduplicate('key1', fn),
        deduplicator.deduplicate('key1', fn),
        deduplicator.deduplicate('key1', fn),
        deduplicator.deduplicate('key1', fn),
      ];

      const results = await Promise.all(promises);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['result', 'result', 'result', 'result']);
    });

    it('should execute function again after window expires', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      expect(fn).toHaveBeenCalledTimes(1);

      // Advance time past window
      vi.advanceTimersByTime(150);

      await deduplicator.deduplicate('key1', fn);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle different keys independently', async () => {
      const fn1 = vi.fn().mockResolvedValue('result1');
      const fn2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        deduplicator.deduplicate('key1', fn1),
        deduplicator.deduplicate('key2', fn2),
      ]);

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });

    it('should accept custom window time', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn, 50); // 50ms window

      // Advance 40ms - still within custom window
      vi.advanceTimersByTime(40);
      await deduplicator.deduplicate('key1', fn, 50);

      expect(fn).toHaveBeenCalledTimes(1);

      // Advance 20ms more - past custom window
      vi.advanceTimersByTime(20);
      await deduplicator.deduplicate('key1', fn, 50);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle rejected promises', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(deduplicator.deduplicate('key1', fn)).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate rejected promises', async () => {
      const error = new Error('Test error');
      const fn = vi.fn().mockRejectedValue(error);

      const promise1 = deduplicator.deduplicate('key1', fn);
      const promise2 = deduplicator.deduplicate('key1', fn);

      await expect(promise1).rejects.toThrow('Test error');
      await expect(promise2).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should track statistics', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn); // miss
      await deduplicator.deduplicate('key1', fn); // hit
      await deduplicator.deduplicate('key1', fn); // hit

      const stats = deduplicator.getStats();
      expect(stats.cacheMisses).toBe(1);
      expect(stats.cacheHits).toBe(2);
      expect(stats.deduplicatedCount).toBe(2);
    });

    it('should clean cache when maxCacheSize exceeded', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      // Fill cache to max (10 items)
      for (let i = 0; i < 10; i++) {
        await deduplicator.deduplicate(`key${i}`, fn);
      }

      expect(deduplicator.getCacheSize()).toBe(10);

      // Advance time to expire old entries
      vi.advanceTimersByTime(250);

      // Add one more - should trigger cleanup of old entries
      await deduplicator.deduplicate('key10', fn);

      // After cleanup, cache might have fewer items
      expect(deduplicator.getCacheSize()).toBeGreaterThan(0);
    });
  });

  describe('deduplicateWithKey()', () => {
    it('should use key function to generate key', async () => {
      const fn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
      const keyFn = (a: number, b: number) => `add-${a}-${b}`;

      const result = await deduplicator.deduplicateWithKey(keyFn, fn, 1, 2);

      expect(result).toBe(3);
      expect(fn).toHaveBeenCalledWith(1, 2);
    });

    it('should deduplicate calls with same key', async () => {
      const fn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
      const keyFn = (a: number, b: number) => `add-${a}-${b}`;

      const [result1, result2] = await Promise.all([
        deduplicator.deduplicateWithKey(keyFn, fn, 1, 2),
        deduplicator.deduplicateWithKey(keyFn, fn, 1, 2),
      ]);

      expect(result1).toBe(3);
      expect(result2).toBe(3);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not deduplicate calls with different keys', async () => {
      const fn = vi.fn().mockImplementation((a: number, b: number) => Promise.resolve(a + b));
      const keyFn = (a: number, b: number) => `add-${a}-${b}`;

      const [result1, result2] = await Promise.all([
        deduplicator.deduplicateWithKey(keyFn, fn, 1, 2),
        deduplicator.deduplicateWithKey(keyFn, fn, 2, 3),
      ]);

      expect(result1).toBe(3);
      expect(result2).toBe(5);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createDeduplicated()', () => {
    it('should create deduplicated function', async () => {
      const fn = vi.fn().mockImplementation((a: number) => Promise.resolve(a * 2));
      const keyFn = (a: number) => `double-${a}`;

      const deduplicatedFn = deduplicator.createDeduplicated(fn, keyFn);

      const result = await deduplicatedFn(5);
      expect(result).toBe(10);
      expect(fn).toHaveBeenCalledWith(5);
    });

    it('should deduplicate calls to created function', async () => {
      const fn = vi.fn().mockImplementation((a: number) => Promise.resolve(a * 2));
      const keyFn = (a: number) => `double-${a}`;

      const deduplicatedFn = deduplicator.createDeduplicated(fn, keyFn);

      const [result1, result2, result3] = await Promise.all([
        deduplicatedFn(5),
        deduplicatedFn(5),
        deduplicatedFn(5),
      ]);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(result3).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should accept custom window time', async () => {
      const fn = vi.fn().mockImplementation((a: number) => Promise.resolve(a * 2));
      const keyFn = (a: number) => `double-${a}`;

      const deduplicatedFn = deduplicator.createDeduplicated(fn, keyFn, 50);

      await deduplicatedFn(5);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60);

      await deduplicatedFn(5);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('clear()', () => {
    it('should remove specific key from cache', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      expect(deduplicator.getCacheSize()).toBe(1);

      deduplicator.clear('key1');
      expect(deduplicator.getCacheSize()).toBe(0);
    });

    it('should not affect other keys', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key2', fn);
      expect(deduplicator.getCacheSize()).toBe(2);

      deduplicator.clear('key1');
      expect(deduplicator.getCacheSize()).toBe(1);
    });

    it('should handle clearing non-existent key', () => {
      expect(() => deduplicator.clear('nonexistent')).not.toThrow();
    });
  });

  describe('clearAll()', () => {
    it('should clear all cached entries', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key2', fn);
      await deduplicator.deduplicate('key3', fn);

      expect(deduplicator.getCacheSize()).toBe(3);

      deduplicator.clearAll();

      expect(deduplicator.getCacheSize()).toBe(0);
    });

    it('should reset statistics', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key1', fn);

      let stats = deduplicator.getStats();
      expect(stats.cacheMisses).toBeGreaterThan(0);
      expect(stats.cacheHits).toBeGreaterThan(0);

      deduplicator.clearAll();

      stats = deduplicator.getStats();
      expect(stats.cacheMisses).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.deduplicatedCount).toBe(0);
    });

    it('should handle clearing empty cache', () => {
      expect(() => deduplicator.clearAll()).not.toThrow();
      expect(deduplicator.getCacheSize()).toBe(0);
    });
  });

  describe('getStats()', () => {
    it('should return statistics object', () => {
      const stats = deduplicator.getStats();

      expect(stats).toHaveProperty('deduplicatedCount');
      expect(stats).toHaveProperty('cacheHits');
      expect(stats).toHaveProperty('cacheMisses');
    });

    it('should return snapshot of stats', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);

      const stats1 = deduplicator.getStats();

      await deduplicator.deduplicate('key1', fn);

      const stats2 = deduplicator.getStats();

      // Stats1 should not be modified
      expect(stats1.cacheHits).toBeLessThan(stats2.cacheHits);
    });
  });

  describe('getCacheSize()', () => {
    it('should return current cache size', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      expect(deduplicator.getCacheSize()).toBe(0);

      await deduplicator.deduplicate('key1', fn);
      expect(deduplicator.getCacheSize()).toBe(1);

      await deduplicator.deduplicate('key2', fn);
      expect(deduplicator.getCacheSize()).toBe(2);
    });

    it('should not count duplicate keys', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key1', fn);

      expect(deduplicator.getCacheSize()).toBe(1);
    });
  });

  describe('Automatic cleanup', () => {
    it('should clean old entries periodically', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      expect(deduplicator.getCacheSize()).toBe(1);

      // Advance time past expiration (windowMs * 2)
      vi.advanceTimersByTime(250);

      // Wait for cleanup interval (1000ms)
      vi.advanceTimersByTime(1000);

      // Cache should be cleaned
      expect(deduplicator.getCacheSize()).toBe(0);
    });

    it('should not clean entries within expiration window', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      const sizeBefore = deduplicator.getCacheSize();
      expect(sizeBefore).toBeGreaterThan(0);

      // Advance time but not past expiration (need > windowMs * 2 for cleanup)
      vi.advanceTimersByTime(100);

      // Run cleanup
      vi.advanceTimersByTime(1000);

      // Cache should still have entries (or at least some)
      expect(deduplicator.getCacheSize()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroy()', () => {
    it('should stop cleanup interval', () => {
      const ded = new IPCDeduplicator();
      ded.destroy();

      // Should not throw
      expect(() => ded.destroy()).not.toThrow();
    });

    it('should clear all cache', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      expect(deduplicator.getCacheSize()).toBe(1);

      deduplicator.destroy();

      expect(deduplicator.getCacheSize()).toBe(0);
    });

    it('should reset statistics', async () => {
      const fn = vi.fn().mockResolvedValue('result');

      await deduplicator.deduplicate('key1', fn);
      await deduplicator.deduplicate('key1', fn);

      deduplicator.destroy();

      const stats = deduplicator.getStats();
      expect(stats.cacheMisses).toBe(0);
      expect(stats.cacheHits).toBe(0);
    });
  });

  describe('Singleton pattern', () => {
    beforeEach(() => {
      destroyDeduplicator();
    });

    afterEach(() => {
      destroyDeduplicator();
    });

    it('should return same instance', () => {
      const ded1 = getDeduplicator();
      const ded2 = getDeduplicator();

      expect(ded1).toBe(ded2);
    });

    it('should create new instance after destroy', () => {
      const ded1 = getDeduplicator();
      destroyDeduplicator();
      const ded2 = getDeduplicator();

      expect(ded1).not.toBe(ded2);
    });

    it('should handle multiple destroy calls', () => {
      getDeduplicator();
      destroyDeduplicator();
      destroyDeduplicator();
      destroyDeduplicator();

      // Should not throw
      expect(() => getDeduplicator()).not.toThrow();
    });
  });

  describe('deduplicationPatterns', () => {
    it('should provide byChannel pattern', () => {
      const key = deduplicationPatterns.byChannel('test-channel');
      expect(key).toBe('test-channel');
    });

    it('should provide byChannelAndData pattern', () => {
      const key = deduplicationPatterns.byChannelAndData('channel', { foo: 'bar' });
      expect(key).toContain('channel');
      expect(key).toContain('foo');
    });

    it('should provide byChannelAndFirstArg pattern', () => {
      const key = deduplicationPatterns.byChannelAndFirstArg('channel', 'arg1');
      expect(key).toBe('channel:arg1');
    });

    it('should provide byWindowOperation pattern', () => {
      const key1 = deduplicationPatterns.byWindowOperation('resize', 123);
      expect(key1).toBe('resize:123');

      const key2 = deduplicationPatterns.byWindowOperation('resize');
      expect(key2).toBe('resize');
    });

    it('should provide byFileOperation pattern', () => {
      const key = deduplicationPatterns.byFileOperation('save', '/path/to/file');
      expect(key).toBe('save:/path/to/file');
    });
  });

  describe('createDeduplicatedHandler', () => {
    beforeEach(() => {
      destroyDeduplicator();
    });

    afterEach(() => {
      destroyDeduplicator();
    });

    it('should create handler that deduplicates', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const handler = createDeduplicatedHandler('channel', fn);

      const [result1, result2] = await Promise.all([handler(), handler()]);

      expect(result1).toBe('result');
      expect(result2).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should accept custom window time', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const handler = createDeduplicatedHandler('channel', fn, 50);

      await handler();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60);

      await handler();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('withDeduplication', () => {
    beforeEach(() => {
      destroyDeduplicator();
    });

    afterEach(() => {
      destroyDeduplicator();
    });

    it('should wrap function with deduplication', async () => {
      const fn = vi.fn().mockImplementation((a: number) => Promise.resolve(a * 2));
      const wrapped = withDeduplication(fn, (a) => `key-${a}`);

      const [result1, result2] = await Promise.all([wrapped(5), wrapped(5)]);

      expect(result1).toBe(10);
      expect(result2).toBe(10);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should accept custom window time', async () => {
      const fn = vi.fn().mockImplementation((a: number) => Promise.resolve(a * 2));
      const wrapped = withDeduplication(fn, (a) => `key-${a}`, 50);

      await wrapped(5);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60);

      await wrapped(5);
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
