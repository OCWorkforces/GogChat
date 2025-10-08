import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { perfMonitor } from './utils/performanceMonitor';
import { compareStorePerformance } from './utils/configProfiler';

import reportExceptions from './features/reportExceptions';
import windowWrapper from './windowWrapper';
import { enforceSingleInstance, restoreFirstInstance } from './features/singleInstance';
import environment from '../environment';
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
import setupOfflineHandlers, { checkForInternet } from './features/inOnline';
import logFirstLaunch from './features/firstLaunch';
import handleNotification from './features/handleNotification';
import setupCertificatePinning from './features/certificatePinning';
import passkeySupport from './features/passkeySupport';
import { enforceMacOSAppLocation } from './utils/platform';
import { getIconCache } from './utils/iconCache';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;
let trayIcon = null;

// Initialize certificate pinning early (before any network requests)
perfMonitor.mark('app-start', 'App initialization started');
setupCertificatePinning();
perfMonitor.mark('cert-pinning-done', 'Certificate pinning setup completed');

// Features
reportExceptions().catch(console.error);

if (enforceSingleInstance()) {
  app
    .whenReady()
    .then(() => {
      perfMonitor.mark('app-ready', 'Electron app ready');

      // Critical path - Load essential features first

      // Pre-load icons to improve startup performance
      getIconCache().warmCache();
      perfMonitor.mark('icons-cached', 'Icons pre-loaded');

      overrideUserAgent();
      mainWindow = windowWrapper(environment.appUrl);
      perfMonitor.mark('window-created', 'Main window created');
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

      perfMonitor.mark('features-loaded', 'Critical features initialized');

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

        perfMonitor.mark('all-features-loaded', 'All features initialized');
        log.info('[Main] All features initialized');

        // Log performance summary
        perfMonitor.logSummary();

        // Profile config store performance (development only)
        if (environment.isDev) {
          log.info('[Main] Running config store performance analysis...');
          compareStorePerformance();
        }
      });
    })
    .catch((error) => {
      log.error('[Main] Failed to initialize application:', error);
      app.quit();
    });
}

// Log cache statistics before app quits
app.on('before-quit', () => {
  try {
    // Log icon cache stats
    const iconCache = getIconCache();
    const iconStats = iconCache.getStats();
    log.info(`[Main] Icon cache: ${iconStats.size} icons cached`);

    // Log config cache stats if available
    const store = require('./config').default;
    if (typeof store.getCacheStats === 'function') {
      const { default: logCacheStats } = require('./utils/configCache');
      logCacheStats(store);
    }
  } catch (error) {
    log.debug('[Main] Error logging cache stats on quit:', error);
  }
});

app.setAppUserModelId('com.electron.google-chat');

app.on('window-all-closed', () => {
  app.exit();
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  }
});
