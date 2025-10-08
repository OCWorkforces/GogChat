/**
 * Passkey authentication support feature
 * Detects when passkey authentication fails and provides guidance to users on macOS
 */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants';
import type { PasskeyFailureData } from '../../shared/types';
import { getRateLimiter } from '../utils/rateLimiter';
import store from '../config';

export default (window: BrowserWindow) => {
  const rateLimiter = getRateLimiter();

  // Only enable on macOS
  if (process.platform !== 'darwin') {
    log.debug('[Passkey Support] Not enabled on this platform');
    return;
  }

  ipcMain.on(IPC_CHANNELS.PASSKEY_AUTH_FAILED, async (event, data: PasskeyFailureData) => {
    try {
      // Rate limiting - max 1 dialog per 30 seconds to avoid spam
      if (!rateLimiter.isAllowed(IPC_CHANNELS.PASSKEY_AUTH_FAILED, 1 / 30)) {
        log.warn('[Passkey Support] Rate limited');
        return;
      }

      // Check if user has suppressed the dialog
      if (store.get('app.suppressPasskeyDialog')) {
        log.debug('[Passkey Support] Dialog suppressed by user preference');
        return;
      }

      log.info('[Passkey Support] Passkey authentication failed:', data.errorType);

      // Show helpful dialog with instructions
      const response = await dialog.showMessageBox(window, {
        type: 'info',
        title: 'Passkey Authentication Requires Permissions',
        message: 'Passkey login requires additional system permissions',
        detail:
          'To enable Touch ID and passkey authentication in GChat:\n\n' +
          '1. Click "Open System Settings" below\n' +
          '2. Navigate to Privacy & Security\n' +
          '3. Grant GChat permissions for:\n' +
          '   • Accessibility (or)\n' +
          '   • Input Monitoring\n' +
          '4. Restart GChat and try again\n\n' +
          'Alternatively, you can use password-based authentication.',
        buttons: ['Open System Settings', 'Use Password Instead', "Don't Show Again"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });

      // Handle button clicks
      if (response.response === 0) {
        // Open System Settings - Privacy & Security pane
        // Note: macOS 13+ uses different URL scheme than older versions
        const settingsURL = 'x-apple.systempreferences:com.apple.preference.security?Privacy';

        try {
          await shell.openExternal(settingsURL);
          log.info('[Passkey Support] Opened System Settings');
        } catch (error) {
          log.error('[Passkey Support] Failed to open System Settings:', error);

          // Fallback: try to open System Settings app directly
          try {
            await shell.openPath('/System/Applications/System Settings.app');
            log.info('[Passkey Support] Opened System Settings app (fallback)');
          } catch (fallbackError) {
            log.error('[Passkey Support] Fallback also failed:', fallbackError);
          }
        }
      } else if (response.response === 2) {
        // Don't show again
        store.set('app.suppressPasskeyDialog', true);
        log.info('[Passkey Support] User suppressed future dialogs');
      }
      // response === 1 means "Use Password Instead" - just close the dialog
    } catch (error) {
      log.error('[Passkey Support] Error handling passkey failure:', error);
    }
  });

  log.info('[Passkey Support] Feature initialized');
};
