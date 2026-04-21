import type { BrowserWindow } from 'electron';
import { Menu, app, clipboard } from 'electron';
import store from '../config.js';
import environment from '../../environment.js';
import { IPC_CHANNELS } from '../../shared/constants.js';
import { getMenuAction } from './menuActionRegistry.js';
import { buildHelpSubMenu, relaunchApp } from './helpMenuBuilder.js';

export default (window: BrowserWindow) => {
  const menuItems = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        {
          label: 'Close To Tray',
          accelerator: 'CommandOrControl+W',
          click: () => {
            window.hide();
          },
        },
        {
          label: 'Relaunch',
          click: relaunchApp,
        },
        {
          role: 'minimize',
        },
        {
          label: 'Sign Out',
          click: () => {
            void window.loadURL(environment.logoutUrl);
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          accelerator: 'CommandOrControl+Q',
          click: () => {
            app.exit();
          },
        },
      ],
    },
    {
      role: 'editMenu',
    },
    {
      label: 'View',
      submenu: [
        {
          role: 'reload',
        },
        {
          role: 'forceReload',
        },
        {
          label: 'Search',
          accelerator: 'CommandOrControl+F',
          click: () => {
            window.webContents.send(IPC_CHANNELS.SEARCH_SHORTCUT);
          },
        },
        {
          label: 'Copy Current URL',
          click: () => {
            clipboard.writeText(window.webContents.getURL());
          },
        },
        {
          role: 'toggleDevTools',
          visible: environment.isDev,
        },
        {
          type: 'separator',
        },
        {
          role: 'togglefullscreen',
        },
        {
          role: 'resetZoom',
        },
        {
          role: 'zoomIn',
        },
        {
          role: 'zoomOut',
        },
      ],
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            window.webContents.goBack();
          },
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            window.webContents.goForward();
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Navigate to Home',
          accelerator: 'Alt+Home',
          click: () => {
            void window.loadURL(environment.appUrl);
          },
        },
      ],
    },
    {
      label: 'Preferences',
      submenu: [
        {
          label: 'Auto check for Updates',
          type: 'checkbox',
          enabled: true,
          checked: store.get('app.autoCheckForUpdates') as boolean,
          click: (menuItem) => {
            store.set('app.autoCheckForUpdates', menuItem.checked);
          },
        },
        {
          label: 'Auto Launch at Login',
          type: 'checkbox',
          checked: store.get('app.autoLaunchAtLogin') as boolean,
          click: (menuItem) => {
            void (async () => {
              const autoLaunchAction = getMenuAction('autoLaunch');
              if (!autoLaunchAction) return;
              const instance = autoLaunchAction.handler() as {
                enable: () => Promise<void>;
                disable: () => Promise<void>;
              };
              if (menuItem.checked) {
                await instance.enable();
              } else {
                await instance.disable();
              }

              store.set('app.autoLaunchAtLogin', menuItem.checked);
            })();
          },
        },
        {
          label: 'Start Hidden',
          type: 'checkbox',
          checked: store.get('app.startHidden') as boolean,
          click: (menuItem) => {
            store.set('app.startHidden', menuItem.checked);
          },
        },
        {
          label: 'Hide Menu Bar',
          type: 'checkbox',
          enabled: process.platform !== 'darwin',
          checked: store.get('app.hideMenuBar') as boolean,
          click: (menuItem) => {
            window.setMenuBarVisibility(!menuItem.checked);
            window.setAutoHideMenuBar(menuItem.checked);
            store.set('app.hideMenuBar', menuItem.checked);
          },
        },
        {
          label: 'Disable Spell Checker',
          type: 'checkbox',
          checked: store.get('app.disableSpellChecker') as boolean,
          click: (menuItem) => {
            window.webContents.session.setSpellCheckerEnabled(!menuItem.checked);
            store.set('app.disableSpellChecker', menuItem.checked);
          },
        },
      ],
    },
    buildHelpSubMenu(window),
  ]);

  Menu.setApplicationMenu(menuItems);
};
