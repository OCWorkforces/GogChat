/**
 * Unit tests for closeToTray feature.
 *
 * Tests the public API: default export (window handlers) and cleanup.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Fake BrowserWindow ───────────────────────────────────────────────────────

function makeFakeWindow() {
  const wc = new EventEmitter() as EventEmitter & {
    getURL: () => string;
  };
  wc.getURL = vi.fn(() => 'https://chat.google.com');

  const win = new EventEmitter() as unknown as Electron.BrowserWindow & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    hide: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    _destroyed: boolean;
  };

  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.hide = vi.fn();
  win.show = vi.fn();
  win.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    win.addListener(event, handler);
  });
  win.removeListener = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    win.removeListener(event, handler);
  });

  return win;
}

// ─── Mock electron ────────────────────────────────────────────────────────────

// Store handlers registered on app for later invocation
const appHandlers: Record<string, ((...args: unknown[]) => void)[]> = {};

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    hide: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!appHandlers[event]) {
        appHandlers[event] = [];
      }
      appHandlers[event].push(handler);
      return { app: { on: vi.fn() } };
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (appHandlers[event]) {
        appHandlers[event] = appHandlers[event].filter((h) => h !== handler);
      }
    }),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock platform
const mockPlatform = {
  isMac: true,
};
vi.mock('../utils/platformDetection.js', () => ({
  platform: mockPlatform,
}));

describe('closeToTray feature', () => {
  let win: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Clear registered handlers
    Object.keys(appHandlers).forEach((key) => delete appHandlers[key]);

    // Reset platform
    mockPlatform.isMac = true;

    win = makeFakeWindow();
  });

  // Helper to get registered close handler
  function getCloseHandler(): ((event: { preventDefault: () => void }) => void) | undefined {
    const calls = (win.on as ReturnType<typeof vi.fn>).mock.calls;
    const closeCall = calls.find((call: unknown[]) => call[0] === 'close');
    return closeCall?.[1] as ((event: { preventDefault: () => void }) => void) | undefined;
  }

  // Helper to get registered before-quit handler
  function getBeforeQuitHandler(): (() => void) | undefined {
    const handlers = appHandlers['before-quit'];
    return handlers?.[0] as (() => void) | undefined;
  }

  // ── default export / close handler setup ─────────────────────────────────

  describe('default export (window setup)', () => {
    it('registers before-quit listener on app', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const { app: electronApp } = await import('electron');
      expect(electronApp.on).toHaveBeenCalledWith('before-quit', expect.any(Function));
    });

    it('registers close listener on window', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      expect(win.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  // ── close handler behavior ───────────────────────────────────────────────

  describe('close handler', () => {
    it('prevents default close when not quitting', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const closeHandler = getCloseHandler();
      expect(closeHandler).toBeDefined();

      const preventDefault = vi.fn();
      closeHandler!({ preventDefault } as unknown as Electron.Event);

      expect(preventDefault).toHaveBeenCalled();
    });

    it('calls hide on macOS', async () => {
      mockPlatform.isMac = true;

      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const closeHandler = getCloseHandler();
      closeHandler!({ preventDefault: vi.fn() } as unknown as Electron.Event);

      const { app: electronApp } = await import('electron');
      expect(electronApp.hide).toHaveBeenCalled();
    });

    it('calls window.hide() on non-macOS', async () => {
      mockPlatform.isMac = false;

      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const closeHandler = getCloseHandler();
      closeHandler!({ preventDefault: vi.fn() } as unknown as Electron.Event);

      expect(win.hide).toHaveBeenCalled();
    });

    it('does not prevent close when willQuit is true', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      // Simulate before-quit was called (willQuit = true)
      const beforeQuitHandler = getBeforeQuitHandler();
      beforeQuitHandler?.();

      // Now trigger close
      const closeHandler = getCloseHandler();
      const preventDefault = vi.fn();
      closeHandler!({ preventDefault } as unknown as Electron.Event);

      // Should NOT prevent default when quitting
      expect(preventDefault).not.toHaveBeenCalled();
    });
  });

  // ── cleanupCloseToTray ───────────────────────────────────────────────────

  describe('cleanupCloseToTray', () => {
    it('removes before-quit listener', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const beforeQuitHandler = getBeforeQuitHandler();

      feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow);

      const { app: electronApp } = await import('electron');
      expect(electronApp.removeListener).toHaveBeenCalledWith('before-quit', beforeQuitHandler);
    });

    it('removes close listener', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const closeHandler = getCloseHandler();

      feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow);

      expect(win.removeListener).toHaveBeenCalledWith('close', closeHandler);
    });

    it('does not throw when window is destroyed', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      win._destroyed = true;

      expect(() =>
        feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow)
      ).not.toThrow();
    });

    it('is idempotent (can be called twice)', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow);

      expect(() =>
        feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow)
      ).not.toThrow();
    });

    it('removes both handlers on cleanup', async () => {
      const feature = await import('./closeToTray.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const beforeQuitHandler = getBeforeQuitHandler();
      const closeHandler = getCloseHandler();

      feature.cleanupCloseToTray(win as unknown as Electron.BrowserWindow);

      const { app: electronApp } = await import('electron');
      expect(electronApp.removeListener).toHaveBeenCalledWith('before-quit', beforeQuitHandler);
      expect(win.removeListener).toHaveBeenCalledWith('close', closeHandler);
    });
  });
});
