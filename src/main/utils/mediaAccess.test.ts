/**
 * Unit tests for macOS camera/microphone TCC permission utility
 * Tests checkAndRequestMediaAccess and showDeniedPermissionDialog
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn(),
  },
  dialog: {
    showMessageBox: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../shared/validators.js', () => ({
  validateAppleSystemPreferencesURL: vi.fn((url: string) => url),
}));

import type { BrowserWindow } from 'electron';
import { systemPreferences, dialog, shell } from 'electron';
import { validateAppleSystemPreferencesURL } from '../../shared/validators.js';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess';

const mockGetMediaAccessStatus = systemPreferences.getMediaAccessStatus as Mock;
const mockAskForMediaAccess = systemPreferences.askForMediaAccess as Mock;
const mockShowMessageBox = dialog.showMessageBox as Mock;
const mockOpenExternal = shell.openExternal as Mock;
const mockOpenPath = shell.openPath as Mock;
const mockValidateURL = validateAppleSystemPreferencesURL as Mock;

describe('mediaAccess', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('checkAndRequestMediaAccess', () => {
    it('returns true when getMediaAccessStatus returns granted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted');

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(true);
      expect(mockGetMediaAccessStatus).toHaveBeenCalledWith('camera');
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    });

    it('calls askForMediaAccess when status is not-determined and returns its result', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined');
      mockAskForMediaAccess.mockResolvedValue(true);

      const result = await checkAndRequestMediaAccess('microphone');

      expect(result).toBe(true);
      expect(mockAskForMediaAccess).toHaveBeenCalledWith('microphone');
    });

    it('returns false and does not call askForMediaAccess when status is denied', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied');

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(false);
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    });

    it('returns false when status is restricted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('restricted');

      const result = await checkAndRequestMediaAccess('microphone');

      expect(result).toBe(false);
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    });

    it('treats unknown as not-determined and calls askForMediaAccess', async () => {
      mockGetMediaAccessStatus.mockReturnValue('unknown');
      mockAskForMediaAccess.mockResolvedValue(false);

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(false);
      expect(mockAskForMediaAccess).toHaveBeenCalledWith('camera');
    });

    it('returns true on non-darwin platforms without calling system APIs', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(true);
      expect(mockGetMediaAccessStatus).not.toHaveBeenCalled();
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    });

    it('deduplicates concurrent calls for the same media type', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined');
      mockAskForMediaAccess.mockResolvedValue(true);

      const promise1 = checkAndRequestMediaAccess('camera');
      const promise2 = checkAndRequestMediaAccess('camera');

      expect(promise1).toBe(promise2);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockAskForMediaAccess).toHaveBeenCalledTimes(1);
    });

    it('clears deduplication map after promise resolves so next call is fresh', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined');
      mockAskForMediaAccess.mockResolvedValue(true);

      await checkAndRequestMediaAccess('camera');

      mockAskForMediaAccess.mockResolvedValue(false);

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(false);
      expect(mockAskForMediaAccess).toHaveBeenCalledTimes(2);
    });
  });

  describe('showDeniedPermissionDialog', () => {
    const mockWindow = {} as InstanceType<typeof BrowserWindow>;

    it('shows dialog with camera-specific text when type is camera', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockShowMessageBox).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({
          title: expect.stringContaining('Camera'),
          message: expect.stringContaining('camera'),
        })
      );
    });

    it('shows dialog with microphone-specific text when type is microphone', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });

      await showDeniedPermissionDialog(mockWindow, 'microphone');

      expect(mockShowMessageBox).toHaveBeenCalledWith(
        mockWindow,
        expect.objectContaining({
          title: expect.stringContaining('Microphone'),
          message: expect.stringContaining('microphone'),
        })
      );
    });

    it('opens System Settings Camera pane when user clicks Open System Settings', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      mockOpenExternal.mockResolvedValue(undefined);

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockValidateURL).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
      );
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera'
      );
    });

    it('opens System Settings Microphone pane when user clicks Open System Settings', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      mockOpenExternal.mockResolvedValue(undefined);

      await showDeniedPermissionDialog(mockWindow, 'microphone');

      expect(mockValidateURL).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      );
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
      );
    });

    it('does nothing when user clicks Cancel', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 });

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockOpenExternal).not.toHaveBeenCalled();
      expect(mockOpenPath).not.toHaveBeenCalled();
    });

    it('falls back to shell.openPath if shell.openExternal fails', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      mockOpenExternal.mockRejectedValue(new Error('openExternal failed'));
      mockOpenPath.mockResolvedValue('');

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockOpenPath).toHaveBeenCalledWith('/System/Applications/System Settings.app');
    });

    it('validates URL via validateAppleSystemPreferencesURL before opening', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      mockValidateURL.mockImplementation(() => {
        throw new Error('Unapproved System Settings URL');
      });

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockValidateURL).toHaveBeenCalled();
      expect(mockOpenExternal).not.toHaveBeenCalled();
    });

    it('returns false for unexpected/unrecognized media access status (default case)', async () => {
      // Force an unrecognized status value to exercise the switch default branch
      mockGetMediaAccessStatus.mockReturnValue('some-future-status');

      const result = await checkAndRequestMediaAccess('camera');

      expect(result).toBe(false);
      expect(mockAskForMediaAccess).not.toHaveBeenCalled();
    });

    it('logs fallback error when both openExternal and openPath fail', async () => {
      const log = await import('electron-log');
      mockShowMessageBox.mockResolvedValue({ response: 0 });
      mockOpenExternal.mockRejectedValue(new Error('openExternal failed'));
      mockOpenPath.mockRejectedValue(new Error('openPath also failed'));

      await showDeniedPermissionDialog(mockWindow, 'camera');

      expect(mockOpenPath).toHaveBeenCalledWith('/System/Applications/System Settings.app');
      expect(log.default.error).toHaveBeenCalledWith(
        '[MediaAccess] Fallback also failed:',
        expect.any(Error)
      );
    });
  });
});
