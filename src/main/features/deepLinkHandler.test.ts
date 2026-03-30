/**
 * Unit tests for deepLinkHandler feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  return {
    app: {
      setAsDefaultProtocolClient: vi.fn().mockReturnValue(true),
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      }),
      removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        const idx = listeners[event]?.indexOf(handler) ?? -1;
        if (idx >= 0) listeners[event].splice(idx, 1);
      }),
      __listeners: listeners,
    },
    shell: {
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../shared/validators', () => ({
  validateDeepLinkURL: vi.fn((url: string) => url),
  validateExternalURL: vi.fn((url: string) => url),
}));

vi.mock('../utils/accountWindowManager', () => ({
  createAccountWindow: vi.fn(),
  getWindowForAccount: vi.fn().mockReturnValue(null),
  getMostRecentWindow: vi.fn().mockReturnValue(null),
}));

vi.mock('../utils/trackedResources', () => ({
  addTrackedListener: vi.fn(),
}));

import {
  processDeepLink,
  setupDeepLinkListener,
  cleanupDeepLinkHandler,
  } from './deepLinkHandler';
import { extractDeepLinkFromArgv } from '../utils/deepLinkUtils';
import { app } from 'electron';
import { createAccountWindow, getWindowForAccount } from '../utils/accountWindowManager';
import { validateDeepLinkURL, validateExternalURL } from '../../shared/validators';
import { addTrackedListener } from '../utils/trackedResources';

function getAppListeners() {
  return (app as any).__listeners as Record<string, Array<(...args: unknown[]) => void>>;
}

function makeFakeWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    loadURL: vi.fn().mockResolvedValue(undefined),
    isMinimized: vi.fn().mockReturnValue(false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe('deepLinkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const listeners = getAppListeners();
    for (const key of Object.keys(listeners)) {
      delete listeners[key];
    }
  });

  describe('processDeepLink', () => {
    it('validates the deep link URL', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as any);

      processDeepLink('gogchat://chat.google.com/room/test');
      expect(validateDeepLinkURL).toHaveBeenCalledWith('gogchat://chat.google.com/room/test');
    });

    it('creates window for account index from URL path', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      const fakeWindow = makeFakeWindow();
      vi.mocked(createAccountWindow).mockReturnValue(fakeWindow as any);

      processDeepLink('gogchat://chat.google.com/u/3/room/test');
      expect(createAccountWindow).toHaveBeenCalledWith(expect.stringContaining('/u/3/'), 3);
    });

    it('defaults to account index 0 when no /u/N path', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as any);

      processDeepLink('gogchat://chat.google.com/room/test');
      expect(createAccountWindow).toHaveBeenCalledWith(expect.any(String), 0);
    });

    it('handles validation errors gracefully', () => {
      vi.mocked(validateDeepLinkURL).mockImplementation(() => {
        throw new Error('Invalid URL');
      });
      processDeepLink('invalid-url');
      // Should not throw
    });

    it('buffers URL when no window available', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(null as any);

      processDeepLink('gogchat://chat.google.com/room/test');
      // Should not throw — URL gets buffered
    });
  });

  describe('extractDeepLinkFromArgv', () => {
    it('extracts gogchat:// deep link from argv', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'gogchat://chat.google.com/room/test',
      ]);
      expect(result).toBe('gogchat://chat.google.com/room/test');
    });

    it('extracts https chat.google.com link from argv', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'https://chat.google.com/u/0/room/test',
      ]);
      expect(result).toBe('https://chat.google.com/u/0/room/test');
    });

    it('returns null when no deep link found', () => {
      const result = extractDeepLinkFromArgv(['node', 'app', '--other-flag']);
      expect(result).toBeNull();
    });

    it('prefers gogchat:// over https link', () => {
      const result = extractDeepLinkFromArgv([
        'node',
        'app',
        'https://chat.google.com/room/test',
        'gogchat://chat.google.com/room/priority',
      ]);
      expect(result).toBe('gogchat://chat.google.com/room/priority');
    });
  });

  describe('setupDeepLinkListener', () => {
    it('registers listener and routes URLs correctly', () => {
      vi.mocked(getWindowForAccount).mockReturnValue(null);
      vi.mocked(createAccountWindow).mockReturnValue(makeFakeWindow() as any);

      // First call registers
      setupDeepLinkListener();
      expect(addTrackedListener).toHaveBeenCalledWith(
        expect.anything(),
        'open-url',
        expect.any(Function),
        'DeepLink open-url'
      );

      // Second call is a no-op (module-scoped guard)
      setupDeepLinkListener();
      expect(addTrackedListener).toHaveBeenCalledTimes(1);

      const handler = vi.mocked(addTrackedListener).mock.calls[0][2];

      // Route gogchat:// URLs
      handler({ preventDefault: vi.fn() }, 'gogchat://chat.google.com/room/test');
      expect(validateDeepLinkURL).toHaveBeenCalled();

      // Route other https URLs to external browser
      handler({ preventDefault: vi.fn() }, 'https://example.com/page');
      expect(validateExternalURL).toHaveBeenCalled();

      // Ignore non-https, non-gogchat URLs
      handler({ preventDefault: vi.fn() }, 'ftp://files.example.com');
      // validateDeepLinkURL was already called from gogchat URL, but externalURL
      // was only called for the https URL above
      expect(validateExternalURL).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupDeepLinkHandler', () => {
    it('clears pending deep link without error', () => {
      cleanupDeepLinkHandler();
    });
  });
});
