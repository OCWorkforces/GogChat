/**
 * Unit tests for singleInstance feature — second-instance handling & window focus
 *
 * Covers:
 * - enforceSingleInstance returns true when lock is acquired
 * - enforceSingleInstance exits app when lock is denied
 * - restoreFirstInstance registers second-instance event
 * - second-instance: window restore (minimized → restore)
 * - second-instance: window show and focus
 * - second-instance: deep link processing when URL present in argv
 * - second-instance: no-op when no window available
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeFakeWindow() {
  const wc = new EventEmitter() as EventEmitter & { getURL: () => string };
  wc.getURL = vi.fn(() => 'https://chat.google.com');

  const win = new EventEmitter() as EventEmitter & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    destroy: () => void;
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
    _destroyed: boolean;
  };

  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.destroy = () => {
    win._destroyed = true;
    win.emit('closed');
  };

  win.show = vi.fn();
  win.hide = vi.fn();
  win.restore = vi.fn();
  win.focus = vi.fn();
  win.isMinimized = vi.fn().mockReturnValue(false);

  return win;
}

// ─── Module-level mocks ────────────────────────────────────────────────────────

const appMock = {
  requestSingleInstanceLock: vi.fn(),
  exit: vi.fn(),
  on: vi.fn(),
};

vi.mock('electron', () => ({
  app: appMock,
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

const getMostRecentWindowMock = vi.fn();
vi.mock('../utils/accountWindowManager.js', () => ({
  getMostRecentWindow: getMostRecentWindowMock,
}));

const extractDeepLinkFromArgvMock = vi.fn();
vi.mock('../utils/deepLinkUtils.js', () => ({
  extractDeepLinkFromArgv: extractDeepLinkFromArgvMock,
}));

const processDeepLinkHandlerMock = vi.fn();
vi.mock('../utils/menuActionRegistry.js', () => ({
  getMenuAction: vi.fn(() => ({
    label: 'Process deep link',
    handler: processDeepLinkHandlerMock,
  })),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('singleInstance feature', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeWindow = makeFakeWindow();
    getMostRecentWindowMock.mockReturnValue(fakeWindow);
    appMock.requestSingleInstanceLock.mockReturnValue(true);
    appMock.exit.mockClear();
    appMock.on.mockClear();
    extractDeepLinkFromArgvMock.mockReturnValue(null);
    processDeepLinkHandlerMock.mockClear();
  });

  // ── enforceSingleInstance ────────────────────────────────────────────────────

  describe('enforceSingleInstance', () => {
    it('returns true when lock is acquired', async () => {
      appMock.requestSingleInstanceLock.mockReturnValue(true);

      const { enforceSingleInstance } = await import('./singleInstance.js');
      const result = enforceSingleInstance();

      expect(result).toBe(true);
    });

    it('returns false when lock is denied', async () => {
      appMock.requestSingleInstanceLock.mockReturnValue(false);

      const { enforceSingleInstance } = await import('./singleInstance.js');
      const result = enforceSingleInstance();

      expect(result).toBe(false);
    });

    it('exits app when lock is denied', async () => {
      appMock.requestSingleInstanceLock.mockReturnValue(false);

      const { enforceSingleInstance } = await import('./singleInstance.js');
      enforceSingleInstance();

      expect(appMock.exit).toHaveBeenCalled();
    });

    it('does not exit app when lock is acquired', async () => {
      appMock.requestSingleInstanceLock.mockReturnValue(true);

      const { enforceSingleInstance } = await import('./singleInstance.js');
      enforceSingleInstance();

      expect(appMock.exit).not.toHaveBeenCalled();
    });
  });

  // ── restoreFirstInstance ─────────────────────────────────────────────────────

  describe('restoreFirstInstance', () => {
    it('registers second-instance event listener on app', async () => {
      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      expect(appMock.on).toHaveBeenCalledWith('second-instance', expect.any(Function));
    });

    it('shows and focuses the most recent window on second-instance', async () => {
      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      // Simulate second-instance event
      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app', 'gogchat://room/abc']);

      expect(fakeWindow.show).toHaveBeenCalled();
      expect(fakeWindow.focus).toHaveBeenCalled();
    });

    it('restores window if it is minimized', async () => {
      fakeWindow.isMinimized.mockReturnValue(true);
      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app']);

      expect(fakeWindow.restore).toHaveBeenCalled();
      expect(fakeWindow.show).toHaveBeenCalled();
      expect(fakeWindow.focus).toHaveBeenCalled();
    });

    it('does not crash when no window is available', async () => {
      getMostRecentWindowMock.mockReturnValue(null);
      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      expect(() => secondInstanceHandler?.({}, ['node', 'app'])).not.toThrow();
    });

    it('does not restore if window is not minimized', async () => {
      fakeWindow.isMinimized.mockReturnValue(false);
      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app']);

      expect(fakeWindow.restore).not.toHaveBeenCalled();
    });

    // ── Deep link handling ─────────────────────────────────────────────────────

    it('processes deep link when URL is present in argv', async () => {
      const deepLinkUrl = 'gogchat://room/abc123';
      extractDeepLinkFromArgvMock.mockReturnValue(deepLinkUrl);

      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app', deepLinkUrl]);

      expect(processDeepLinkHandlerMock).toHaveBeenCalledWith(deepLinkUrl);
    });

    it('does not process deep link when no URL in argv', async () => {
      extractDeepLinkFromArgvMock.mockReturnValue(null);

      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app']);

      expect(processDeepLinkHandlerMock).not.toHaveBeenCalled();
    });

    it('passes correct argv to extractDeepLinkFromArgv', async () => {
      const argv = ['node', 'app', 'gogchat://dm/xyz'];
      extractDeepLinkFromArgvMock.mockReturnValue(argv[2]);

      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, argv);

      expect(extractDeepLinkFromArgvMock).toHaveBeenCalledWith(argv);
    });

    it('shows and focuses window even when no deep link present', async () => {
      extractDeepLinkFromArgvMock.mockReturnValue(null);

      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app']);

      expect(fakeWindow.show).toHaveBeenCalled();
      expect(fakeWindow.focus).toHaveBeenCalled();
    });

    it('logs warning when processDeepLink action is not registered', async () => {
      const deepLinkUrl = 'gogchat://room/unregistered';
      extractDeepLinkFromArgvMock.mockReturnValue(deepLinkUrl);

      const { getMenuAction } = await import('../utils/menuActionRegistry.js');
      vi.mocked(getMenuAction).mockReturnValueOnce(undefined);

      const { restoreFirstInstance } = await import('./singleInstance.js');

      restoreFirstInstance({});

      const secondInstanceHandler = appMock.on.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'second-instance'
      )?.[1] as (event: unknown, argv: string[]) => void;

      secondInstanceHandler?.({}, ['node', 'app', deepLinkUrl]);

      const logMock = await import('electron-log');
      expect(logMock.default.warn).toHaveBeenCalledWith(
        '[SingleInstance] processDeepLink action not registered \u2014 deep link dropped'
      );
      expect(processDeepLinkHandlerMock).not.toHaveBeenCalled();
    });
  });
});
