import { BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from '../../shared/constants';
import { getRateLimiter } from '../utils/rateLimiter';

export default (window: BrowserWindow) => {
  const rateLimiter = getRateLimiter();

  // Add rate limiting to prevent notification spam
  ipcMain.on(IPC_CHANNELS.NOTIFICATION_CLICKED, (event: IpcMainEvent) => {
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
  });
};
