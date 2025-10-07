import {ipcMain, app, nativeImage, BrowserWindow, Tray} from 'electron';
import path from 'path';
import {is} from "electron-util";
import log from 'electron-log';
import {IPC_CHANNELS, FAVICON_PATTERNS, ICON_TYPES} from '../../shared/constants';
import {validateFaviconURL, validateUnreadCount} from '../../shared/validators';
import {getRateLimiter} from '../utils/rateLimiter';
import type {IconType} from '../../shared/types';

/**
 * Decide app icon based on favicon URL
 */
const decideIcon = (href: string): IconType => {
  let type: IconType = ICON_TYPES.OFFLINE;

  if (FAVICON_PATTERNS.NORMAL.test(href)) {
    type = ICON_TYPES.NORMAL;
  } else if (FAVICON_PATTERNS.BADGE.test(href)) {
    type = ICON_TYPES.BADGE;
  }

  return type;
};

export default (window: BrowserWindow, trayIcon: Tray) => {
  const rateLimiter = getRateLimiter();

  // ✅ SECURITY: Validate favicon URL and check rate limit
  ipcMain.on(IPC_CHANNELS.FAVICON_CHANGED, (evt, href) => {
    try {
      // Rate limit check
      if (!rateLimiter.isAllowed(IPC_CHANNELS.FAVICON_CHANGED)) {
        log.warn('[BadgeIcon] Favicon change rate limited');
        return;
      }

      // Validate input
      const validatedHref = validateFaviconURL(href);

      // Determine icon type
      const type = decideIcon(validatedHref);

      // Update tray icon
      const size = is.macos ? 16 : 32;
      const icon = nativeImage.createFromPath(
        path.join(app.getAppPath(), `resources/icons/${type}/${size}.png`)
      );
      trayIcon.setImage(icon);

      log.debug(`[BadgeIcon] Favicon changed to type: ${type}`);
    } catch (error) {
      log.error('[BadgeIcon] Failed to process favicon change:', error);
    }
  });

  // ✅ SECURITY: Validate unread count and check rate limit
  ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, (event, count) => {
    try {
      // Rate limit check
      if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) {
        log.warn('[BadgeIcon] Unread count rate limited');
        return;
      }

      // Validate input
      const validatedCount = validateUnreadCount(count);

      // Update badge count
      app.setBadgeCount(validatedCount);

      log.debug(`[BadgeIcon] Unread count updated: ${validatedCount}`);
    } catch (error) {
      log.error('[BadgeIcon] Failed to update unread count:', error);
    }
  });
};
