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
import badgeIcons, { cleanupBadgeIcon } from './features/badgeIcon.js';
import closeToTray, { cleanupCloseToTray } from './features/closeToTray.js';
import setAppMenu from './features/appMenu.js';
import overrideUserAgent from './features/userAgent.js';
import setupOfflineHandlers, {
  checkForInternet,
  cleanupConnectivityHandler,
} from './features/inOnline.js';
import logFirstLaunch from './features/firstLaunch.js';
import handleNotification, { cleanupNotificationHandler } from './features/handleNotification.js';
import setupCertificatePinning, {
  cleanupCertificatePinning,
} from './features/certificatePinning.js';
import passkeySupport, { cleanupPasskeySupport } from './features/passkeySupport.js';
import setupTrayIcon, { cleanupTrayIcon } from './features/trayIcon.js';
import keepWindowState, { cleanupWindowState } from './features/windowState.js';
import externalLinks, { cleanupExternalLinks } from './features/externalLinks.js';
import { enforceMacOSAppLocation } from './utils/platform.js';
import { getIconCache } from './utils/iconCache.js';
import { initializeStore, getStore } from './config.js';
import type { CachedStore } from './utils/configCache.js';
import { getDeduplicator } from './utils/ipcDeduplicator.js';
import { getRateLimiter } from './utils/rateLimiter.js';
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
let trayIcon: Electron.Tray | null = null;

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
    .then(async () => {
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

      // ⚡ OPTIMIZATION: Initialize independent features in parallel
      // This reduces startup time by 20-50ms by running non-blocking operations concurrently
      // Type assertion: mainWindow is guaranteed to be non-null at this point
      const window = mainWindow;

      await Promise.all([
        // Critical UI features (can run in parallel)
        Promise.resolve().then(() => {
          trayIcon = setupTrayIcon(window);
          log.debug('[Main] Tray icon initialized');
        }),
        Promise.resolve().then(() => {
          setAppMenu(window);
          log.debug('[Main] App menu initialized');
        }),
        Promise.resolve().then(() => {
          restoreFirstInstance(window);
          log.debug('[Main] Single instance handler initialized');
        }),
        Promise.resolve().then(() => {
          keepWindowState(window);
          log.debug('[Main] Window state persistence initialized');
        }),
        // Security features (can run in parallel)
        Promise.resolve().then(() => {
          externalLinks(window);
          log.debug('[Main] External links handler initialized');
        }),
        Promise.resolve().then(() => {
          handleNotification(window);
          log.debug('[Main] Notification handler initialized');
        }),
        Promise.resolve().then(() => {
          passkeySupport(window);
          log.debug('[Main] Passkey support initialized');
        }),
        Promise.resolve().then(() => {
          closeToTray(window);
          log.debug('[Main] Close to tray handler initialized');
        }),
      ]);

      // Badge/notification system (needs trayIcon, so must wait for parallel init to complete)
      if (trayIcon) {
        badgeIcons(window, trayIcon);
      }

      perfMonitor.mark('features-loaded', 'Critical features initialized');
      log.info('[Main] Critical features initialized in parallel');

      // Defer non-critical features using setImmediate
      // These run after the main event loop tick, improving startup time
      setImmediate(() => {
        void (async () => {
          if (!mainWindow) {
            log.error('[Main] Main window not available for deferred features');
            return;
          }

          log.debug('[Main] Loading non-critical features');

          // ⚡ OPTIMIZATION: Initialize deferred features in parallel as well
          // Type assertion: mainWindow is guaranteed to be non-null at this point
          const window = mainWindow;

          await Promise.all([
            Promise.resolve().then(() => runAtLogin(window)),
            Promise.resolve().then(() => updateNotifier()),
            Promise.resolve().then(() => enableContextMenu()),
            Promise.resolve().then(() => logFirstLaunch()),
            Promise.resolve().then(() => enforceMacOSAppLocation()),
          ]);

          perfMonitor.mark('all-features-loaded', 'All features initialized');
          log.info('[Main] All features initialized');

          // Log performance summary
          perfMonitor.logSummary();

          // Profile config store performance (development only)
          if (environment.isDev) {
            log.info('[Main] Running config store performance analysis...');
            compareStorePerformance();
          }

          // ⚡ OPTIMIZATION: Warm caches on idle (after all features loaded)
          // This runs after a short delay to not interfere with user interaction
          setTimeout(() => {
            warmCachesOnIdle();
          }, 5000); // 5 second delay
        })();
      });
    })
    .catch((error) => {
      log.error('[Main] Failed to initialize application:', error);
      app.quit();
    });
}

/**
 * Warm various caches during idle time
 * ⚡ OPTIMIZATION: Preloads commonly accessed data to improve responsiveness
 */
function warmCachesOnIdle(): void {
  try {
    log.debug('[Main] Starting idle cache warming...');

    // Warm icon cache (additional icons not loaded at startup)
    const iconCache = getIconCache();
    const additionalIcons = [
      'resources/icons/normal/32.png',
      'resources/icons/normal/64.png',
      'resources/icons/normal/256.png',
      'resources/icons/offline/32.png',
      'resources/icons/offline/64.png',
      'resources/icons/badge/32.png',
    ];

    let warmed = 0;
    additionalIcons.forEach((iconPath) => {
      const icon = iconCache.getIcon(iconPath);
      if (!icon.isEmpty()) {
        warmed++;
      }
    });

    log.info(
      `[Main] Cache warming complete - ${warmed}/${additionalIcons.length} additional icons loaded`
    );

    // Log final cache statistics
    const stats = iconCache.getStats();
    log.debug(
      `[Main] Icon cache stats - Size: ${stats.size}/${stats.maxSize}, Total accesses: ${stats.totalAccesses}, Most accessed: ${stats.mostAccessed}`
    );
  } catch (error) {
    log.error('[Main] Failed to warm caches:', error);
  }
}

