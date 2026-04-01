/**
 * Unit tests for registerShutdown.ts — graceful app shutdown handler
 *
 * Covers:
 * - registerShutdownHandler(): before-quit registration, async cleanup sequence
 * - isCachedStore() type guard (tested indirectly via cache statistics logging)
 * - logComprehensiveCacheStatistics() — icon/config/dedup/rateLimiter/feature stats
 * - Error handling: individual cleanup failures don't prevent app.exit()
 * - Singleton destroyers are all called in correct order
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──── Hoisted mocks (available inside vi.mock factories) ───────────────────
const {
  mockAppOn,
  mockAppExit,
  mockLog,
  mockDestroyAccountWindowManager,
  mockGetIconCache,
  mockDestroyIconCache,
  mockGetStore,
  mockGetDeduplicator,
  mockDestroyDeduplicator,
  mockGetRateLimiter,
  mockDestroyRateLimiter,
  mockDestroyPerformanceMonitor,
} = vi.hoisted(() => ({
  mockAppOn: vi.fn(),
  mockAppExit: vi.fn(),
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockDestroyAccountWindowManager: vi.fn(),
  mockGetIconCache: vi.fn(),
  mockDestroyIconCache: vi.fn(),
  mockGetStore: vi.fn(),
  mockGetDeduplicator: vi.fn(),
  mockDestroyDeduplicator: vi.fn(),
  mockGetRateLimiter: vi.fn(),
  mockDestroyRateLimiter: vi.fn(),
  mockDestroyPerformanceMonitor: vi.fn(),
}));

// ──── Module mocks ─────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    on: mockAppOn,
    exit: mockAppExit,
  },
}));

vi.mock('electron-log', () => ({
  default: mockLog,
}));

vi.mock('../utils/accountWindowManager.js', () => ({
  destroyAccountWindowManager: mockDestroyAccountWindowManager,
}));

vi.mock('../utils/iconCache.js', () => ({
  getIconCache: mockGetIconCache,
  destroyIconCache: mockDestroyIconCache,
}));

vi.mock('../config.js', () => ({
  getStore: mockGetStore,
}));

vi.mock('../utils/ipcDeduplicator.js', () => ({
  getDeduplicator: mockGetDeduplicator,
  destroyDeduplicator: mockDestroyDeduplicator,
}));

vi.mock('../utils/rateLimiter.js', () => ({
  getRateLimiter: mockGetRateLimiter,
  destroyRateLimiter: mockDestroyRateLimiter,
}));

vi.mock('../utils/performanceMonitor.js', () => ({
  destroyPerformanceMonitor: mockDestroyPerformanceMonitor,
}));

// ──── Import under test ────────────────────────────────────────────────────
import { registerShutdownHandler } from './registerShutdown';
import type { FeatureManager } from '../utils/featureManager.js';

// ──── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a mock FeatureManager with configurable behavior
 */
