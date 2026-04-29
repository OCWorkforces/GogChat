/**
 * Badge handler helpers — extracted from badgeIcon.ts to keep that module thin.
 *
 * Owns:
 *   • decideIcon()         — pure favicon URL → IconType resolution
 *   • updateBadgeIcon()    — platform-specific dock badge update (macOS)
 *   • setupBadgeHandlers() — registers the two secure IPC handlers
 *                            (FAVICON_CHANGED + UNREAD_COUNT) with
 *                            rate limiting, deduplication, validation,
 *                            and error handling. Returns cleanup callbacks.
 */

import { app } from 'electron';
import type { BrowserWindow, Tray } from 'electron';
import log from 'electron-log';
import {
  FAVICON_PATTERNS,
  ICON_TYPES,
  IPC_CHANNELS,
  } from '../../shared/constants.js';
import type { IconType } from '../../shared/types/domain.js';
import { toErrorMessage } from '../utils/errorUtils.js';
import { createSecureIPCHandler } from '../utils/ipcHelper.js';
import { getRateLimiter } from '../utils/rateLimiter.js';
import { getDeduplicator } from '../utils/ipcDeduplicator.js';
import { validateFaviconURL } from '../../shared/urlValidators.js';
import { validateUnreadCount } from '../../shared/dataValidators.js';
import { getIconCache } from '../utils/iconCache.js';
import { setTrayUnread } from './trayIcon.js';

/**
 * Decide app icon based on favicon URL.
 */
export const decideIcon = (href: string): IconType => {
  let type: IconType = ICON_TYPES.OFFLINE;

  if (FAVICON_PATTERNS.NORMAL.test(href)) {
    type = ICON_TYPES.NORMAL;
  } else if (FAVICON_PATTERNS.BADGE.test(href)) {
    type = ICON_TYPES.BADGE;
  }

  return type;
};

/**
 * Update badge icon for macOS — uses dock badge to display unread count.
 */
export const updateBadgeIcon = (_window: BrowserWindow, count: number): void => {
  // macOS: Use dock badge
  app.setBadgeCount(count);
  log.debug(`[BadgeIcon] Dock badge updated: ${count}`);
};

export interface BadgeHandlerCleanups {
  faviconCleanup: () => void;
  unreadCleanup: () => void;
}

/**
 * Register the FAVICON_CHANGED + UNREAD_COUNT IPC handlers.
 * Returns cleanup callbacks for each.
 */
export function setupBadgeHandlers(
  window: BrowserWindow,
  trayIcon: Tray
): BadgeHandlerCleanups {
  const rateLimiter = getRateLimiter();
  const deduplicator = getDeduplicator();

  // Track current tray icon type to avoid redundant updates
  let currentTrayIconType: IconType = ICON_TYPES.OFFLINE;

  // ⚡ OPTIMIZATION: Deduplicated favicon handler to prevent redundant updates
  // Validate favicon URL and check rate limit
  const faviconCleanup = createSecureIPCHandler({
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

            // macOS: Update tray icon to reflect unread state in addition to dock badge
            setTrayUnread(type === ICON_TYPES.BADGE);

            // Non-darwin: also swap tray image to the icon-type variant
            if (process.platform !== 'darwin') {
              if (type !== currentTrayIconType) {
                currentTrayIconType = type;
                const icon = getIconCache().getIcon(`resources/icons/${type}/16.png`);
                trayIcon.setImage(icon);
                log.debug(`[BadgeIcon] Tray icon updated to type: ${type}`);
              } else {
                log.debug(`[BadgeIcon] Tray icon type unchanged (${type}), skipping update`);
              }
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
  const unreadCleanup = createSecureIPCHandler({
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

            // Update tray icon to reflect unread state
            setTrayUnread(validatedCount > 0);

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

  return { faviconCleanup, unreadCleanup };
}
