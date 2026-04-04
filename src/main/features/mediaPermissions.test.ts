/**
 * Unit tests for mediaPermissions feature
 * Tests proactive camera/microphone TCC permission checks at startup
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/mediaAccess.js', () => ({
  checkAndRequestMediaAccess: vi.fn(),
}));

import log from 'electron-log';
import { checkAndRequestMediaAccess } from '../utils/mediaAccess.js';
import mediaPermissionsInit, { cleanupMediaPermissions } from './mediaPermissions';

const mockCheckAndRequest = checkAndRequestMediaAccess as Mock;

describe('mediaPermissions', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('default (init)', () => {
    it('checks and requests camera access', async () => {
      mockCheckAndRequest.mockResolvedValue(true);

      await mediaPermissionsInit({});

      expect(mockCheckAndRequest).toHaveBeenCalledWith('camera');
    });

    it('checks and requests microphone access', async () => {
      mockCheckAndRequest.mockResolvedValue(true);

      await mediaPermissionsInit({});

      expect(mockCheckAndRequest).toHaveBeenCalledWith('microphone');
    });

    it('logs warning when camera permission is denied', async () => {
      mockCheckAndRequest.mockImplementation((type: string) => Promise.resolve(type !== 'camera'));

      await mediaPermissionsInit({});

      expect(log.warn).toHaveBeenCalledWith(
        '[MediaPermissions] Camera permission denied or restricted'
      );
    });

    it('logs warning when microphone permission is denied', async () => {
      mockCheckAndRequest.mockImplementation((type: string) =>
        Promise.resolve(type !== 'microphone')
      );

      await mediaPermissionsInit({});

      expect(log.warn).toHaveBeenCalledWith(
        '[MediaPermissions] Microphone permission denied or restricted'
      );
    });

    it('skips permission checks on non-darwin platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      await mediaPermissionsInit({});

      expect(mockCheckAndRequest).not.toHaveBeenCalled();
    });

    it('handles errors gracefully without throwing', async () => {
      mockCheckAndRequest.mockRejectedValue(new Error('TCC error'));

      await expect(mediaPermissionsInit({})).resolves.toBeUndefined();

      expect(log.error).toHaveBeenCalledWith(
        '[MediaPermissions] Failed to check media permissions:',
        expect.any(Error)
      );
    });
  });

  describe('cleanupMediaPermissions', () => {
    it('logs cleanup message', () => {
      cleanupMediaPermissions();

      expect(log.debug).toHaveBeenCalledWith('[MediaPermissions] Cleanup (no-op)');
    });
  });
});
