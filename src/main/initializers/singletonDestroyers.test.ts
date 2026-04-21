/**
 * Unit tests for singletonDestroyers.ts
 *
 * Verifies destroyAllSingletons calls each destroyer exactly once and in
 * the expected order.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockDestroyIconCache,
  mockDestroyDeduplicator,
  mockDestroyRateLimiter,
  mockDestroyPerformanceMonitor,
} = vi.hoisted(() => ({
  mockDestroyIconCache: vi.fn(),
  mockDestroyDeduplicator: vi.fn(),
  mockDestroyRateLimiter: vi.fn(),
  mockDestroyPerformanceMonitor: vi.fn(),
}));

vi.mock('../utils/iconCache.js', () => ({
  destroyIconCache: mockDestroyIconCache,
}));

vi.mock('../utils/ipcDeduplicator.js', () => ({
  destroyDeduplicator: mockDestroyDeduplicator,
}));

vi.mock('../utils/rateLimiter.js', () => ({
  destroyRateLimiter: mockDestroyRateLimiter,
}));

vi.mock('../utils/performanceMonitor.js', () => ({
  destroyPerformanceMonitor: mockDestroyPerformanceMonitor,
}));

import { destroyAllSingletons } from './singletonDestroyers';

describe('destroyAllSingletons', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call every destroyer exactly once', () => {
    destroyAllSingletons();

    expect(mockDestroyPerformanceMonitor).toHaveBeenCalledTimes(1);
    expect(mockDestroyDeduplicator).toHaveBeenCalledTimes(1);
    expect(mockDestroyRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockDestroyIconCache).toHaveBeenCalledTimes(1);
  });

  it('should call destroyers in the documented order', () => {
    const calls: string[] = [];
    mockDestroyPerformanceMonitor.mockImplementation(() => calls.push('perf'));
    mockDestroyDeduplicator.mockImplementation(() => calls.push('dedup'));
    mockDestroyRateLimiter.mockImplementation(() => calls.push('rate'));
    mockDestroyIconCache.mockImplementation(() => calls.push('icon'));

    destroyAllSingletons();

    expect(calls).toEqual(['perf', 'dedup', 'rate', 'icon']);
  });

  it('should propagate errors so callers can wrap in try/catch', () => {
    mockDestroyPerformanceMonitor.mockImplementation(() => {
      throw new Error('perf boom');
    });

    expect(() => destroyAllSingletons()).toThrow('perf boom');
  });
});
