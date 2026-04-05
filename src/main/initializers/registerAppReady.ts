/**
 * App Ready Initializer
 *
 * Encapsulates the app.whenReady() body that was previously inline in index.ts.
 * Handles error handler init, global cleanup registration, phased feature initialization,
 * store init, account window manager setup, icon cache warming, and deferred feature loading.
 *
 * The initialization order is security-critical — do not reorder phases.
 */

import { app, type BrowserWindow } from 'electron';
import log from 'electron-log';
import path from 'path';
import { perfMonitor } from '../utils/performanceMonitor.js';
import { initializeErrorHandler } from '../utils/errorHandler.js';
import { getCleanupManager } from '../utils/resourceCleanup.js';
import { initializeStore } from '../config.js';
import { getIconCache } from '../utils/iconCache.js';
import {
  getAccountWindowManager,
  createAccountWindow,
  getWindowForAccount,
} from '../utils/accountWindowManager.js';
import { createTrackedTimeout } from '../utils/trackedResources.js';
import { compareStorePerformance } from '../utils/configProfiler.js';
import environment from '../../environment.js';
import type { FeatureManager } from '../utils/featureManager.js';
import type { WindowFactory } from '../../shared/types.js';

/**
 * Options for registerAppReady
 */
interface AppReadyOptions {
  /** The global feature manager instance */
  featureManager: FeatureManager;
  /** Window factory for account window manager */
  windowFactory: WindowFactory;
  /** Callback to set the mainWindow reference in index.ts module scope */
  setMainWindow: (win: BrowserWindow | null) => void;
  /** Callback to get the mainWindow reference from index.ts module scope */
  getMainWindow: () => BrowserWindow | null;
}

/**
 * Register the app.whenReady() handler with all initialization logic.
 *
 * This is the core app lifecycle handler extracted from index.ts.
 * Phases execute in order: security → critical → store → account windows → ui → deferred.
 */
export function registerAppReady(options: AppReadyOptions): void {
  const { featureManager, windowFactory, setMainWindow, getMainWindow } = options;

  app
    .whenReady()
    .then(async () => {
      perfMonitor.mark('app-ready', 'Electron app ready');

      // ===== INITIALIZE ERROR HANDLER =====
      try {
        initializeErrorHandler({
          gracefulShutdown: true,
        });
        log.info('[Main] Centralized error handler initialized');
      } catch (error: unknown) {
        log.error('[Main] Failed to initialize error handler:', error);
      }

      // Register built-in global cleanup callbacks
      {
        const manager = getCleanupManager();
        const { destroyRateLimiter } = await import('../utils/rateLimiter.js');
        manager.registerGlobalCleanupCallback('rateLimiter', destroyRateLimiter, 'Rate limiter');
        const { destroyDeduplicator } = await import('../utils/ipcDeduplicator.js');
        manager.registerGlobalCleanupCallback('deduplicator', destroyDeduplicator, 'Deduplicator');
        const { cleanupGlobalHandlers } = await import('../utils/ipcHelper.js');
        manager.registerGlobalCleanupCallback('ipcHandlers', cleanupGlobalHandlers, 'IPC handlers');
        const { getIconCache: getIconCacheLazy } = await import('../utils/iconCache.js');
        manager.registerGlobalCleanupCallback(
          'iconCache',
          () => getIconCacheLazy().clear(),
          'Icon cache'
        );
        const { clearConfigCache } = await import('../utils/configCache.js');
        manager.registerGlobalCleanupCallback('configCache', clearConfigCache, 'Config cache');
      }

      // ===== SECURITY PHASE =====
      await featureManager.initializePhase('security');

      // ===== CRITICAL PHASE =====
      await featureManager.initializePhase('critical');

      // ===== STORE INITIALIZATION =====
      // Ensure store is initialized after app.ready (safeStorage requires it on macOS)
      try {
        await initializeStore();
        log.info('[Main] Config store initialized');
      } catch (error: unknown) {
        log.error('[Main] Failed to initialize store after app.ready:', error);
        throw error;
      }

      // ===== ACCOUNT WINDOW MANAGER INITIALIZATION =====
      const accountWindowManager = getAccountWindowManager(windowFactory);
      perfMonitor.mark('account-manager-init', 'Account window manager initialized');

      // Create account-0 window (primary window)
      createAccountWindow(environment.appUrl, 0);
      accountWindowManager.markAsBootstrap(0);
      perfMonitor.mark('window-created', 'Main window created');

      // Get the created window and use it as mainWindow for features
      // This preserves single-window behavior for account-0 while preparing for multi-account
      const mainWindow = getWindowForAccount(0);
      setMainWindow(mainWindow);

      // Update feature context with mainWindow and account manager
      featureManager.updateContext({ mainWindow, accountWindowManager });
      perfMonitor.mark('account-0-ready', 'Account-0 window ready');

      // ===== POST-WINDOW ICON WARMUP =====
      getIconCache().warmCache();
      perfMonitor.mark('icons-cached', 'Icons pre-loaded');

      // ===== UI PHASE =====
      await featureManager.initializePhase('ui');

      perfMonitor.mark('features-loaded', 'Critical features initialized');
      log.info('[Main] Critical features initialized');

      // ===== DEFERRED PHASE =====
      // Defer non-critical features using setImmediate
      // These run after the main event loop tick, improving startup time
      setImmediate(() => {
        void (async () => {
          const currentMainWindow = getMainWindow();
          if (!currentMainWindow) {
            log.error('[Main] Main window not available for deferred features');
            return;
          }

          log.debug('[Main] Loading non-critical features with dynamic imports');
          perfMonitor.mark('deferred-features-start', 'Starting deferred feature loading');

          // Initialize deferred features (parallel with dynamic imports)
          await featureManager.initializePhase('deferred');

          perfMonitor.mark('all-features-loaded', 'All features initialized', true);
          log.info('[Main] All features initialized');

          // Log performance summary
          perfMonitor.logSummary();

          // Export metrics in development
          if (environment.isDev) {
            if (process.env.ENABLE_CONFIG_PROFILING === 'true') {
              log.info('[Main] Running config store performance analysis...');
              compareStorePerformance();
            }

            // Export performance metrics to JSON
            perfMonitor.exportToJSON(
              path.join(app.getPath('userData'), 'performance-metrics.json')
            );
          }

          // ⚡ OPTIMIZATION: Warm caches on idle (after all features loaded)
          createTrackedTimeout(
            () => {
              warmCachesOnIdle();
            },
            5000,
            'idle-cache-warming'
          );
        })();
      });
    })
    .catch((error: unknown) => {
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
  } catch (error: unknown) {
    log.error('[Main] Failed to warm caches:', error);
  }
}
