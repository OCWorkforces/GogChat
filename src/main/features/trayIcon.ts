import { app, BrowserWindow, Menu, Tray } from 'electron';
import log from 'electron-log';
import { getIconCache } from '../utils/iconCache.js';

// Store tray icon reference for cleanup
let trayIconInstance: Tray | null = null;

export default (window: BrowserWindow) => {
  // macOS uses 16px tray icons
  const size = 16;
  trayIconInstance = new Tray(getIconCache().getIcon(`resources/icons/offline/${size}.png`));

  const handleIconClick = () => {
    // macOS: Hide only if visible AND focused (stricter condition)
    const shouldHide = window.isVisible() && window.isFocused();

    if (shouldHide) {
      app.hide();
    } else {
      window.show();
    }
  };

  trayIconInstance.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Toggle',
        click: handleIconClick,
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          // The running webpage can prevent the app from quiting via window.onbeforeunload handler
          // So lets use exit() instead of quit()
          app.exit();
        },
      },
    ])
  );

  trayIconInstance.setToolTip('Google Chat');

  // macOS: Click events handled by context menu only (OS convention)

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
  } catch (error) {
    log.error('[TrayIcon] Failed to cleanup tray icon:', error);
  }
}
