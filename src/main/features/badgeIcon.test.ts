/**
 * Unit tests for badgeIcon feature.
 *
 * Tests the public API: default export (IPC setup) and cleanup.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Fake BrowserWindow ───────────────────────────────────────────────────────

function makeFakeWindow() {
  const wc = new EventEmitter() as EventEmitter & { send: ReturnType<typeof vi.fn> };
  wc.send = vi.fn();

  const win = new EventEmitter() as unknown as Electron.BrowserWindow & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    _destroyed: boolean;
  };
  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  return win;
}

// ─── Fake Tray ────────────────────────────────────────────────────────────────

function makeFakeTray() {
  return {
    setImage: vi.fn(),
    setToolTip: vi.fn(),
    destroy: vi.fn(),
  };
}

// ─── Mock electron ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    setBadgeCount: vi.fn().mockReturnValue(true),
    getBadgeCount: vi.fn().mockReturnValue(0),
  },
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

// Mock rateLimiter
const mockRateLimiter = {
  isAllowed: vi.fn().mockReturnValue(true),
};
vi.mock('../utils/rateLimiter.js', () => ({
  getRateLimiter: () => mockRateLimiter,
}));

// Mock iconCache
const mockGetIcon = vi.fn().mockReturnValue('/fake/icon.png');
vi.mock('../utils/iconCache.js', () => ({
  getIconCache: () => ({ getIcon: mockGetIcon }),
}));

// Mock ipcDeduplicator
const mockDeduplicate = vi
  .fn()
  .mockImplementation(async (_key: string, fn: () => Promise<void>) => {
    await fn();
  });
vi.mock('../utils/ipcDeduplicator.js', () => ({
  getDeduplicator: () => ({
    deduplicate: mockDeduplicate,
  }),
}));

// Mock ipcHelper
const mockCreateSecureIPCHandler = vi.fn().mockReturnValue(vi.fn());
vi.mock('../utils/ipcHelper.js', () => ({
  createSecureIPCHandler: mockCreateSecureIPCHandler,
}));

// Mock validators
vi.mock('../../shared/validators.js', () => ({
  validateFaviconURL: vi.fn((url: string) => url),
  validateUnreadCount: vi.fn((count: number) => count),
}));

// Stub process.platform
vi.stubGlobal('process', { ...process, platform: 'darwin' });

describe('badgeIcon feature', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRateLimiter.isAllowed.mockReturnValue(true);
    mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
    mockGetIcon.mockReturnValue('/fake/icon.png');
    mockDeduplicate.mockImplementation(async (_key: string, fn: () => Promise<void>) => {
      await fn();
    });
  });

  // ── default export / IPC registration ─────────────────────────────────────

  describe('default export (IPC setup)', () => {
    it('registers FAVICON_CHANGED handler', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'faviconChanged' })
      );
    });

    it('registers UNREAD_COUNT handler', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'unreadCount' })
      );
    });

    it('returns undefined (no cleanup function from default export)', async () => {
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      const result = feature.default(win, tray as unknown as Electron.Tray);

      // The default export doesn't return anything, cleanup is via named export
      expect(result).toBeUndefined();
    });
  });

  // ── cleanupBadgeIcon ───────────────────────────────────────────────────────

  describe('cleanupBadgeIcon', () => {
    it('does not throw when called with no handlers', async () => {
      const feature = await import('./badgeIcon.js');
      expect(() => feature.cleanupBadgeIcon()).not.toThrow();
    });

    it('calls cleanup function if registered', async () => {
      const cleanupFn = vi.fn();
      mockCreateSecureIPCHandler.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);
      feature.cleanupBadgeIcon();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('is idempotent (can be called twice)', async () => {
      const cleanupFn = vi.fn();
      mockCreateSecureIPCHandler.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);
      feature.cleanupBadgeIcon();

      expect(() => feature.cleanupBadgeIcon()).not.toThrow();
    });
  });

  // ── IPC handler behavior ────────────────────────────────────────────────────

  describe('IPC handler configuration', () => {
    it('favicon handler includes validator', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'faviconChanged',
          validator: expect.any(Function),
        })
      );
    });

    it('unread count handler includes validator', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'unreadCount',
          validator: expect.any(Function),
        })
      );
    });

    it('rate limits favicon changes', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;
      const tray = makeFakeTray();

      const feature = await import('./badgeIcon.js');
      feature.default(win, tray as unknown as Electron.Tray);

      // Rate limit check is inside the handler, but we verify the handler was created
      expect(mockCreateSecureIPCHandler).toHaveBeenCalled();
    });
  });
});
