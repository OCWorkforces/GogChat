/**
 * Unit tests for badgeIcon feature (thin registration layer).
 *
 * Tests delegation to setupBadgeHandlers and the cleanupBadgeIcon API.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: { setBadgeCount: vi.fn() },
  BrowserWindow: vi.fn(),
  Tray: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

const faviconCleanup = vi.fn();
const unreadCleanup = vi.fn();
const setupBadgeHandlers = vi.fn(() => ({ faviconCleanup, unreadCleanup }));

vi.mock('./badgeHandlers.js', () => ({
  setupBadgeHandlers: (...args: unknown[]) =>
    setupBadgeHandlers(...(args as Parameters<typeof setupBadgeHandlers>)),
}));

function fakeWindow() {
  return {} as unknown as Electron.BrowserWindow;
}
function fakeTray() {
  return {} as unknown as Electron.Tray;
}

describe('badgeIcon feature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    setupBadgeHandlers.mockReturnValue({ faviconCleanup, unreadCleanup });
  });

  describe('default export', () => {
    it('delegates handler setup to setupBadgeHandlers', async () => {
      const win = fakeWindow();
      const tray = fakeTray();
      const feature = await import('./badgeIcon.js');

      feature.default(win, tray);

      expect(setupBadgeHandlers).toHaveBeenCalledWith(win, tray);
    });

    it('returns void (cleanup is via named export)', async () => {
      const feature = await import('./badgeIcon.js');
      const result = feature.default(fakeWindow(), fakeTray());
      expect(result).toBeUndefined();
    });
  });

  describe('cleanupBadgeIcon', () => {
    it('does not throw when called with no handlers registered', async () => {
      const feature = await import('./badgeIcon.js');
      expect(() => feature.cleanupBadgeIcon()).not.toThrow();
    });

    it('invokes both cleanup callbacks returned by setupBadgeHandlers', async () => {
      const feature = await import('./badgeIcon.js');
      feature.default(fakeWindow(), fakeTray());

      feature.cleanupBadgeIcon();

      expect(faviconCleanup).toHaveBeenCalledTimes(1);
      expect(unreadCleanup).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — second call does not re-invoke cleanups', async () => {
      const feature = await import('./badgeIcon.js');
      feature.default(fakeWindow(), fakeTray());

      feature.cleanupBadgeIcon();
      feature.cleanupBadgeIcon();

      expect(faviconCleanup).toHaveBeenCalledTimes(1);
      expect(unreadCleanup).toHaveBeenCalledTimes(1);
    });
  });
});
