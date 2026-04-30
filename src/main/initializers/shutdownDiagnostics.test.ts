/**
 * Unit tests for shutdownDiagnostics.ts
 *
 * Covers:
 * - logShutdownDiagnostics(): icon/config/dedup/rateLimiter/feature stats
 * - isCachedStore() type guard (tested indirectly via cache statistics logging)
 * - Error handling: individual stat failures only log debug
 * - Outer catch: a top-level failure logs an error but does not throw
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──── Hoisted mocks ────────────────────────────────────────────────────────
const { mockLog, mockGetIconCache, mockGetStore, mockGetDeduplicator, mockGetRateLimiter } =
  vi.hoisted(() => ({
    mockLog: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    mockGetIconCache: vi.fn(),
    mockGetStore: vi.fn(),
    mockGetDeduplicator: vi.fn(),
    mockGetRateLimiter: vi.fn(),
  }));

// ──── Module mocks ─────────────────────────────────────────────────────────
vi.mock('electron-log', () => ({
  default: mockLog,
}));

vi.mock('../utils/iconCache.js', () => ({
  getIconCache: mockGetIconCache,
}));

vi.mock('../config.js', () => ({
  getStore: mockGetStore,
}));

vi.mock('../utils/ipcDeduplicator.js', () => ({
  getDeduplicator: mockGetDeduplicator,
}));

vi.mock('../utils/rateLimiter.js', () => ({
  getRateLimiter: mockGetRateLimiter,
}));

// ──── Import under test ────────────────────────────────────────────────────
import { logShutdownDiagnostics } from './shutdownDiagnostics';
import type { FeatureManager } from '../utils/featureManager.js';

// ──── Helpers ──────────────────────────────────────────────────────────────

function createMockFeatureManager(
  overrides: Partial<{
    getSummary: () => {
      total: number;
      initialized: number;
      failed: number;
      pending: number;
      totalTime: number;
    };
  }> = {}
): FeatureManager {
  return {
    getSummary:
      overrides.getSummary ??
      vi.fn().mockReturnValue({
        total: 10,
        initialized: 8,
        failed: 1,
        pending: 1,
        totalTime: 500,
      }),
  } as unknown as FeatureManager;
}

function setupIconCacheMock(
  stats: {
    size: number;
    maxSize: number;
    totalAccesses: number;
    mostAccessed: string | null;
    leastAccessed: string | null;
  } = {
    size: 5,
    maxSize: 50,
    totalAccesses: 100,
    mostAccessed: 'icons/tray.png',
    leastAccessed: 'icons/badge.png',
  }
): void {
  mockGetIconCache.mockReturnValue({
    getStats: vi.fn().mockReturnValue(stats),
  });
}

// ──── Tests ────────────────────────────────────────────────────────────────

describe('logShutdownDiagnostics', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupIconCacheMock();
    mockGetStore.mockReturnValue({});
    mockGetDeduplicator.mockReturnValue({
      getStats: vi.fn().mockReturnValue({
        cacheHits: 20,
        cacheMisses: 80,
        deduplicatedCount: 15,
      }),
    });
    mockGetRateLimiter.mockReturnValue({
      getAllStats: vi.fn().mockReturnValue(new Map()),
    });
  });

  // ─── Icon cache statistics ──────────────────────────────────────────────

  it('should log icon cache statistics', () => {
    setupIconCacheMock({
      size: 5,
      maxSize: 50,
      totalAccesses: 100,
      mostAccessed: 'icons/tray.png',
      leastAccessed: 'icons/badge.png',
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Icon Cache Statistics ---');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total icons cached: 5/50');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total accesses: 100');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Most accessed: icons/tray.png');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Least accessed: icons/badge.png');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Average accesses per icon: 20.00');
  });

  it('should handle icon cache with size 0 (average shows "0")', () => {
    setupIconCacheMock({
      size: 0,
      maxSize: 50,
      totalAccesses: 0,
      mostAccessed: null,
      leastAccessed: null,
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total icons cached: 0/50');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Most accessed: N/A');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Least accessed: N/A');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Average accesses per icon: 0');
  });

  // ─── isCachedStore: store with getCacheStats ───────────────────────────

  it('should log config cache statistics when store is a CachedStore', () => {
    mockGetStore.mockReturnValue({
      getCacheStats: vi.fn().mockReturnValue({
        hits: 200,
        misses: 50,
        writes: 30,
        hitRate: '80.0%',
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Config Cache Statistics ---');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache hits: 200');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache misses: 50');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache writes: 30');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Hit rate: 80.0%');
  });

  it('should log "Excellent" performance when hit rate > 80%', () => {
    mockGetStore.mockReturnValue({
      getCacheStats: vi.fn().mockReturnValue({
        hits: 200,
        misses: 10,
        writes: 5,
        hitRate: '95.2%',
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Excellent');
  });

  it('should log "Good" performance when hit rate is between 60% and 80%', () => {
    mockGetStore.mockReturnValue({
      getCacheStats: vi.fn().mockReturnValue({
        hits: 70,
        misses: 30,
        writes: 10,
        hitRate: '70.0%',
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Good');
  });

  it('should log "Poor" performance when hit rate <= 60%', () => {
    mockGetStore.mockReturnValue({
      getCacheStats: vi.fn().mockReturnValue({
        hits: 30,
        misses: 70,
        writes: 10,
        hitRate: '30.0%',
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Poor');
  });

  // ─── isCachedStore: regular store without getCacheStats ────────────────

  it('should skip config cache stats when store is not a CachedStore', () => {
    mockGetStore.mockReturnValue({});

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).not.toHaveBeenCalledWith('[Main] --- Config Cache Statistics ---');
  });

  it('should handle getStore() throwing (logs debug)', () => {
    mockGetStore.mockImplementation(() => {
      throw new Error('store not initialized');
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.debug).toHaveBeenCalledWith('[Main] Store not initialized or cache disabled');
  });

  // ─── IPC deduplicator statistics ───────────────────────────────────────

  it('should log IPC deduplicator statistics', () => {
    mockGetDeduplicator.mockReturnValue({
      getStats: vi.fn().mockReturnValue({
        cacheHits: 40,
        cacheMisses: 60,
        deduplicatedCount: 35,
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main] --- IPC Deduplicator Statistics ---');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache hits (deduplicated): 40');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache misses (executed): 60');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total deduplicated: 35');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Deduplication rate: 40.0%');
  });

  it('should show 0% deduplication rate when no requests processed', () => {
    mockGetDeduplicator.mockReturnValue({
      getStats: vi.fn().mockReturnValue({
        cacheHits: 0,
        cacheMisses: 0,
        deduplicatedCount: 0,
      }),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Deduplication rate: 0%');
  });

  it('should handle getDeduplicator() throwing (logs debug)', () => {
    const dedupError = new Error('dedup not available');
    mockGetDeduplicator.mockImplementation(() => {
      throw dedupError;
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.debug).toHaveBeenCalledWith(
      '[Main] IPC deduplicator not available:',
      dedupError
    );
  });

  // ─── Rate limiter statistics ───────────────────────────────────────────

  it('should log rate limiter statistics with active channels', () => {
    const statsMap = new Map([
      ['channel-a', { messagesLastSecond: 10, totalBlocked: 5 }],
      ['channel-b', { messagesLastSecond: 20, totalBlocked: 3 }],
    ]);
    mockGetRateLimiter.mockReturnValue({
      getAllStats: vi.fn().mockReturnValue(statsMap),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Rate Limiter Statistics ---');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Active channels: 2');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total blocked: 8');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total messages: 38');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Block rate: 21.1%');
  });

  it('should show 0% block rate when no messages', () => {
    mockGetRateLimiter.mockReturnValue({
      getAllStats: vi.fn().mockReturnValue(new Map()),
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Block rate: 0%');
  });

  it('should handle getRateLimiter() throwing (logs debug)', () => {
    const rlError = new Error('rate limiter not available');
    mockGetRateLimiter.mockImplementation(() => {
      throw rlError;
    });

    logShutdownDiagnostics(createMockFeatureManager());

    expect(mockLog.debug).toHaveBeenCalledWith('[Main] Rate limiter not available:', rlError);
  });

  // ─── Feature manager statistics ────────────────────────────────────────

  it('should log feature manager summary statistics', () => {
    const fm = createMockFeatureManager({
      getSummary: vi.fn().mockReturnValue({
        total: 21,
        initialized: 19,
        failed: 2,
        pending: 0,
        totalTime: 1234,
      }),
    });

    logShutdownDiagnostics(fm);

    expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Feature Manager Statistics ---');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total features: 21');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Initialized: 19');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Failed: 2');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Pending: 0');
    expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total init time: 1234ms');
  });

  // ─── Outer catch: top-level failure ────────────────────────────────────

  it('should log error when comprehensive cache statistics throw', () => {
    mockGetIconCache.mockImplementation(() => {
      throw new Error('icon cache unavailable');
    });

    expect(() => logShutdownDiagnostics(createMockFeatureManager())).not.toThrow();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Failed to log comprehensive cache statistics:',
      expect.any(Error)
    );
  });
});
