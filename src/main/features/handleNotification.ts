import { BrowserWindow, ipcMain, IpcMainEvent, Notification } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, TIMING, RATE_LIMITS } from '../../shared/constants.js';
import { validateNotificationData } from '../../shared/validators.js';
import { getRateLimiter } from '../utils/rateLimiter.js';

// Store active notifications and their timeouts
const activeNotifications = new Map<
  string,
  {
    notification: Notification;
    timeout: NodeJS.Timeout;
  }
>();

export default (window: BrowserWindow) => {
  const rateLimiter = getRateLimiter();

  // Handle notification creation
  const notificationShowHandler = (_event: IpcMainEvent, data: unknown) => {
    try {
      // Rate limit check
      if (!rateLimiter.isAllowed(IPC_CHANNELS.NOTIFICATION_SHOW, RATE_LIMITS.IPC_NOTIFICATION)) {
        log.warn('[Notification] Notification creation rate limited');
        return;
      }

      // Validate notification data
      const validated = validateNotificationData(data);
      log.debug('[Notification] Creating notification:', validated.title);

      // Create native Electron notification
      const notification = new Notification({
        title: validated.title,
        body: validated.body,
        icon: validated.icon,
        silent: false,
      });

      // Handle notification click
      notification.on('click', () => {
        try {
          // Bring window to focus if hidden or not focused
          if (!window.isVisible() || !window.isFocused()) {
            window.show();
            log.debug('[Notification] Window shown from notification click');
          }
        } catch (error: unknown) {
          log.error('[Notification] Failed to handle notification click:', error);
        }
      });

      // Handle notification close
      notification.on('close', () => {
        // Clean up from active notifications map
        if (validated.tag) {
          const entry = activeNotifications.get(validated.tag);
          if (entry) {
            clearTimeout(entry.timeout);
            activeNotifications.delete(validated.tag);
          }
        }
        log.debug('[Notification] Notification closed:', validated.title);
      });

      // Show the notification
      notification.show();

      // Set up auto-dismiss timeout (10 seconds)
      const timeout = setTimeout(() => {
        try {
          notification.close();
          log.debug('[Notification] Notification auto-dismissed after 10s:', validated.title);
          } catch (error: unknown) {
          log.error('[Notification] Failed to auto-dismiss notification:', error);
        }
      }, TIMING.NOTIFICATION_AUTO_DISMISS);

      // Store notification and timeout for cleanup
      if (validated.tag) {
        // If there's already a notification with this tag, close it first
        const existing = activeNotifications.get(validated.tag);
        if (existing) {
          clearTimeout(existing.timeout);
          existing.notification.close();
        }

        activeNotifications.set(validated.tag, {
          notification,
          timeout,
        });
      }
    } catch (error: unknown) {
      log.error('[Notification] Failed to create notification:', error);
    }
  };

  // Handle notification click from preload (legacy support)
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
    } catch (error: unknown) {
      log.error('[Notification] Failed to handle notification click:', error);
    }
  };

  ipcMain.on(IPC_CHANNELS.NOTIFICATION_SHOW, notificationShowHandler);
  ipcMain.on(IPC_CHANNELS.NOTIFICATION_CLICKED, notificationClickedHandler);
};

/**
 * Cleanup function for notification handler
 */
export function cleanupNotificationHandler(): void {
  try {
    log.debug('[Notification] Cleaning up notification handler');

    // Close all active notifications and clear timeouts
    activeNotifications.forEach((entry) => {
      clearTimeout(entry.timeout);
      entry.notification.close();
    });
    activeNotifications.clear();

    // Remove IPC listeners
    ipcMain.removeAllListeners(IPC_CHANNELS.NOTIFICATION_SHOW);
    ipcMain.removeAllListeners(IPC_CHANNELS.NOTIFICATION_CLICKED);

    log.info('[Notification] Notification handler cleaned up');
  } catch (error: unknown) {
    log.error('[Notification] Failed to cleanup notification handler:', error);
  }
}
