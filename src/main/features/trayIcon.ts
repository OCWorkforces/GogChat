import {app, BrowserWindow, Menu, Tray} from 'electron';
import { platform } from '../utils/platform';
import {getIconCache} from '../utils/iconCache';

export default (window: BrowserWindow) => {
  const size = platform.isMac ? 16 : 32;
  const trayIcon = new Tray(getIconCache().getIcon(`resources/icons/offline/${size}.png`));

  const handleIconClick = () => {
    const shouldHide = platform.isWindows ? (window.isVisible() || window.isFocused()) : (window.isVisible() && window.isFocused());

    if (shouldHide) {
      if (platform.isMac) {
        app.hide()
      } else {
        window.hide()
      }
    } else {
      window.show()
    }
  }

  trayIcon.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Toggle',
      click: handleIconClick
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        // The running webpage can prevent the app from quiting via window.onbeforeunload handler
        // So lets use exit() instead of quit()
        app.exit()
      }
    }
  ]));

  trayIcon.setToolTip('Google Chat');

  if (platform.isWindows) {
    trayIcon.on('click', handleIconClick);
  }

  return trayIcon;
}