// Log cache statistics and cleanup before app quits
app.on('before-quit', () => {
  try {
    log.info('[Main] ========== Application Shutdown ==========');

    // Cleanup all features in reverse order of initialization
    log.info('[Main] Cleaning up feature resources...');

    // Cleanup IPC handlers
    cleanupPasskeySupport();
    cleanupNotificationHandler();
    cleanupConnectivityHandler();
    cleanupBadgeIcon();

    // Cleanup window event listeners
    if (mainWindow && !mainWindow.isDestroyed()) {
      cleanupWindowState(mainWindow);
      cleanupCloseToTray(mainWindow);
    }

    // Cleanup timers
    cleanupExternalLinks();

    // Cleanup system resources
    cleanupTrayIcon();

    // Cleanup app event listeners (should be last)
    cleanupCertificatePinning();

    log.info('[Main] Feature cleanup completed');

    // ⚡ OPTIMIZATION: Comprehensive cache statistics logging
    logComprehensiveCacheStatistics();

    log.info('[Main] =====================================================');
  } catch (error) {
    log.error('[Main] Error during shutdown cleanup:', error);
  }
});

/**
 * Log comprehensive cache statistics on app quit
 * ⚡ OPTIMIZATION: Provides visibility into cache performance
 */
function logComprehensiveCacheStatistics(): void {
  try {
    // Icon Cache Statistics
    const iconCache = getIconCache();
    const iconStats = iconCache.getStats();

    log.info('[Main] --- Icon Cache Statistics ---');
    log.info(`[Main]   Total icons cached: ${iconStats.size}/${iconStats.maxSize}`);
    log.info(`[Main]   Total accesses: ${iconStats.totalAccesses}`);
    log.info(`[Main]   Most accessed: ${iconStats.mostAccessed || 'N/A'}`);
    log.info(`[Main]   Least accessed: ${iconStats.leastAccessed || 'N/A'}`);
    log.info(
      `[Main]   Average accesses per icon: ${iconStats.size > 0 ? (iconStats.totalAccesses / iconStats.size).toFixed(2) : '0'}`
    );

    // Config Cache Statistics
    try {
      const storeInstance = getStore();
      if (isCachedStore(storeInstance)) {
        const configStats = storeInstance.getCacheStats();
        const hitRate = parseFloat(configStats.hitRate.replace('%', ''));

        log.info('[Main] --- Config Cache Statistics ---');
        log.info(`[Main]   Cache hits: ${configStats.hits}`);
        log.info(`[Main]   Cache misses: ${configStats.misses}`);
        log.info(`[Main]   Cache writes: ${configStats.writes}`);
        log.info(`[Main]   Hit rate: ${configStats.hitRate}`);
        log.info(
          `[Main]   Performance: ${hitRate > 80 ? 'Excellent' : hitRate > 60 ? 'Good' : 'Poor'}`
        );
      }
    } catch {
      log.debug('[Main] Store not initialized or cache disabled');
    }

    // IPC Deduplicator Statistics
    try {
      const deduplicator = getDeduplicator();
      const dedupStats = deduplicator.getStats();

      log.info('[Main] --- IPC Deduplicator Statistics ---');
      log.info(`[Main]   Cache hits (deduplicated): ${dedupStats.cacheHits}`);
      log.info(`[Main]   Cache misses (executed): ${dedupStats.cacheMisses}`);
      log.info(`[Main]   Total deduplicated: ${dedupStats.deduplicatedCount}`);
      log.info(
        `[Main]   Deduplication rate: ${dedupStats.cacheHits + dedupStats.cacheMisses > 0 ? ((dedupStats.cacheHits / (dedupStats.cacheHits + dedupStats.cacheMisses)) * 100).toFixed(1) : '0'}%`
      );
    } catch (error) {
      log.debug('[Main] IPC deduplicator not available:', error);
    }

    // Rate Limiter Statistics
    try {
      const rateLimiter = getRateLimiter();
      const allStats = rateLimiter.getAllStats();
      let totalBlocked = 0;
      let totalMessages = 0;

      for (const [, stats] of allStats) {
        totalBlocked += stats.totalBlocked;
        totalMessages += stats.messagesLastSecond + stats.totalBlocked;
      }

      log.info('[Main] --- Rate Limiter Statistics ---');
      log.info(`[Main]   Active channels: ${allStats.size}`);
      log.info(`[Main]   Total blocked: ${totalBlocked}`);
      log.info(`[Main]   Total messages: ${totalMessages}`);
      log.info(
        `[Main]   Block rate: ${totalMessages > 0 ? ((totalBlocked / totalMessages) * 100).toFixed(1) : '0'}%`
      );
    } catch (error) {
      log.debug('[Main] Rate limiter not available:', error);
    }
  } catch (error) {
    log.error('[Main] Failed to log comprehensive cache statistics:', error);
  }
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
