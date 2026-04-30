/**
 * Tests for Cache Warmer
 *
 * Verifies that ADDITIONAL_ICON_PATHS (idle warmup) is the disjoint complement
 * of INITIAL_ICON_PATHS (critical-path warmup) in iconCache.ts, so that idle
 * warmup never re-fetches an icon already cached during the critical path.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import fs from 'fs';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => path.join(__dirname, '../../..'),
    getName: () => 'gogchat',
    getPath: (name: string) => `/fake/path/${name}`,
    isPackaged: false,
  },
  nativeImage: {
    createFromPath: vi.fn((_path: string) => ({
      isEmpty: () => false,
      getSize: () => ({ width: 16, height: 16 }),
    })),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Avoid pulling perfMonitor / configProfiler side effects into this unit test;
// only the functions under test are exercised.
vi.mock('./performanceMonitor.js', () => ({
  perfMonitor: { mark: vi.fn(), logSummary: vi.fn(), exportToJSON: vi.fn() },
}));
vi.mock('./resourceCleanup.js', () => ({
  createTrackedTimeout: vi.fn(),
}));
vi.mock('./configProfiler.js', () => ({
  compareStorePerformance: vi.fn(),
}));

import { warmCachesOnIdle, warmInitialIcons } from './cacheWarmer';
import { getIconCache, destroyIconCache, INITIAL_ICON_PATHS } from './iconCache';
import { nativeImage } from 'electron';

/** Extract ADDITIONAL_ICON_PATHS from cacheWarmer.ts source for test assertions. */
function readAdditionalPaths(): string[] {
  const src = fs.readFileSync(path.join(__dirname, 'cacheWarmer.ts'), 'utf8');
  const match = src.match(/ADDITIONAL_ICON_PATHS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!match) throw new Error('ADDITIONAL_ICON_PATHS not found');
  return Array.from(match[1].matchAll(/'([^']+)'/g)).map((m) => m[1] as string);
}

describe('cacheWarmer', () => {
  beforeEach(() => {
    destroyIconCache();
    vi.mocked(nativeImage.createFromPath).mockClear();
  });

  afterEach(() => {
    destroyIconCache();
  });

  describe('Disjointness Invariant', () => {
    it('ADDITIONAL_ICON_PATHS must be disjoint from INITIAL_ICON_PATHS', () => {
      const additional = readAdditionalPaths();
      const initialSet = new Set<string>(INITIAL_ICON_PATHS);
      const overlap = additional.filter((p) => initialSet.has(p));
      expect(
        overlap,
        `Found overlap between INITIAL and ADDITIONAL: ${overlap.join(', ')}`
      ).toEqual([]);
    });

    it('ADDITIONAL_ICON_PATHS contains the expected complement set', () => {
      const additional = readAdditionalPaths();
      expect(additional.sort()).toEqual(
        [
          'resources/icons/normal/32.png',
          'resources/icons/normal/64.png',
          'resources/icons/normal/256.png',
          'resources/icons/offline/16.png',
          'resources/icons/offline/32.png',
          'resources/icons/badge/16.png',
          'resources/icons/badge/32.png',
          'resources/icons/tray/iconUnreadTemplate.png',
          'resources/icons/tray/iconUnreadTemplate@2x.png',
        ].sort()
      );
    });
  });

  describe('warmCachesOnIdle', () => {
    it('does not re-fetch icons already loaded by warmInitialIcons (no overlap)', () => {
      // First, run the critical-path warmup
      warmInitialIcons();
      const initialCallCount = vi.mocked(nativeImage.createFromPath).mock.calls.length;
      expect(initialCallCount).toBe(INITIAL_ICON_PATHS.length);

      // Then, run idle warmup
      warmCachesOnIdle();
      const totalCallCount = vi.mocked(nativeImage.createFromPath).mock.calls.length;
      const additionalCallCount = totalCallCount - initialCallCount;

      // Each ADDITIONAL path triggered exactly one disk load (no INITIAL re-fetch)
      const additional = readAdditionalPaths();
      expect(additionalCallCount).toBe(additional.length);

      // Cache contains both sets, all unique
      const cache = getIconCache();
      const cachedIcons = cache.getStats().icons;
      expect(cachedIcons.length).toBe(INITIAL_ICON_PATHS.length + additional.length);
    });

    it('handles empty-image results without throwing', () => {
      vi.mocked(nativeImage.createFromPath).mockReturnValue({
        isEmpty: () => true,
        getSize: () => ({ width: 0, height: 0 }),
      } as ReturnType<typeof nativeImage.createFromPath>);

      expect(() => warmCachesOnIdle()).not.toThrow();
    });
  });
});
