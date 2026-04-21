/**
 * Proactive camera/microphone TCC permission check
 * Checks and requests macOS media permissions at startup, before any window loads.
 */

import log from 'electron-log';
import type { FeatureContext } from '../utils/featureManager.js';
import { checkAndRequestMediaAccess } from '../utils/mediaAccess.js';

export default async (_context: FeatureContext): Promise<void> => {
  try {
    if (process.platform !== 'darwin') {
      log.debug('[MediaPermissions] Skipping permission checks on non-darwin platform');
      return;
    }

    const cameraGranted = await checkAndRequestMediaAccess('camera');
    if (!cameraGranted) {
      log.warn('[MediaPermissions] Camera permission denied or restricted');
    }

    const micGranted = await checkAndRequestMediaAccess('microphone');
    if (!micGranted) {
      log.warn('[MediaPermissions] Microphone permission denied or restricted');
    }
  } catch (error: unknown) {
    log.error('[MediaPermissions] Failed to check media permissions:', error);
  }
};

/**
 * Cleanup function for media permissions feature
 */
export function cleanupMediaPermissions(): void {
  log.debug('[MediaPermissions] Cleanup (no-op)');
}
