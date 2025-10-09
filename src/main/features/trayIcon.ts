import { app, BrowserWindow, Menu, Tray } from 'electron';
import { getIconCache } from '../utils/iconCache';

export default (window: BrowserWindow) => {
  // macOS uses 16px tray icons
  const size = 16;
  const trayIcon = new Tray(getIconCache().getIcon(`resources/icons/offline/${size}.png`));

  const handleIconClick = () => {
    // macOS: Hide only if visible AND focused (stricter condition)
    const shouldHide = window.isVisible() && window.isFocused();

    if (shouldHide) {
      app.hide();
    } else {
      window.show();
    }
  };

  trayIcon.setContextMenu(
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

  trayIcon.setToolTip('Google Chat');

  // macOS: Click events handled by context menu only (OS convention)

  return trayIcon;
};
