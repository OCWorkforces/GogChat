/**
 * Unit tests for inOnline (connectivity monitoring) feature.
 *
 * Tests the public API: default export (IPC setup), cleanup,
 * and exported functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Fake BrowserWindow ───────────────────────────────────────────────────────

function makeFakeWindow(url = '') {
  const wc = new EventEmitter() as EventEmitter & {
    getURL: () => string;
    send: ReturnType<typeof vi.fn>;
    loadURL: ReturnType<typeof vi.fn>;
  };
  wc.getURL = vi.fn(() => url);
  wc.send = vi.fn();
  wc.loadURL = vi.fn().mockResolvedValue(undefined);

  const win = new EventEmitter() as unknown as Electron.BrowserWindow & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    show: () => void;
    _destroyed: boolean;
  };
  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.show = vi.fn();
  return win;
}

// ─── Mock electron ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue('/Applications/GogChat.app'),
  },
  BrowserWindow: vi.fn(),
  Notification: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    on: vi.fn(),
  })),
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

// Mock ipcHelper
const mockCreateSecureIPCHandler = vi.fn().mockReturnValue(vi.fn());
vi.mock('../utils/ipcHelper.js', () => ({
  createSecureIPCHandler: mockCreateSecureIPCHandler,
}));

// Mock path
vi.mock('path', () => ({
  default: { join: vi.fn((...args: string[]) => args.join('/')) },
}));

describe('inOnline feature', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mockRateLimiter.isAllowed.mockReturnValue(true);
    mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
    mockGetIcon.mockReturnValue('/fake/icon.png');
  });

  // ── IPC handler ───────────────────────────────────────────────────────────

  describe('default export (IPC setup)', () => {
    it('registers CHECK_IF_ONLINE handler', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 'checkIfOnline' })
      );
    });

    it('returns undefined (no cleanup from default export)', async () => {
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      const result = feature.default(win);

      expect(result).toBeUndefined();
    });
  });

  // ── cleanupConnectivityHandler ────────────────────────────────────────────

  describe('cleanupConnectivityHandler', () => {
    it('does not throw when called with no handlers', async () => {
      const feature = await import('./inOnline.js');
      expect(() => feature.cleanupConnectivityHandler()).not.toThrow();
    });

    it('calls cleanup function if registered', async () => {
      const cleanupFn = vi.fn();
      mockCreateSecureIPCHandler.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);
      feature.cleanupConnectivityHandler();

      expect(cleanupFn).toHaveBeenCalled();
    });

    it('is idempotent (can be called twice)', async () => {
      const cleanupFn = vi.fn();
      mockCreateSecureIPCHandler.mockReturnValue(cleanupFn);

      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);
      feature.cleanupConnectivityHandler();

      expect(() => feature.cleanupConnectivityHandler()).not.toThrow();
    });
  });

  // ── checkForInternet ──────────────────────────────────────────────────────

  describe('checkForInternet', () => {
    it('is exported and callable', async () => {
      const mod = await import('./inOnline.js');
      expect(mod.checkForInternet).toBeDefined();
      expect(typeof mod.checkForInternet).toBe('function');
    });
  });

  // ── IPC handler configuration ─────────────────────────────────────────────

  describe('IPC handler configuration', () => {
    it('handler includes validator', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'checkIfOnline',
          validator: expect.any(Function),
        })
      );
    });

    it('handler includes rate limiting', async () => {
      mockCreateSecureIPCHandler.mockReturnValue(vi.fn());
      const win = makeFakeWindow() as unknown as Electron.BrowserWindow;

      const feature = await import('./inOnline.js');
      feature.default(win);

      expect(mockCreateSecureIPCHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'checkIfOnline',
          rateLimit: expect.any(Number),
        })
      );
    });
  });
});
