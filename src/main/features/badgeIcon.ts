import { toErrorMessage } from '../utils/errorHandler.js';
import { app, BrowserWindow, Tray } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS, FAVICON_PATTERNS, ICON_TYPES } from '../../shared/constants.js';
import { validateFaviconURL, validateUnreadCount } from '../../shared/validators.js';
import { getRateLimiter } from '../utils/rateLimiter.js';
import { getIconCache } from '../utils/iconCache.js';
import { getDeduplicator } from '../utils/ipcDeduplicator.js';
import { createSecureIPCHandler } from '../utils/ipcHelper.js';
import type { IconType } from '../../shared/types.js';

let faviconChangedCleanup: (() => void) | null = null;
let unreadCountCleanup: (() => void) | null = null;

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
  faviconChangedCleanup = createSecureIPCHandler({
    channel: IPC_CHANNELS.FAVICON_CHANGED,
    validator: validateFaviconURL,
    description: 'Badge favicon changed',
    handler: (validatedHref) => {
      // Deduplicate rapid favicon changes (e.g., during page load)
      void deduplicator.deduplicate(
        `${IPC_CHANNELS.FAVICON_CHANGED}:${validatedHref}`,
        async () => {
          try {
            if (!rateLimiter.isAllowed(IPC_CHANNELS.FAVICON_CHANGED)) {
              log.warn('[BadgeIcon] Favicon change rate limited');
              return;
            }

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
          } catch (error: unknown) {
            log.error('[BadgeIcon] Failed to process favicon change:', toErrorMessage(error));
          }
          // Return void to satisfy async function requirement
          return Promise.resolve();
        },
        150 // 150ms deduplication window
      );
    },
  });

  // ⚡ OPTIMIZATION: Deduplicated unread count handler
  // Validate unread count and check rate limit
  // Uses cached badge icons for Windows
  unreadCountCleanup = createSecureIPCHandler({
    channel: IPC_CHANNELS.UNREAD_COUNT,
    validator: validateUnreadCount,
    description: 'Badge unread count updated',
    handler: (validatedCount) => {
      // Deduplicate rapid count changes (e.g., multiple messages arriving at once)
      void deduplicator.deduplicate(
        `${IPC_CHANNELS.UNREAD_COUNT}:${validatedCount}`,
        async () => {
          try {
            if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) {
              log.warn('[BadgeIcon] Unread count rate limited');
              return;
            }

            // Update badge icon (platform-specific)
            updateBadgeIcon(window, validatedCount);

            log.debug(`[BadgeIcon] Unread count updated: ${validatedCount}`);
          } catch (error: unknown) {
            log.error('[BadgeIcon] Failed to update unread count:', toErrorMessage(error));
          }
          // Return void to satisfy async function requirement
          return Promise.resolve();
        },
        100 // 100ms deduplication window
      );
    },
  });
};

/**
 * Cleanup function for badge icon feature
 */
export function cleanupBadgeIcon(): void {
  try {
    log.debug('[BadgeIcon] Cleaning up badge icon listeners');
    if (faviconChangedCleanup) {
      faviconChangedCleanup();
      faviconChangedCleanup = null;
    }

    if (unreadCountCleanup) {
      unreadCountCleanup();
      unreadCountCleanup = null;
    }
    log.info('[BadgeIcon] Badge icon cleaned up');
  } catch (error: unknown) {
    log.error('[BadgeIcon] Failed to cleanup badge icon:', toErrorMessage(error));
  }
}
