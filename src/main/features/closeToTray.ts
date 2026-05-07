import type { BrowserWindow } from 'electron';
import { app } from 'electron';
import log from 'electron-log';
import { platform } from '../utils/platformDetection.js';
import { getAccountWindowManager } from '../utils/accountWindowManager.js';
import { asAccountIndex } from '../../shared/types/branded.js';
import type { IAccountWindowManager } from '../../shared/types/window.js';

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

      // Dehydrate background accounts 1+ when closing to tray.
      // Account-0 stays alive for badge/notification updates.
      try {
        const manager = getAccountWindowManager();
        dehydrateBackgroundAccounts(manager);
      } catch {
        // Fail silently — dehydration is a memory optimization, not critical.
      }

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
 * Dehydrate every non-primary account window so the tray-only state holds
 * only account-0 in memory. Account-0 is intentionally preserved to keep
 * badges and notifications flowing while the app is hidden.
 */
function dehydrateBackgroundAccounts(manager: IAccountWindowManager): void {
  const accountCount = manager.getAccountCount();
  for (let i = 1; i < accountCount; i++) {
    const idx = asAccountIndex(i);
    if (manager.hasAccount(idx) && !manager.isDehydrated(idx)) {
      manager.dehydrateAccount(idx);
      log.debug(`[CloseToTray] Dehydrated account ${i} on tray close`);
    }
  }
}

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
