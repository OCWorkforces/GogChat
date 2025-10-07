import {ipcMain, app, nativeImage, BrowserWindow, Tray, NativeImage} from 'electron';
import path from 'path';
import {is} from "electron-util";
import log from 'electron-log';
import {IPC_CHANNELS, FAVICON_PATTERNS, ICON_TYPES, BADGE} from '../../shared/constants';
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

/**
 * Badge icon cache for Windows
 * Caches overlay icon instances to avoid repeated file I/O
 */
const badgeIconCache = new Map<string, NativeImage>();

/**
 * Get or create a badge overlay icon for Windows taskbar
 * For now, uses a generic badge icon from resources
 * TODO: Future enhancement - render count on icon using canvas package
 */
const getBadgeOverlayIcon = (count: number): NativeImage | null => {
  if (count <= 0) {
    return null; // No badge needed
  }

  const cacheKey = count > 0 ? 'badge' : 'none';

  // Check cache first
  if (badgeIconCache.has(cacheKey)) {
    return badgeIconCache.get(cacheKey)!;
  }

  try {
    // Use badge icon from resources (16x16 for Windows overlay)
    const iconPath = path.join(app.getAppPath(), 'resources/icons/badge/16.png');
    const icon = nativeImage.createFromPath(iconPath);

    // Cache the icon
    badgeIconCache.set(cacheKey, icon);
    log.debug(`[BadgeIcon] Cached overlay icon: ${cacheKey}`);

    return icon;
  } catch (error) {
    log.error('[BadgeIcon] Failed to load badge overlay icon:', error);
    return null;
  }
};

/**
 * Update badge icon based on platform
 */
const updateBadgeIcon = (window: BrowserWindow, count: number) => {
  if (is.windows) {
    // Windows: Use overlay icon on taskbar
    const icon = getBadgeOverlayIcon(count);
    const description = count > 0 ? `${count} unread messages` : '';
    window.setOverlayIcon(icon, description);
    log.debug(`[BadgeIcon] Windows overlay icon updated: ${count}`);
  }

  // All platforms: Update badge count (dock on macOS, app icon on Linux)
  app.setBadgeCount(count);
};

export default (window: BrowserWindow, trayIcon: Tray) => {
  const rateLimiter = getRateLimiter();

  // Validate favicon URL and check rate limit
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

  // Validate unread count and check rate limit
  // Uses cached badge icons for Windows
  ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, (event, count) => {
    try {
      // Rate limit check
      if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) {
        log.warn('[BadgeIcon] Unread count rate limited');
        return;
      }

      // Validate input
      const validatedCount = validateUnreadCount(count);

      // Update badge icon (platform-specific)
      updateBadgeIcon(window, validatedCount);

      log.debug(`[BadgeIcon] Unread count updated: ${validatedCount}`);
    } catch (error) {
      log.error('[BadgeIcon] Failed to update unread count:', error);
    }
  });
};
