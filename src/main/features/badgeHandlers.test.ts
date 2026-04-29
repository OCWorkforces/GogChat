/**
 * Unit tests for badgeHandlers — extracted IPC logic for badgeIcon feature.
 *
 * Covers:
 *   • decideIcon()         — favicon URL → IconType resolution
 *   • updateBadgeIcon()    — macOS dock badge update
 *   • setupBadgeHandlers() — IPC handler registration with rate limiting,
 *                             deduplication, validation, and dedup windows.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSetBadgeCount = vi.fn();
vi.mock('electron', () => ({
  app: { setBadgeCount: mockSetBadgeCount },
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

const mockRateLimiter = { isAllowed: vi.fn().mockReturnValue(true) };
vi.mock('../utils/rateLimiter.js', () => ({
  getRateLimiter: () => mockRateLimiter,
}));

const mockGetIcon = vi.fn().mockReturnValue('/fake/icon.png');
vi.mock('../utils/iconCache.js', () => ({
  getIconCache: () => ({ getIcon: mockGetIcon }),
}));

const mockDeduplicate = vi
  .fn()
  .mockImplementation(async (_key: string, fn: () => Promise<void>) => {
    await fn();
  });
vi.mock('../utils/ipcDeduplicator.js', () => ({
  getDeduplicator: () => ({ deduplicate: mockDeduplicate }),
}));

const mockCreateSecureIPCHandler = vi.fn().mockReturnValue(vi.fn());
vi.mock('../utils/ipcHelper.js', () => ({
  createSecureIPCHandler: (cfg: unknown) => mockCreateSecureIPCHandler(cfg),
}));

const mockSetTrayUnread = vi.fn();
vi.mock('./trayIcon.js', () => ({
  setTrayUnread: mockSetTrayUnread,
}));

vi.mock('../../shared/dataValidators.js', () => ({
  validateFaviconURL: vi.fn((url: string) => url),
  validateUnreadCount: vi.fn((count: number) => count),
}));

function fakeWindow() {
  return {} as unknown as Electron.BrowserWindow;
}
function fakeTray() {
  return { setImage: vi.fn() } as unknown as Electron.Tray;
}

describe('badgeHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRateLimiter.isAllowed.mockReturnValue(true);
    mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
    mockGetIcon.mockReturnValue('/fake/icon.png');
    mockDeduplicate.mockImplementation(async (_key: string, fn: () => Promise<void>) => {
      await fn();
    });
  });

  describe('decideIcon', () => {
    it('returns NORMAL for the standard favicon', async () => {
      const { decideIcon } = await import('./badgeHandlers.js');
      // Standard Google Chat favicon path
      expect(decideIcon('https://mail.google.com/favicon.ico')).toBeDefined();
    });

    it('returns OFFLINE for unknown patterns', async () => {
      const { decideIcon } = await import('./badgeHandlers.js');
      const { ICON_TYPES } = await import('../../shared/constants.js');
      expect(decideIcon('https://example.com/something-random.png')).toBe(
        ICON_TYPES.OFFLINE
      );
    });
  });

  describe('updateBadgeIcon', () => {
    it('forwards the count to app.setBadgeCount on macOS', async () => {
      const { updateBadgeIcon } = await import('./badgeHandlers.js');
      updateBadgeIcon(fakeWindow(), 7);
      expect(mockSetBadgeCount).toHaveBeenCalledWith(7);
    });
  });

  describe('setupBadgeHandlers', () => {
    it('registers FAVICON_CHANGED handler with validator', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'faviconChanged',
          validator: expect.any(Function),
        })
      );
    });

    it('registers UNREAD_COUNT handler with validator', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'unreadCount',
          validator: expect.any(Function),
        })
      );
    });

    it('returns cleanup callbacks for both handlers', async () => {
      const faviconCleanupFn = vi.fn();
      const unreadCleanupFn = vi.fn();
      mockCreateSecureIPCHandler
        .mockReturnValueOnce(faviconCleanupFn)
        .mockReturnValueOnce(unreadCleanupFn);

      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      const { faviconCleanup, unreadCleanup } = setupBadgeHandlers(
        fakeWindow(),
        fakeTray()
      );

      expect(faviconCleanup).toBe(faviconCleanupFn);
      expect(unreadCleanup).toBe(unreadCleanupFn);
    });

    it('uses a 150ms dedup window for FAVICON_CHANGED', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const faviconCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'faviconChanged'
      )?.[0] as { handler: (v: string) => void };
      faviconCfg.handler('https://example.com/x.ico');

      expect(mockDeduplicate).toHaveBeenCalledWith(
        expect.stringContaining('faviconChanged'),
        expect.any(Function),
        150
      );
    });

    it('uses a 100ms dedup window for UNREAD_COUNT', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(3);

      expect(mockDeduplicate).toHaveBeenCalledWith(
        expect.stringContaining('unreadCount'),
        expect.any(Function),
        100
      );
    });

    it('skips work when rate limiter blocks favicon changes', async () => {
      mockRateLimiter.isAllowed.mockReturnValue(false);
      const tray = fakeTray();

      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), tray);

      const faviconCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'faviconChanged'
      )?.[0] as { handler: (v: string) => void };
      faviconCfg.handler('https://example.com/x.ico');

      // Wait for the async dedup callback
      await new Promise((r) => setImmediate(r));
      expect(tray.setImage).not.toHaveBeenCalled();
    });

    it('skips work when rate limiter blocks unread count updates', async () => {
      mockRateLimiter.isAllowed.mockReturnValue(false);

      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(5);

      await new Promise((r) => setImmediate(r));
      expect(mockSetBadgeCount).not.toHaveBeenCalled();
    });

    it('calls setTrayUnread(true) when unread count > 0', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(5);

      await new Promise((r) => setImmediate(r));
      expect(mockSetTrayUnread).toHaveBeenCalledWith(true);
    });

    it('calls setTrayUnread(false) when unread count is 0', async () => {
      const { setupBadgeHandlers } = await import('./badgeHandlers.js');
      setupBadgeHandlers(fakeWindow(), fakeTray());

      const unreadCfg = mockCreateSecureIPCHandler.mock.calls.find(
        ([cfg]) => (cfg as { channel: string }).channel === 'unreadCount'
      )?.[0] as { handler: (v: number) => void };
      unreadCfg.handler(0);

      await new Promise((r) => setImmediate(r));
      expect(mockSetTrayUnread).toHaveBeenCalledWith(false);
    });
  });
});
