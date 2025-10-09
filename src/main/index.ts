import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { perfMonitor } from './utils/performanceMonitor.js';
import { compareStorePerformance } from './utils/configProfiler.js';

import reportExceptions from './features/reportExceptions.js';
import windowWrapper from './windowWrapper.js';
import { enforceSingleInstance, restoreFirstInstance } from './features/singleInstance.js';
import environment from '../environment.js';
import enableContextMenu from './features/contextMenu.js';
import runAtLogin from './features/openAtLogin.js';
import updateNotifier from './features/appUpdates.js';
import setupTrayIcon from './features/trayIcon.js';
import keepWindowState from './features/windowState.js';
import externalLinks from './features/externalLinks.js';
import badgeIcons from './features/badgeIcon.js';
import closeToTray from './features/closeToTray.js';
import setAppMenu from './features/appMenu.js';
import overrideUserAgent from './features/userAgent.js';
import setupOfflineHandlers, { checkForInternet } from './features/inOnline.js';
import logFirstLaunch from './features/firstLaunch.js';
import handleNotification from './features/handleNotification.js';
import setupCertificatePinning from './features/certificatePinning.js';
import passkeySupport from './features/passkeySupport.js';
import setupMessageLogger, { cleanupMessageLogger } from './features/messageLogger.js';
import { enforceMacOSAppLocation } from './utils/platform.js';
import { getIconCache } from './utils/iconCache.js';
import { initializeStore, getStore } from './config.js';
import { logCacheStats, type CachedStore } from './utils/configCache.js';
import type { StoreType } from '../shared/types.js';
import type Store from 'electron-store';

/**
 * Type guard to check if a store has cache enabled
 * @param store - The store to check
 * @returns True if the store has cache methods
 */
function isCachedStore(store: Store<StoreType>): store is CachedStore<StoreType> {
  return typeof (store as CachedStore<StoreType>).getCacheStats === 'function';
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;
let trayIcon = null;

// Initialize performance monitoring
perfMonitor.mark('app-start', 'App initialization started');

// Initialize store early (must happen before any code that uses the store)
try {
  initializeStore();
  perfMonitor.mark('store-initialized', 'Config store initialized');

  // Initialize certificate pinning early (before any network requests)
  setupCertificatePinning();
  perfMonitor.mark('cert-pinning-done', 'Certificate pinning setup completed');

  // Setup exception reporting
  reportExceptions();
  perfMonitor.mark('exception-reporting-done', 'Exception reporting initialized');
} catch (error) {
  log.error('[Main] Failed to initialize store or exception reporting:', error);
}

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
      void checkForInternet(mainWindow);

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

        // Message logging (if enabled)
        setupMessageLogger(mainWindow);

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

// Log cache statistics and cleanup before app quits
app.on('before-quit', () => {
  try {
    // Cleanup message logger
    cleanupMessageLogger();

    // Log icon cache stats
    const iconCache = getIconCache();
    const iconStats = iconCache.getStats();
    log.info(`[Main] Icon cache: ${iconStats.size} icons cached`);

    // Log config cache stats if available
    try {
      const storeInstance = getStore();
      if (isCachedStore(storeInstance)) {
        logCacheStats(storeInstance);
      }
    } catch {
      log.debug('[Main] Store not initialized, skipping cache stats');
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
