/**
 * Unit tests for windowWrapper — BrowserWindow factory with CSP/Header handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Capture last window created by the BrowserWindow mock for test assertions
let lastCreatedWindow: ReturnType<typeof Object> | null = null;

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn().mockReturnValue('/fake/app/path'),
    getPath: vi.fn().mockReturnValue('/fake/path'),
  },
  BrowserWindow: vi.fn().mockImplementation(function MockBrowserWindow() {
    const win = {
      webContents: {
        session: {
          setPermissionRequestHandler: vi.fn(),
          webRequest: { onHeadersReceived: vi.fn() },
          setSpellCheckerEnabled: vi.fn(),
        },
        on: vi.fn(),
        getURL: vi.fn().mockReturnValue('https://chat.google.com'),
      },
      on: vi.fn(),
      once: vi.fn(),
      show: vi.fn(),
      hide: vi.fn(),
      loadURL: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn().mockReturnValue(false),
    };
    lastCreatedWindow = win;
    return win;
  }),
  Notification: Object.assign(
    vi.fn().mockImplementation(() => ({ on: vi.fn(), show: vi.fn(), close: vi.fn() })),
    { isSupported: vi.fn().mockReturnValue(false) }
  ),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('./config', () => ({
  default: {
    get: vi.fn((key: string) => {
      const defaults: Record<string, unknown> = {
        'app.hideMenuBar': false,
        'app.startHidden': false,
        'app.disableSpellChecker': false,
      };
      return defaults[key];
    }),
  },
}));

vi.mock('./utils/iconCache', () => ({
  getIconCache: vi.fn().mockReturnValue({
    getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
  }),
}));

import createWindow from './windowWrapper';

function wc() {
  return lastCreatedWindow!.webContents.session;
}

describe('windowWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastCreatedWindow = null;
    process.removeAllListeners('warning');
  });

  afterEach(() => {
    process.removeAllListeners('warning');
  });

  describe('createWindow factory', () => {
    it('creates BrowserWindow with correct security defaults', () => {
      createWindow('https://chat.google.com');
      const w = lastCreatedWindow!;
      expect(w).toBeDefined();
      expect(w.webContents).toBeDefined();
    });

    it('loads the specified URL', () => {
      createWindow('https://chat.google.com/u/0');
      expect(lastCreatedWindow!.loadURL).toHaveBeenCalledWith('https://chat.google.com/u/0');
    });

    it('installs CSP header stripping for Google domains', () => {
      createWindow('https://chat.google.com');
      expect(wc().webRequest.onHeadersReceived).toHaveBeenCalledWith(
        expect.objectContaining({
          urls: expect.arrayContaining(['*://*.google.com/*', '*://*.gstatic.com/*']),
        }),
        expect.any(Function)
      );
    });

    it('strips COEP and COOP headers from responses', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      const details = {
        url: 'https://chat.google.com/',
        responseHeaders: {
          'cross-origin-embedder-policy': ['require-corp'],
          'cross-origin-opener-policy': ['same-origin'],
        },
      };

      cb(details, (response: { responseHeaders: Record<string, string[]> }) => {
        expect(response.responseHeaders['cross-origin-embedder-policy']).toBeUndefined();
        expect(response.responseHeaders['cross-origin-opener-policy']).toBeUndefined();
      });
    });

    it('strips frame-ancestors from CSP for benign hosts', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      const details = {
        url: 'https://accounts.google.com/auth',
        responseHeaders: {
          'content-security-policy': [
            "default-src 'self'; frame-ancestors https://studio.workspace.google.com",
          ],
          'x-frame-options': ['ALLOW-FROM https://studio.workspace.google.com'],
        },
      };

      cb(details, (response: { responseHeaders: Record<string, string[]> }) => {
        expect(response.responseHeaders['content-security-policy'][0]).not.toContain(
          'frame-ancestors'
        );
        expect(response.responseHeaders['x-frame-options']).toBeUndefined();
      });
    });

    it('preserves frame-ancestors for non-benign hosts', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      cb(
        {
          url: 'https://chat.google.com/embed',
          responseHeaders: {
            'content-security-policy': ['frame-ancestors https://trusted.example.com'],
          },
        },
        (response: { responseHeaders: Record<string, string[]> }) => {
          expect(response.responseHeaders['content-security-policy'][0]).toContain(
            'frame-ancestors'
          );
        }
      );
    });

    it('deletes CSP key when frame-ancestors removal leaves empty policy', () => {
      createWindow('https://chat.google.com');
      const cb = wc().webRequest.onHeadersReceived.mock.calls[0][1];

      cb(
        {
          url: 'https://accounts.google.com/auth',
          responseHeaders: { 'content-security-policy': ['frame-ancestors x;'] },
        },
        (response: { responseHeaders: Record<string, string[]> }) => {
          expect(response.responseHeaders['content-security-policy']).toBeUndefined();
        }
      );
    });

    it('grants allowed permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      handler({}, 'notifications', cb);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, 'media', cb);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, 'mediaKeySystem', cb);
      expect(cb).toHaveBeenCalledWith(true);
      handler({}, 'geolocation', cb);
      expect(cb).toHaveBeenCalledWith(true);
    });

    it('denies non-allowed permissions', () => {
      createWindow('https://chat.google.com');
      const handler = wc().setPermissionRequestHandler.mock.calls[0][0];
      const cb = vi.fn();

      handler({}, 'fullscreen', cb);
      expect(cb).toHaveBeenCalledWith(false);
      handler({}, 'clipboard-read', cb);
      expect(cb).toHaveBeenCalledWith(false);
    });

    it('uses partition when provided', () => {
      createWindow('https://chat.google.com', 'persist:account-1');
      expect(lastCreatedWindow).toBeDefined();
    });

    it('does not set partition when not provided', () => {
      createWindow('https://chat.google.com');
      expect(lastCreatedWindow).toBeDefined();
    });

    it('registers window lifecycle event listeners', () => {
      createWindow('https://chat.google.com');

      const eventTypes = lastCreatedWindow!.on.mock.calls.map((c: [string]) => c[0]);
      ['show', 'hide', 'focus', 'blur', 'minimize', 'restore'].forEach((e) =>
        expect(eventTypes).toContain(e)
      );

      const onceTypes = lastCreatedWindow!.once.mock.calls.map((c: [string]) => c[0]);
      expect(onceTypes).toContain('ready-to-show');
    });

    it('registers webContents event listeners for console and navigation', () => {
      createWindow('https://chat.google.com');

      const wcEvents = lastCreatedWindow!.webContents.on.mock.calls.map((c: [string]) => c[0]);
      [
        'console-message',
        'did-fail-load',
        'did-finish-load',
        'did-navigate',
        'render-process-gone',
        'unresponsive',
        'responsive',
      ].forEach((e) => expect(wcEvents).toContain(e));
    });
  });
});