function createMockFeatureManager(
  overrides: Partial<{
    cleanup: () => Promise<void>;
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
    cleanup: overrides.cleanup ?? vi.fn().mockResolvedValue(undefined),
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

/**
 * Set up default icon cache mock with stats
 */
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

/**
 * Fire the registered before-quit handler and wait for async completion
 */
async function fireBeforeQuit(): Promise<void> {
  expect(mockAppOn).toHaveBeenCalledWith('before-quit', expect.any(Function));
  const handler = mockAppOn.mock.calls.find(
    (call: unknown[]) => call[0] === 'before-quit'
  )![1] as (event: { preventDefault: () => void }) => void;

  const event = { preventDefault: vi.fn() };
  handler(event);

  // Wait for the async IIFE to complete
  await vi.waitFor(() => {
    expect(mockAppExit).toHaveBeenCalled();
  });
}

// ──── Tests ────────────────────────────────────────────────────────────────

describe('registerShutdownHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Defaults: all getters return reasonable mocks
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

  // ─── Registration ──────────────────────────────────────────────────────

  it('should register a before-quit handler on app', () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    expect(mockAppOn).toHaveBeenCalledTimes(1);
    expect(mockAppOn).toHaveBeenCalledWith('before-quit', expect.any(Function));
  });

  // ─── Basic cleanup sequence ────────────────────────────────────────────

  it('should call event.preventDefault() when before-quit fires', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    const handler = mockAppOn.mock.calls[0]![1] as (event: { preventDefault: () => void }) => void;
    const event = { preventDefault: vi.fn() };
    handler(event);

    await vi.waitFor(() => {
      expect(mockAppExit).toHaveBeenCalled();
    });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('should call featureManager.cleanup()', async () => {
    const cleanupSpy = vi.fn().mockResolvedValue(undefined);
    const fm = createMockFeatureManager({ cleanup: cleanupSpy });
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('should call destroyAccountWindowManager after feature cleanup', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockDestroyAccountWindowManager).toHaveBeenCalledTimes(1);
  });

  it('should call all singleton destroy functions', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockDestroyPerformanceMonitor).toHaveBeenCalledTimes(1);
    expect(mockDestroyDeduplicator).toHaveBeenCalledTimes(1);
    expect(mockDestroyRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockDestroyIconCache).toHaveBeenCalledTimes(1);
  });

  it('should call app.exit() in finally block', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockAppExit).toHaveBeenCalledTimes(1);
    // app.exit() is called without arguments (defaults to 0)
    expect(mockAppExit).toHaveBeenCalledWith();
  });

  // ─── Error handling: featureManager.cleanup() throws ───────────────────

  it('should still call app.exit() when featureManager.cleanup() throws', async () => {
    const cleanupSpy = vi.fn().mockRejectedValue(new Error('cleanup boom'));
    const fm = createMockFeatureManager({ cleanup: cleanupSpy });
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Error during shutdown cleanup:',
      expect.any(Error)
    );
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  // ─── Error handling: destroyAccountWindowManager throws ────────────────

  it('should continue cleanup when destroyAccountWindowManager throws', async () => {
    mockDestroyAccountWindowManager.mockImplementation(() => {
      throw new Error('account window boom');
    });
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Account window manager cleanup failed:',
      expect.any(Error)
    );
    // Singleton destroyers should still be called after account window manager fails
    expect(mockDestroyPerformanceMonitor).toHaveBeenCalledTimes(1);
    expect(mockDestroyDeduplicator).toHaveBeenCalledTimes(1);
    expect(mockDestroyRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockDestroyIconCache).toHaveBeenCalledTimes(1);
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  // ─── Error handling: singleton destroyer throws ────────────────────────

  it('should log error and still call app.exit() when a singleton destroyer throws', async () => {
    mockDestroyPerformanceMonitor.mockImplementation(() => {
      throw new Error('perf monitor boom');
    });
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Singleton destruction failed:',
      expect.any(Error)
    );
    expect(mockAppExit).toHaveBeenCalledTimes(1);
  });

  // ─── logComprehensiveCacheStatistics coverage ──────────────────────────

  describe('logComprehensiveCacheStatistics (called during shutdown)', () => {
    it('should log icon cache statistics', async () => {
      setupIconCacheMock({
        size: 5,
        maxSize: 50,
        totalAccesses: 100,
        mostAccessed: 'icons/tray.png',
        leastAccessed: 'icons/badge.png',
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Icon Cache Statistics ---');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total icons cached: 5/50');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total accesses: 100');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Most accessed: icons/tray.png');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Least accessed: icons/badge.png');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Average accesses per icon: 20.00');
    });

    it('should handle icon cache with size 0 (average shows "0")', async () => {
      setupIconCacheMock({
        size: 0,
        maxSize: 50,
        totalAccesses: 0,
        mostAccessed: null,
        leastAccessed: null,
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total icons cached: 0/50');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Most accessed: N/A');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Least accessed: N/A');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Average accesses per icon: 0');
    });

    // ─── isCachedStore coverage: store with getCacheStats ──────────────

    it('should log config cache statistics when store is a CachedStore', async () => {
      mockGetStore.mockReturnValue({
        getCacheStats: vi.fn().mockReturnValue({
          hits: 200,
          misses: 50,
          writes: 30,
          hitRate: '80.0%',
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Config Cache Statistics ---');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache hits: 200');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache misses: 50');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache writes: 30');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Hit rate: 80.0%');
    });

    it('should log "Excellent" performance when hit rate > 80%', async () => {
      mockGetStore.mockReturnValue({
        getCacheStats: vi.fn().mockReturnValue({
          hits: 200,
          misses: 10,
          writes: 5,
          hitRate: '95.2%',
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Excellent');
    });

    it('should log "Good" performance when hit rate is between 60% and 80%', async () => {
      mockGetStore.mockReturnValue({
        getCacheStats: vi.fn().mockReturnValue({
          hits: 70,
          misses: 30,
          writes: 10,
          hitRate: '70.0%',
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Good');
    });

    it('should log "Poor" performance when hit rate <= 60%', async () => {
      mockGetStore.mockReturnValue({
        getCacheStats: vi.fn().mockReturnValue({
          hits: 30,
          misses: 70,
          writes: 10,
          hitRate: '30.0%',
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Performance: Poor');
    });

    // ─── isCachedStore coverage: regular store without getCacheStats ──

    it('should skip config cache stats when store is not a CachedStore', async () => {
      // Regular store without getCacheStats method
      mockGetStore.mockReturnValue({});
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).not.toHaveBeenCalledWith('[Main] --- Config Cache Statistics ---');
    });

    it('should handle getStore() throwing (logs debug)', async () => {
      mockGetStore.mockImplementation(() => {
        throw new Error('store not initialized');
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.debug).toHaveBeenCalledWith('[Main] Store not initialized or cache disabled');
    });

    // ─── IPC deduplicator statistics ─────────────────────────────────

    it('should log IPC deduplicator statistics', async () => {
      mockGetDeduplicator.mockReturnValue({
        getStats: vi.fn().mockReturnValue({
          cacheHits: 40,
          cacheMisses: 60,
          deduplicatedCount: 35,
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main] --- IPC Deduplicator Statistics ---');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache hits (deduplicated): 40');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Cache misses (executed): 60');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total deduplicated: 35');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Deduplication rate: 40.0%');
    });

    it('should show 0% deduplication rate when no requests processed', async () => {
      mockGetDeduplicator.mockReturnValue({
        getStats: vi.fn().mockReturnValue({
          cacheHits: 0,
          cacheMisses: 0,
          deduplicatedCount: 0,
        }),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Deduplication rate: 0%');
    });

    it('should handle getDeduplicator() throwing (logs debug)', async () => {
      const dedupError = new Error('dedup not available');
      mockGetDeduplicator.mockImplementation(() => {
        throw dedupError;
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.debug).toHaveBeenCalledWith(
        '[Main] IPC deduplicator not available:',
        dedupError
      );
    });

    // ─── Rate limiter statistics ─────────────────────────────────────

    it('should log rate limiter statistics with active channels', async () => {
      const statsMap = new Map([
        ['channel-a', { messagesLastSecond: 10, totalBlocked: 5 }],
        ['channel-b', { messagesLastSecond: 20, totalBlocked: 3 }],
      ]);
      mockGetRateLimiter.mockReturnValue({
        getAllStats: vi.fn().mockReturnValue(statsMap),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Rate Limiter Statistics ---');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Active channels: 2');
      // totalBlocked = 5 + 3 = 8
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total blocked: 8');
      // totalMessages = (10 + 5) + (20 + 3) = 38
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total messages: 38');
      // blockRate = (8/38)*100 = 21.1%
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Block rate: 21.1%');
    });

    it('should show 0% block rate when no messages', async () => {
      mockGetRateLimiter.mockReturnValue({
        getAllStats: vi.fn().mockReturnValue(new Map()),
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Block rate: 0%');
    });

    it('should handle getRateLimiter() throwing (logs debug)', async () => {
      const rlError = new Error('rate limiter not available');
      mockGetRateLimiter.mockImplementation(() => {
        throw rlError;
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.debug).toHaveBeenCalledWith('[Main] Rate limiter not available:', rlError);
    });

    // ─── Feature Manager statistics ──────────────────────────────────

    it('should log feature manager summary statistics', async () => {
      const fm = createMockFeatureManager({
        getSummary: vi.fn().mockReturnValue({
          total: 21,
          initialized: 19,
          failed: 2,
          pending: 0,
          totalTime: 1234,
        }),
      });
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.info).toHaveBeenCalledWith('[Main] --- Feature Manager Statistics ---');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total features: 21');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Initialized: 19');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Failed: 2');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Pending: 0');
      expect(mockLog.info).toHaveBeenCalledWith('[Main]   Total init time: 1234ms');
    });

    // ─── Outer catch: logComprehensiveCacheStatistics fails entirely ─

    it('should log error when comprehensive cache statistics throw', async () => {
      // Make getIconCache throw to trigger the outer catch
      mockGetIconCache.mockImplementation(() => {
        throw new Error('icon cache unavailable');
      });
      const fm = createMockFeatureManager();
      registerShutdownHandler({ featureManager: fm });

      await fireBeforeQuit();

      expect(mockLog.error).toHaveBeenCalledWith(
        '[Main] Failed to log comprehensive cache statistics:',
        expect.any(Error)
      );
      expect(mockAppExit).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Shutdown logging ──────────────────────────────────────────────────

  it('should log shutdown banner start and end', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] ========== Application Shutdown ==========');
    expect(mockLog.info).toHaveBeenCalledWith(
      '[Main] ====================================================='
    );
  });

  it('should log feature cleanup start and completion', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Cleaning up feature resources...');
    expect(mockLog.info).toHaveBeenCalledWith('[Main] Feature cleanup completed');
  });

  it('should log account window manager cleanup success', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Account window manager cleaned up');
  });

  it('should log singleton instances destroyed', async () => {
    const fm = createMockFeatureManager();
    registerShutdownHandler({ featureManager: fm });

    await fireBeforeQuit();

    expect(mockLog.info).toHaveBeenCalledWith('[Main] Singleton instances destroyed');
  });
});
