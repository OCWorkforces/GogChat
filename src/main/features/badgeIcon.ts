/**
 * badgeIcon feature — thin registration layer.
 *
 * Delegates all IPC handler logic (favicon → icon type, unread count →
 * dock badge) to ./badgeHandlers.ts. This module only owns the feature
 * lifecycle: holding cleanup references and exposing cleanupBadgeIcon().
 */

import type { BrowserWindow, Tray } from 'electron';
import log from 'electron-log';
import { toErrorMessage } from '../utils/errorUtils.js';
import { setupBadgeHandlers } from './badgeHandlers.js';

let faviconChangedCleanup: (() => void) | null = null;
let unreadCountCleanup: (() => void) | null = null;

export default (window: BrowserWindow, trayIcon: Tray): void => {
  const { faviconCleanup, unreadCleanup } = setupBadgeHandlers(window, trayIcon);
  faviconChangedCleanup = faviconCleanup;
  unreadCountCleanup = unreadCleanup;
};

/**
 * Cleanup function for badge icon feature.
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
