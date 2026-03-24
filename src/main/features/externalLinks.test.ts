/**
 * Unit tests for externalLinks feature.
 *
 * Tests the public API: default export (window handlers) and cleanup.
 * Helper functions are tested indirectly through the behavior they influence.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Fake Window helpers ──────────────────────────────────────────────────────

function makeFakeWindow(url = '') {
  const wc = new EventEmitter() as EventEmitter & {
    getURL: () => string;
    setWindowOpenHandler: (h: unknown) => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
  };
  wc.getURL = vi.fn(() => url);
  wc.setWindowOpenHandler = vi.fn();
  wc.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    wc.addListener(event, handler);
  });

  const win = new EventEmitter() as unknown as Electron.BrowserWindow & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    loadURL: ReturnType<typeof vi.fn>;
    minimize: () => void;
    restore: () => void;
    show: () => void;
    focus: () => void;
    hide: () => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    _destroyed: boolean;
  };
  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.loadURL = vi.fn().mockResolvedValue(undefined);
  win.minimize = vi.fn();
  win.restore = vi.fn();
  win.show = vi.fn();
  win.focus = vi.fn();
  win.hide = vi.fn();
  win.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    win.addListener(event, handler);
  });
  return win;
}

// ─── Mock electron ────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: { isPackaged: false },
  BrowserWindow: vi.fn(),
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 }),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock validators
vi.mock('../../shared/validators.js', () => ({
  validateExternalURL: vi.fn((url: string) => url),
  isWhitelistedHost: vi.fn().mockReturnValue(true),
  isGoogleAuthUrl: vi.fn().mockReturnValue(false),
}));

// Mock accountWindowManager
vi.mock('../utils/accountWindowManager.js', () => ({
  getAccountWindowManager: () => ({
    isBootstrap: vi.fn().mockReturnValue(false),
    markAsBootstrap: vi.fn(),
    getAccountIndex: vi.fn().mockReturnValue(0),
  }),
  createAccountWindow: vi.fn().mockReturnValue({
    webContents: { getURL: () => '' },
    isMinimized: () => false,
    minimize: vi.fn(),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn().mockResolvedValue(undefined),
  }),
  getWindowForAccount: vi.fn().mockReturnValue(null),
  getAccountIndex: vi.fn().mockReturnValue(0),
}));

// Mock bootstrapPromotion
vi.mock('./bootstrapPromotion.js', () => ({
  watchBootstrapAccount: vi.fn(),
}));

// Mock resourceCleanup for createTrackedInterval
vi.mock('../utils/resourceCleanup.js', () => ({
  createTrackedInterval: vi.fn().mockReturnValue({} as NodeJS.Timeout),
}));

describe('externalLinks feature', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── default export / window.open handler ───────────────────────────────────

  describe('default export (window setup)', () => {
    it('registers setWindowOpenHandler on webContents', async () => {
      const win = makeFakeWindow('https://chat.google.com');
      const feature = await import('./externalLinks.js');
      feature.default(win as unknown as Electron.BrowserWindow);
      expect(win.webContents.setWindowOpenHandler).toHaveBeenCalled();
    });

    it('registers will-navigate listener on webContents', async () => {
      const win = makeFakeWindow('https://chat.google.com');
      const feature = await import('./externalLinks.js');
      feature.default(win as unknown as Electron.BrowserWindow);
      expect(win.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    });

    it('handler denies non-HTTP URLs', async () => {
      const win = makeFakeWindow('https://chat.google.com');
      const feature = await import('./externalLinks.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0];
      const result = handler({ url: 'javascript:alert(1)' } as Electron.HandlerDetails);

      expect(result).toEqual({ action: 'deny' });
    });

    it('handler allows whitelisted navigation', async () => {
      const win = makeFakeWindow('https://chat.google.com');
      const feature = await import('./externalLinks.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0];
      const result = handler({ url: 'https://accounts.google.com' } as Electron.HandlerDetails);

      expect(result).toEqual({ action: 'allow' });
    });

    it('will-navigate prevents default for Chat account routing', async () => {
      const win = makeFakeWindow('https://chat.google.com');
      const feature = await import('./externalLinks.js');
      feature.default(win as unknown as Electron.BrowserWindow);

      // Find will-navigate handler
      const navCall = (win.webContents.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 'will-navigate'
      );
      const navHandler = navCall?.[1] as (
        event: { preventDefault: ReturnType<typeof vi.fn> },
        url: string
      ) => void;

      const preventDefault = vi.fn();
      navHandler({ preventDefault } as unknown as Electron.Event, 'https://chat.google.com/u/1/');

      expect(preventDefault).toHaveBeenCalled();
    });
  });

  // ── cleanupExternalLinks ────────────────────────────────────────────────────

  describe('cleanupExternalLinks', () => {
    it('does not throw when called', async () => {
      const feature = await import('./externalLinks.js');
      expect(() => feature.cleanupExternalLinks()).not.toThrow();
    });

    it('is idempotent (can be called twice)', async () => {
      const feature = await import('./externalLinks.js');
      feature.cleanupExternalLinks();
      expect(() => feature.cleanupExternalLinks()).not.toThrow();
    });
  });

  // ── toggleExternalLinksGuard ────────────────────────────────────────────────

  describe('toggleExternalLinksGuard', () => {
    it('shows confirmation dialog', async () => {
      const { dialog } = await import('electron');
      const feature = await import('./externalLinks.js');
      const win = makeFakeWindow('https://chat.google.com');
      feature.toggleExternalLinksGuard(win as unknown as Electron.BrowserWindow);
      expect(dialog.showMessageBox).toHaveBeenCalled();
    });
  });
});
