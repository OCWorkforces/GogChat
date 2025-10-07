import {app, BrowserWindow} from 'electron';
import log from 'electron-log';

import reportExceptions from './features/reportExceptions';
import windowWrapper from './windowWrapper';
import {enforceSingleInstance, restoreFirstInstance} from './features/singleInstance';
import environment from "../environment";
import enableContextMenu from './features/contextMenu';
import runAtLogin from './features/openAtLogin';
import updateNotifier from './features/appUpdates';
import setupTrayIcon from './features/trayIcon';
import keepWindowState from './features/windowState';
import externalLinks from './features/externalLinks';
import badgeIcons from './features/badgeIcon';
import closeToTray from './features/closeToTray';
import setAppMenu from './features/appMenu';
import overrideUserAgent from './features/userAgent';
import setupOfflineHandlers, {checkForInternet} from './features/inOnline';
import logFirstLaunch from './features/firstLaunch';
import handleNotification from './features/handleNotification';
import setupCertificatePinning from './features/certificatePinning';
import passkeySupport from './features/passkeySupport';
import { enforceMacOSAppLocation } from 'electron-util/main';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;
let trayIcon = null;

// Initialize certificate pinning early (before any network requests)
setupCertificatePinning();

// Features
reportExceptions().catch(console.error);

if (enforceSingleInstance()) {
  app.whenReady()
    .then(() => {
      // Critical path - Load essential features first
      overrideUserAgent();
      mainWindow = windowWrapper(environment.appUrl);
      setupOfflineHandlers(mainWindow);
      checkForInternet(mainWindow);

      // Critical UI features
      trayIcon = setupTrayIcon(mainWindow);
      setAppMenu(mainWindow);
      restoreFirstInstance(mainWindow);
      keepWindowState(mainWindow);

      // Security features
      externalLinks(mainWindow);
      handleNotification(mainWindow);
      passkeySupport(mainWindow);

      // Badge/notification system
      badgeIcons(mainWindow, trayIcon);
      closeToTray(mainWindow);

      // Defer non-critical features using setImmediate
      // These run after the main event loop tick, improving startup time
      setImmediate(() => {
        if (!mainWindow) {
          log.error('[Main] Main window not available for deferred features');
          return;
        }

        log.debug('[Main] Loading non-critical features');

        // Deferred features (don't block startup)
        runAtLogin(mainWindow);
        updateNotifier();
        enableContextMenu();
        logFirstLaunch();
        enforceMacOSAppLocation();

        log.info('[Main] All features initialized');
      });
    })
    .catch(error => {
      log.error('[Main] Failed to initialize application:', error);
      app.quit();
    });
}

app.setAppUserModelId('com.electron.google-chat');

app.on('window-all-closed', () => {
  app.exit();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
