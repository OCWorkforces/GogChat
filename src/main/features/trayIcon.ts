import type { BrowserWindow, NativeImage } from 'electron';
import { app, Menu, Tray } from 'electron';
import log from 'electron-log';
import { getIconCache } from '../utils/iconCache.js';

// Store tray icon reference for cleanup
let trayIconInstance: Tray | null = null;

/**
 * Get the tray icon image from the icon cache
 * Uses macOS Template naming convention for automatic light/dark mode support
 * @returns NativeImage for the tray icon
 */
function getTrayIconImage(): NativeImage {
  // macOS uses Template images for automatic dark/light mode adaptation
  // The file must be named with 'Template' suffix
  return getIconCache().getIcon('resources/icons/tray/iconTemplate.png');
}

function getTrayUnreadImage(): NativeImage {
  // Monochrome Template image with a filled dot — macOS auto-tints for light/dark
  return getIconCache().getIcon('resources/icons/tray/iconUnreadTemplate.png');
}

export default (window: BrowserWindow) => {
  const trayIcon = getTrayIconImage();
  trayIconInstance = new Tray(trayIcon);
  trayIconInstance.setIgnoreDoubleClickEvents(true);

  const handleOpenClick = () => {
    if (window.isMinimized()) {
      window.restore();
    } else {
      window.show();
    }
    window.focus();
  };

  const handleAboutClick = () => {
    app.showAboutPanel();
  };

  const handleQuitClick = () => {
    // The running webpage can prevent the app from quitting via window.onbeforeunload handler
    // So let's use exit() instead of quit()
    app.exit();
  };

  trayIconInstance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open GogChat',
        click: handleOpenClick,
      },
      {
        type: 'separator',
      },
      {
        label: 'About',
        click: handleAboutClick,
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: handleQuitClick,
      },
    ])
  );

  trayIconInstance.setToolTip('GogChat');

  // macOS: Click on tray icon shows the window
  trayIconInstance.on('click', handleOpenClick);

  return trayIconInstance;
};

/**
 * Cleanup function for tray icon
 */
export function cleanupTrayIcon(): void {
  try {
    log.debug('[TrayIcon] Cleaning up tray icon');

    if (trayIconInstance && !trayIconInstance.isDestroyed()) {
      trayIconInstance.destroy();
      trayIconInstance = null;
    }

    log.info('[TrayIcon] Tray icon cleaned up');
  } catch (error: unknown) {
    log.error('[TrayIcon] Failed to cleanup tray icon:', error);
  }
}

/**
 * Update the tray icon to reflect unread message state.
 * Swaps between the default Template icon and the unread-dot Template icon.
 * No-ops if state is unchanged to prevent redundant redraws.
 */
let currentTrayUnread: boolean | null = null;

export function setTrayUnread(hasUnread: boolean): void {
  if (!trayIconInstance || trayIconInstance.isDestroyed()) return;
  if (currentTrayUnread === hasUnread) return;

  currentTrayUnread = hasUnread;
  const image = hasUnread ? getTrayUnreadImage() : getTrayIconImage();
  trayIconInstance.setImage(image);
  log.debug(`[TrayIcon] Tray icon updated — unread: ${String(hasUnread)}`);
}
