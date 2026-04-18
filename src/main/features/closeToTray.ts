import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import log from 'electron-log';
import { platform } from '../utils/platformDetection.js';

let willQuit = false;
let beforeQuitHandler: (() => void) | null = null;
let closeHandler: ((event: Electron.Event) => void) | null = null;

export default (window: BrowserWindow) => {
  // Allow Mac users to exit from app via Dock context menu "Quit" item
  beforeQuitHandler = () => {
    willQuit = true;
  };
  app.on('before-quit', beforeQuitHandler);

  closeHandler = (event: Electron.Event) => {
    if (!willQuit) {
      event.preventDefault();

      if (platform.isMac) {
        app.hide();
      } else {
        window.hide();
      }
    }
  };
  window.on('close', closeHandler);
};

/**
 * Cleanup function for close to tray feature
 */
export function cleanupCloseToTray(window: BrowserWindow): void {
  try {
    log.debug('[CloseToTray] Cleaning up close to tray handlers');

    // Remove event listeners
    if (beforeQuitHandler) {
      app.removeListener('before-quit', beforeQuitHandler);
    }

    if (closeHandler && !window.isDestroyed()) {
      window.removeListener('close', closeHandler);
    }

    // Clear handler references
    beforeQuitHandler = null;
    closeHandler = null;
    willQuit = false;

    log.info('[CloseToTray] Close to tray cleaned up');
  } catch (error: unknown) {
    log.error('[CloseToTray] Failed to cleanup close to tray:', error);
  }
}
