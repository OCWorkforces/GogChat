/**
 * Chromium-level permission request & check handlers for BrowserWindow sessions.
 * Handles media TCC integration (camera/microphone) on macOS and an allowlist
 * for non-media permissions (notifications, mediaKeySystem, geolocation).
 */

import { type BrowserWindow, systemPreferences } from 'electron';
import log from 'electron-log';
import { checkAndRequestMediaAccess, showDeniedPermissionDialog } from './mediaAccess.js';

/** Non-media permissions that are always granted */
const ALLOWED_PERMISSIONS = ['notifications', 'mediaKeySystem', 'geolocation'] as const;

/**
 * Install the asynchronous permission request handler on the window's session.
 * For 'media' permission: checks macOS TCC status before granting.
 * For non-media: uses a simple allowlist.
 */
export function installPermissionRequestHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      void (async () => {
        if (permission === 'media') {
          const mediaTypes: string[] = (details as { mediaTypes?: string[] }).mediaTypes ?? [];

          let granted = true;
          if (mediaTypes.includes('video')) {
            granted &&= await checkAndRequestMediaAccess('camera');
          }
          if (mediaTypes.includes('audio')) {
            granted &&= await checkAndRequestMediaAccess('microphone');
          }

          if (!granted) {
            // Show dialog for denied types (non-blocking — don't block callback)
            if (
              mediaTypes.includes('video') &&
              systemPreferences.getMediaAccessStatus('camera') === 'denied'
            ) {
              void showDeniedPermissionDialog(window, 'camera');
            }
            if (
              mediaTypes.includes('audio') &&
              systemPreferences.getMediaAccessStatus('microphone') === 'denied'
            ) {
              void showDeniedPermissionDialog(window, 'microphone');
            }
          }

          log.debug(
            `[Security] Media permission ${granted ? 'granted' : 'denied'}: ${mediaTypes.join(', ')}`
          );
          callback(granted);
          return;
        }

        // Non-media permissions: simple allowlist (synchronous)
        if ((ALLOWED_PERMISSIONS as readonly string[]).includes(permission)) {
          log.debug(`[Security] Permission granted: ${permission}`);
          callback(true);
        } else {
          log.warn(`[Security] Permission denied: ${permission}`);
          callback(false);
        }
      })();
    }
  );
}

/**
 * Install the synchronous permission check handler on the window's session.
 * Returns cached TCC status for media; allowlist check for others.
 */
export function installPermissionCheckHandler(window: BrowserWindow): void {
  window.webContents.session.setPermissionCheckHandler(
    (_webContents, permission, _requestingOrigin, details) => {
      if (permission === 'media') {
        const mediaType = (details as { mediaType?: string }).mediaType;
        if (mediaType === 'video') {
          return systemPreferences.getMediaAccessStatus('camera') === 'granted';
        }
        if (mediaType === 'audio') {
          return systemPreferences.getMediaAccessStatus('microphone') === 'granted';
        }
        return false;
      }
      return (ALLOWED_PERMISSIONS as readonly string[]).includes(permission);
    }
  );
}

/**
 * Install both permission handlers on a BrowserWindow's session.
 */
export function installPermissionHandlers(window: BrowserWindow): void {
  installPermissionRequestHandler(window);
  installPermissionCheckHandler(window);
}
