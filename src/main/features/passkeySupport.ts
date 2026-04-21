/**
 * Passkey authentication support feature
 * Detects when passkey authentication fails and provides guidance to users on macOS
 */

import type { BrowserWindow } from 'electron';
import { dialog, shell } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants.js';
import { createSecureIPCHandler } from '../utils/ipcHelper.js';
import {
  isSafeObject,
  validatePasskeyFailureData,
} from '../../shared/dataValidators.js';
import { validateAppleSystemPreferencesURL } from '../../shared/urlValidators.js';
import store from '../config.js';

let passkeySupportCleanup: (() => void) | null = null;

function parsePasskeyFailureData(data: unknown): { errorType: string; timestamp: number } {
  if (!isSafeObject(data)) {
    throw new Error('Passkey failure data must be a plain object');
  }

  const validated = validatePasskeyFailureData(data.errorType);

  return {
    errorType: validated.errorType,
    timestamp:
      typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)
        ? data.timestamp
        : validated.timestamp,
  };
}

export default (window: BrowserWindow) => {
  // Only enable on macOS
  if (process.platform !== 'darwin') {
    log.debug('[Passkey Support] Not enabled on this platform');
    return;
  }

  passkeySupportCleanup = createSecureIPCHandler({
    channel: IPC_CHANNELS.PASSKEY_AUTH_FAILED,
    validator: parsePasskeyFailureData,
    rateLimit: 1 / 30,
    description: 'Passkey auth failed',
    onError: (error) => {
      log.warn('[Passkey Support] Invalid passkey failure payload:', error);
    },
    handler: async (validatedData) => {
      if (store.get('app.suppressPasskeyDialog')) {
        log.debug('[Passkey Support] Dialog suppressed by user preference');
        return;
      }

      try {
        log.info('[Passkey Support] Passkey authentication failed:', validatedData.errorType);

        const response = await dialog.showMessageBox(window, {
          type: 'info',
          title: 'Passkey Authentication Requires Permissions',
          message: 'Passkey login requires additional system permissions',
          detail:
            'To enable Touch ID and passkey authentication in GogChat:\n\n' +
            '1. Click "Open System Settings" below\n' +
            '2. Navigate to Privacy & Security\n' +
            '3. Grant GogChat permissions for:\n' +
            '   • Accessibility (or)\n' +
            '   • Input Monitoring\n' +
            '4. Restart GogChat and try again\n\n' +
            'Alternatively, you can use password-based authentication.',
          buttons: ['Open System Settings', 'Use Password Instead', "Don't Show Again"],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        });

        if (response.response === 0) {
          const settingsURL = 'x-apple.systempreferences:com.apple.preference.security?Privacy';

          try {
            const validatedSettingsURL = validateAppleSystemPreferencesURL(settingsURL);
            await shell.openExternal(validatedSettingsURL);
            log.info('[Passkey Support] Opened System Settings');
          } catch (error: unknown) {
            log.error('[Passkey Support] Failed to open System Settings:', error);

            try {
              await shell.openPath('/System/Applications/System Settings.app');
              log.info('[Passkey Support] Opened System Settings app (fallback)');
            } catch (fallbackError: unknown) {
              log.error('[Passkey Support] Fallback also failed:', fallbackError);
            }
          }
        } else if (response.response === 2) {
          store.set('app.suppressPasskeyDialog', true);
          log.info('[Passkey Support] User suppressed future dialogs');
        }
      } catch (error: unknown) {
        log.error('[Passkey Support] Error handling passkey failure:', error);
      }
    },
  });

  log.info('[Passkey Support] Feature initialized');
};

/**
 * Cleanup function for passkey support
 */
export function cleanupPasskeySupport(): void {
  try {
    log.debug('[Passkey Support] Cleaning up passkey support handler');
    if (passkeySupportCleanup) {
      passkeySupportCleanup();
      passkeySupportCleanup = null;
    }
    log.info('[Passkey Support] Passkey support cleaned up');
  } catch (error: unknown) {
    log.error('[Passkey Support] Failed to cleanup passkey support:', error);
  }
}
