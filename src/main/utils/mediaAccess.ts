/**
 * macOS camera/microphone TCC permission utility
 * Checks and requests media access permissions via macOS TCC framework.
 * Provides user-facing dialog when permissions are denied.
 */

import { type BrowserWindow, dialog, shell, systemPreferences } from 'electron';
import log from 'electron-log';
import { validateAppleSystemPreferencesURL } from '../../shared/urlValidators.js';

type MediaType = 'camera' | 'microphone';

/** In-flight deduplication map — prevents concurrent duplicate TCC prompts */
const inFlightRequests = new Map<string, Promise<boolean>>();

const SETTINGS_URLS: Record<MediaType, string> = {
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
};

const LABELS: Record<MediaType, { title: string; noun: string }> = {
  camera: { title: 'Camera', noun: 'camera' },
  microphone: { title: 'Microphone', noun: 'microphone' },
};

/**
 * Checks current TCC media access status and requests permission if not yet determined.
 *
 * @param type - The media type to check ('camera' or 'microphone')
 * @returns true if access is granted, false otherwise
 */
export function checkAndRequestMediaAccess(type: MediaType): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(true);
  }

  const existing = inFlightRequests.get(type);
  if (existing) {
    log.debug(`[MediaAccess] Returning in-flight request for ${type}`);
    return existing;
  }

  const promise = performMediaAccessCheck(type).finally(() => {
    inFlightRequests.delete(type);
  });

  inFlightRequests.set(type, promise);
  return promise;
}

async function performMediaAccessCheck(type: MediaType): Promise<boolean> {
  const status = systemPreferences.getMediaAccessStatus(type);
  log.debug(`[MediaAccess] ${type} status: ${status}`);

  switch (status) {
    case 'granted':
      return true;

    case 'not-determined':
    case 'unknown': {
      log.info(`[MediaAccess] Requesting ${type} access`);
      const granted = await systemPreferences.askForMediaAccess(type);
      log.info(`[MediaAccess] ${type} access ${granted ? 'granted' : 'denied'} by user`);
      return granted;
    }

    case 'denied':
    case 'restricted':
      log.warn(`[MediaAccess] ${type} access is ${status}`);
      return false;

    default:
      log.warn(`[MediaAccess] Unexpected ${type} status: ${String(status)}`);
      return false;
  }
}

/**
 * Shows a dialog directing the user to System Settings when media access is denied.
 *
 * @param window - The parent BrowserWindow for the dialog
 * @param type - The media type that was denied ('camera' or 'microphone')
 */
export async function showDeniedPermissionDialog(
  window: BrowserWindow,
  type: MediaType
): Promise<void> {
  const { title, noun } = LABELS[type];

  const response = await dialog.showMessageBox(window, {
    type: 'warning',
    title: `${title} Permission Required`,
    message: `GogChat needs ${noun} access`,
    detail:
      `To enable ${noun} access in GogChat:\n\n` +
      '1. Click "Open System Settings" below\n' +
      `2. Toggle the switch next to GogChat to enable ${noun} access\n` +
      '3. Restart GogChat for the change to take effect',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });

  if (response.response === 0) {
    const settingsURL = SETTINGS_URLS[type];

    try {
      const validatedURL = validateAppleSystemPreferencesURL(settingsURL);
      await shell.openExternal(validatedURL);
      log.info(`[MediaAccess] Opened System Settings ${title} pane`);
    } catch (error: unknown) {
      log.error(`[MediaAccess] Failed to open System Settings:`, error);

      try {
        await shell.openPath('/System/Applications/System Settings.app');
        log.info('[MediaAccess] Opened System Settings app (fallback)');
      } catch (fallbackError: unknown) {
        log.error('[MediaAccess] Fallback also failed:', fallbackError);
      }
    }
  }
}
