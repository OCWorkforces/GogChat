/**
 * Unit tests for permissionHandler — Chromium permission request/check handlers.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./mediaAccess.js', () => ({
  checkAndRequestMediaAccess: vi.fn(),
  showDeniedPermissionDialog: vi.fn(),
}));

import { systemPreferences } from 'electron';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess.js';
import {
  installPermissionRequestHandler,
  installPermissionCheckHandler,
  installPermissionHandlers,
} from './permissionHandler';

const mockCheckMedia = checkAndRequestMediaAccess as Mock;
const mockShowDenied = showDeniedPermissionDialog as Mock;
const mockGetMediaStatus = systemPreferences.getMediaAccessStatus as Mock;

const TRUSTED_PERMISSION_DETAILS = {
  requestingUrl: 'https://mail.google.com/chat/u/0/',
} as const;
const UNTRUSTED_PERMISSION_DETAILS = {
  requestingUrl: 'https://evil.example/chat/u/0/',
} as const;
const TRUSTED_REQUESTING_ORIGIN = 'https://mail.google.com';
const UNTRUSTED_REQUESTING_ORIGIN = 'https://evil.example';

function createMockWindow() {
  let requestHandler: (...args: unknown[]) => unknown;
  let checkHandler: (...args: unknown[]) => unknown;

  return {
    window: {
      webContents: {
        session: {
          setPermissionRequestHandler: vi.fn((fn: (...args: unknown[]) => unknown) => {
            requestHandler = fn;
          }),
          setPermissionCheckHandler: vi.fn((fn: (...args: unknown[]) => unknown) => {
            checkHandler = fn;
          }),
        },
      },
    } as never,
    getRequestHandler: () => requestHandler!,
    getCheckHandler: () => checkHandler!,
  };
}

describe('permissionHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('installPermissionRequestHandler', () => {
    it('grants allowed non-media permissions: notifications', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'notifications', callback, TRUSTED_PERMISSION_DETAILS);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('grants allowed non-media permissions: mediaKeySystem', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'mediaKeySystem', callback, TRUSTED_PERMISSION_DETAILS);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('grants allowed non-media permissions: geolocation', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'geolocation', callback, TRUSTED_PERMISSION_DETAILS);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('denies allowed non-media permissions from untrusted origins', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'notifications', callback, UNTRUSTED_PERMISSION_DETAILS);
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('denies allowed non-media permissions when the requesting origin is missing', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'notifications', callback, {});
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('denies unknown permissions', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'clipboard-read', callback, {});
      expect(callback).toHaveBeenCalledWith(false);
    });

    it('grants media permission when camera and mic both pass TCC', async () => {
      mockCheckMedia.mockResolvedValue(true);
      mockGetMediaStatus.mockReturnValue('granted');

      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'media', callback, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video', 'audio'],
      });
      // Flush microtasks — installPermissionRequestHandler uses void async IIFE,
      // so callback fires asynchronously after the outer handler returns.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockCheckMedia).toHaveBeenCalledWith('camera');
      expect(mockCheckMedia).toHaveBeenCalledWith('microphone');
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('denies media permission when camera check fails', async () => {
      mockCheckMedia.mockImplementation((type: string) => Promise.resolve(type !== 'camera'));
      mockGetMediaStatus.mockReturnValue('denied');

      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'media', callback, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video'],
      });

      expect(callback).toHaveBeenCalledWith(false);
      expect(mockShowDenied).toHaveBeenCalledWith(window, 'camera');
    });

    it('denies media permission when mic check fails', async () => {
      mockCheckMedia.mockImplementation((type: string) => Promise.resolve(type !== 'microphone'));
      mockGetMediaStatus.mockReturnValue('denied');

      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'media', callback, {
        ...TRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['audio'],
      });

      expect(callback).toHaveBeenCalledWith(false);
      expect(mockShowDenied).toHaveBeenCalledWith(window, 'microphone');
    });

    it('handles media permission with empty mediaTypes', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'media', callback, TRUSTED_PERMISSION_DETAILS);

      // No media types requested → granted = true (nothing to deny)
      expect(callback).toHaveBeenCalledWith(true);
      expect(mockCheckMedia).not.toHaveBeenCalled();
    });

    it('denies media permission from untrusted origins without prompting TCC', async () => {
      const { window, getRequestHandler } = createMockWindow();
      installPermissionRequestHandler(window);

      const callback = vi.fn();
      await getRequestHandler()(null, 'media', callback, {
        ...UNTRUSTED_PERMISSION_DETAILS,
        mediaTypes: ['video'],
      });

      expect(callback).toHaveBeenCalledWith(false);
      expect(mockCheckMedia).not.toHaveBeenCalled();
    });
  });

  describe('installPermissionCheckHandler', () => {
    it('returns true for allowed non-media permissions', () => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      expect(getCheckHandler()(null, 'notifications', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
      expect(getCheckHandler()(null, 'mediaKeySystem', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
      expect(getCheckHandler()(null, 'geolocation', TRUSTED_REQUESTING_ORIGIN, {})).toBe(true);
    });

    it('returns false for allowed non-media permissions from untrusted origins', () => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      expect(getCheckHandler()(null, 'notifications', UNTRUSTED_REQUESTING_ORIGIN, {})).toBe(false);
    });

    it('returns false for allowed non-media permissions when the requesting origin is missing', () => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      expect(getCheckHandler()(null, 'notifications', '', {})).toBe(false);
    });

    it('returns false for disallowed permissions', () => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      expect(getCheckHandler()(null, 'clipboard-read', '', {})).toBe(false);
    });

    it('checks camera TCC status for media video', () => {
      mockGetMediaStatus.mockReturnValue('granted');

      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'media', TRUSTED_REQUESTING_ORIGIN, {
        mediaType: 'video',
      });
      expect(result).toBe(true);
      expect(mockGetMediaStatus).toHaveBeenCalledWith('camera');
    });

    it('checks microphone TCC status for media audio', () => {
      mockGetMediaStatus.mockReturnValue('denied');

      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'media', TRUSTED_REQUESTING_ORIGIN, {
        mediaType: 'audio',
      });
      expect(result).toBe(false);
      expect(mockGetMediaStatus).toHaveBeenCalledWith('microphone');
    });

    it('returns false for media permission from untrusted origins without checking TCC', () => {
      mockGetMediaStatus.mockReturnValue('granted');

      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'media', UNTRUSTED_REQUESTING_ORIGIN, {
        mediaType: 'video',
      });

      expect(result).toBe(false);
      expect(mockGetMediaStatus).not.toHaveBeenCalled();
    });

    it('returns false for unknown media type', () => {
      const { window, getCheckHandler } = createMockWindow();
      installPermissionCheckHandler(window);

      const result = getCheckHandler()(null, 'media', TRUSTED_REQUESTING_ORIGIN, {
        mediaType: 'screen',
      });
      expect(result).toBe(false);
    });
  });

  describe('installPermissionHandlers', () => {
    it('installs both request and check handlers', () => {
      const { window } = createMockWindow();
      installPermissionHandlers(window);

      const session = (
        window as {
          webContents: {
            session: { setPermissionRequestHandler: Mock; setPermissionCheckHandler: Mock };
          };
        }
      ).webContents.session;
      expect(session.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
      expect(session.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    });
  });
});
