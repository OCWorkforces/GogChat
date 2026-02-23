import { ipcMain, app, BrowserWindow, Tray } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, FAVICON_PATTERNS, ICON_TYPES } from '../../shared/constants.js';
import { validateFaviconURL, validateUnreadCount } from '../../shared/validators.js';
import { getRateLimiter } from '../utils/rateLimiter.js';
import { getIconCache } from '../utils/iconCache.js';
import { getDeduplicator } from '../utils/ipcDeduplicator.js';
import type { IconType } from '../../shared/types.js';

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
 * Update badge icon for macOS
 * Uses dock badge to display unread count
 */
const updateBadgeIcon = (_window: BrowserWindow, count: number) => {
  // macOS: Use dock badge
  app.setBadgeCount(count);
  log.debug(`[BadgeIcon] Dock badge updated: ${count}`);
};

export default (window: BrowserWindow, trayIcon: Tray) => {
  const rateLimiter = getRateLimiter();
  const deduplicator = getDeduplicator();

  // Track current tray icon type to avoid redundant updates
  let currentTrayIconType: IconType = ICON_TYPES.OFFLINE;

  // ⚡ OPTIMIZATION: Deduplicated favicon handler to prevent redundant updates
  // Validate favicon URL and check rate limit
  const faviconChangedHandler = (_evt: Electron.IpcMainEvent, href: string) => {
    // Deduplicate rapid favicon changes (e.g., during page load)
    void deduplicator.deduplicate(
      `${IPC_CHANNELS.FAVICON_CHANGED}:${href}`,
      async () => {
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

          // Only update tray icon if type changed (optimization)
          if (type !== currentTrayIconType) {
            currentTrayIconType = type;
            // macOS uses 16px tray icons
            const icon = getIconCache().getIcon(`resources/icons/${type}/16.png`);
            trayIcon.setImage(icon);
            log.debug(`[BadgeIcon] Tray icon updated to type: ${type}`);
          } else {
            log.debug(`[BadgeIcon] Tray icon type unchanged (${type}), skipping update`);
          }
        } catch (error) {
          log.error('[BadgeIcon] Failed to process favicon change:', error);
        }
        // Return void to satisfy async function requirement
        return Promise.resolve();
      },
      150 // 150ms deduplication window
    );
  };

  // ⚡ OPTIMIZATION: Deduplicated unread count handler
  // Validate unread count and check rate limit
  // Uses cached badge icons for Windows
  const unreadCountHandler = (_event: Electron.IpcMainEvent, count: number) => {
    // Deduplicate rapid count changes (e.g., multiple messages arriving at once)
    void deduplicator.deduplicate(
      `${IPC_CHANNELS.UNREAD_COUNT}:${count}`,
      async () => {
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
        // Return void to satisfy async function requirement
        return Promise.resolve();
      },
      100 // 100ms deduplication window
    );
  };

  ipcMain.on(IPC_CHANNELS.FAVICON_CHANGED, faviconChangedHandler);
  ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, unreadCountHandler);
};

/**
 * Cleanup function for badge icon feature
 */
export function cleanupBadgeIcon(): void {
  try {
    log.debug('[BadgeIcon] Cleaning up badge icon listeners');
    ipcMain.removeAllListeners(IPC_CHANNELS.FAVICON_CHANGED);
    ipcMain.removeAllListeners(IPC_CHANNELS.UNREAD_COUNT);
    log.info('[BadgeIcon] Badge icon cleaned up');
  } catch (error) {
    log.error('[BadgeIcon] Failed to cleanup badge icon:', error);
  }
}
