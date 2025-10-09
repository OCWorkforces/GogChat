import { BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants.js';
import { getRateLimiter } from '../utils/rateLimiter.js';

export default (window: BrowserWindow) => {
  const rateLimiter = getRateLimiter();

  // Add rate limiting to prevent notification spam
  const notificationClickedHandler = (_event: IpcMainEvent) => {
    try {
      // Rate limit check (max 5 clicks per second)
      if (!rateLimiter.isAllowed(IPC_CHANNELS.NOTIFICATION_CLICKED, 5)) {
        log.warn('[Notification] Notification click rate limited');
        return;
      }

      // Bring window to focus if hidden or not focused
      if (!window.isVisible() || !window.isFocused()) {
        window.show();
        log.debug('[Notification] Window shown from notification click');
      }
    } catch (error) {
      log.error('[Notification] Failed to handle notification click:', error);
    }
  };

  ipcMain.on(IPC_CHANNELS.NOTIFICATION_CLICKED, notificationClickedHandler);
};

/**
 * Cleanup function for notification handler
 */
export function cleanupNotificationHandler(): void {
  try {
    log.debug('[Notification] Cleaning up notification handler');
    ipcMain.removeAllListeners(IPC_CHANNELS.NOTIFICATION_CLICKED);
    log.info('[Notification] Notification handler cleaned up');
  } catch (error) {
    log.error('[Notification] Failed to cleanup notification handler:', error);
  }
}
