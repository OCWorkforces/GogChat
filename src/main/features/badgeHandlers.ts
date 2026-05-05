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
import { FAVICON_PATTERNS, ICON_TYPES, IPC_CHANNELS, RATE_LIMITS } from '../../shared/constants.js';
import type { IconType } from '../../shared/types/domain.js';
import { createSecureIPCHandler } from '../utils/ipcHelper.js';
import { deduplicationPatterns } from '../utils/ipcDeduplicationPatterns.js';
import { validateFaviconURL } from '../../shared/urlValidators.js';
import { validateUnreadCount } from '../../shared/dataValidators.js';
import { getIconCache } from '../utils/iconCache.js';
import { setTrayUnread } from './trayIcon.js';
import { assertNever } from '../../shared/typeUtils.js';

/**
 * Decide app icon based on favicon URL.
 */
export const decideIcon = (href: string): IconType => {
  let type: IconType;

  if (FAVICON_PATTERNS.NORMAL.test(href)) {
    type = ICON_TYPES.NORMAL;
  } else if (FAVICON_PATTERNS.BADGE.test(href)) {
    type = ICON_TYPES.BADGE;
  } else {
    type = ICON_TYPES.OFFLINE;
  }

  switch (type) {
    case ICON_TYPES.OFFLINE:
    case ICON_TYPES.NORMAL:
    case ICON_TYPES.BADGE:
      return type;
    default:
      return assertNever(type);
  }
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
export function setupBadgeHandlers(window: BrowserWindow, trayIcon: Tray): BadgeHandlerCleanups {
  // Track current tray icon type to avoid redundant updates
  let currentTrayIconType: IconType = ICON_TYPES.OFFLINE;

  // ⚡ OPTIMIZATION: payload-aware deduplication via createSecureIPCHandler.
  // Rapid identical favicon changes (e.g., during page load) collapse to one execution.
  const faviconCleanup = createSecureIPCHandler({
    channel: IPC_CHANNELS.FAVICON_CHANGED,
    validator: validateFaviconURL,
    rateLimit: RATE_LIMITS.IPC_FAVICON,
    description: 'Badge favicon changed',
    withDeduplication: {
      keyFn: (channel, validatedHref) =>
        deduplicationPatterns.byChannelAndFirstArg(channel, validatedHref),
      windowMs: 150,
    },
    handler: (validatedHref) => {
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
    },
  });

  // ⚡ OPTIMIZATION: payload-aware deduplication via createSecureIPCHandler.
  // Rapid identical unread-count updates (e.g., burst of incoming messages) collapse to one.
  const unreadCleanup = createSecureIPCHandler({
    channel: IPC_CHANNELS.UNREAD_COUNT,
    validator: validateUnreadCount,
    rateLimit: RATE_LIMITS.IPC_UNREAD_COUNT,
    description: 'Badge unread count updated',
    withDeduplication: {
      keyFn: (channel, validatedCount) =>
        deduplicationPatterns.byChannelAndFirstArg(channel, validatedCount),
      windowMs: 100,
    },
    handler: (validatedCount) => {
      // Update badge icon (platform-specific)
      updateBadgeIcon(window, validatedCount);

      // Update tray icon to reflect unread state
      setTrayUnread(validatedCount > 0);

      log.debug(`[BadgeIcon] Unread count updated: ${validatedCount}`);
    },
  });

  return { faviconCleanup, unreadCleanup };
}
