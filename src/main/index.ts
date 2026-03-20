import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { perfMonitor } from './utils/performanceMonitor.js';
import { compareStorePerformance } from './utils/configProfiler.js';

import path from 'path';
import { enforceSingleInstance, restoreFirstInstance } from './features/singleInstance.js';
import { setupDeepLinkListener } from './features/deepLinkHandler.js';
import environment from '../environment.js';
// Critical features only - loaded synchronously
import overrideUserAgent from './features/userAgent.js';
import setupCertificatePinning, {
  cleanupCertificatePinning,
} from './features/certificatePinning.js';
import { getIconCache } from './utils/iconCache.js';
import { initializeStore, getStore } from './config.js';
import type { CachedStore } from './utils/configCache.js';
import { getDeduplicator } from './utils/ipcDeduplicator.js';
import { getRateLimiter } from './utils/rateLimiter.js';
import { createTrackedTimeout } from './utils/resourceCleanup.js';
import type { StoreType } from '../shared/types.js';
import type Store from 'electron-store';

import { getFeatureManager, createFeature, createLazyFeature } from './utils/featureManager.js';
import { initializeErrorHandler } from './utils/errorHandler.js';
import {
  getAccountWindowManager,
  createAccountWindow,
  getWindowForAccount,
  destroyAccountWindowManager,
  getMostRecentWindow,
} from './utils/accountWindowManager.js';

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS ??= 'true';
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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

// ===== Initialize Error Handler and Store =====
// Synchronous initialization at module level
try {
  // Initialize store first
  initializeStore();
  perfMonitor.mark('store-initialized', 'Config store initialized');
  log.info('[Main] Config store initialized');
} catch (error: unknown) {
  log.error('[Main] Failed to initialize store:', error);
}

// Error handler will be initialized asynchronously in app.whenReady

// ===== Feature Registration =====
const featureManager = getFeatureManager();

// Register all features with dependencies and priorities
featureManager.registerAll([
  // ===== SECURITY PHASE =====
  // These are initialized BEFORE app.whenReady() for security
  createFeature(
    'certificatePinning',
    'security',
    () => {
      setupCertificatePinning();
      perfMonitor.mark('cert-pinning-done', 'Certificate pinning setup completed');
    },
    {
      cleanup: () => {
        cleanupCertificatePinning();
      },
      description: 'SSL certificate validation for Google domains',
      required: true,
    }
  ),

  createLazyFeature(
    'reportExceptions',
    'security',
    () => import('./features/reportExceptions.js'),
    {
      description: 'Unhandled exception reporting',
      required: true,
    }
  ),

  // ===== CRITICAL PHASE =====
  // Core features that must be initialized during app.whenReady (sequential)
  createFeature('userAgent', 'critical', () => overrideUserAgent(), {
    description: 'Custom User-Agent override',
  }),

  // Offline handlers moved to deferred (not critical for initial render)

  // ===== UI PHASE =====
  // Minimal UI - only single instance handler synchronous
  createFeature(
    'singleInstance',
    'ui',
    ({ accountWindowManager }) => {
      // Pass account window manager for dynamic window lookup on second-instance
      restoreFirstInstance({ accountWindowManager });
    },
    {
      description: 'Single instance restoration handler',
    }
  ),

  createFeature(
    'deepLinkHandler',
    'ui',
    async ({ accountWindowManager }) => {
      const module = await import('./features/deepLinkHandler.js');
      // Pass account window manager for dynamic window lookup
      module.default({ accountWindowManager });
    },
    {
      cleanup: async () => {
        const module = await import('./features/deepLinkHandler.js');
        module.cleanupDeepLinkHandler();
      },
      description: 'Custom protocol (gogchat://) handler',
    }
  ),

  createFeature(
    'bootstrapPromotion',
    'ui',
    async () => {
      const module = await import('./features/bootstrapPromotion.js');
      module.default();
    },
    {
      cleanup: async () => {
        const module = await import('./features/bootstrapPromotion.js');
        module.cleanupBootstrapPromotion();
      },
      description: 'Bootstrap window promotion after first login',
    }
  ),

  // ===== DEFERRED PHASE =====
  // Non-critical features loaded asynchronously with dynamic imports

  // Tray icon - load first as other features depend on it
  createLazyFeature(
    'trayIcon',
    'deferred',
    async () => {
      const module = await import('./features/trayIcon.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            trayIcon = module.default(mainWindow);
            featureManager.updateContext({ trayIcon });
          }
        },
      };
    },
    {
      description: 'System tray icon',
    }
  ),

  // App menu
  createLazyFeature(
    'appMenu',
    'deferred',
    async () => {
      const module = await import('./features/appMenu.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    {
      description: 'Application menu',
    }
  ),

  // Badge icons - depends on trayIcon
  createLazyFeature(
    'badgeIcons',
    'deferred',
    async () => {
      const module = await import('./features/badgeIcon.js');
      return {
        default: ({ mainWindow, trayIcon }) => {
          if (mainWindow && trayIcon) {
            module.default(mainWindow, trayIcon);
          }
        },
      };
    },
    {
      dependencies: ['trayIcon'],
      description: 'Badge/overlay icon for unread count',
    }
  ),

  // Window state persistence
  createLazyFeature(
    'windowState',
    'deferred',
    async () => {
      const module = await import('./features/windowState.js');
      return {
        default: ({ accountWindowManager }) => {
          // Pass account window manager for dynamic window resolution
          module.default({ accountWindowManager });
        },
      };
    },
    {
      description: 'Window state persistence',
    }
  ),

  // Passkey support
  createLazyFeature(
    'passkeySupport',
    'deferred',
    async () => {
      const module = await import('./features/passkeySupport.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    {
      description: 'Passkey/WebAuthn support',
    }
  ),

  // Notification handler
  createLazyFeature(
    'handleNotification',
    'deferred',
    async () => {
      const module = await import('./features/handleNotification.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    {
      description: 'Native notification handler',
    }
  ),

  // Offline/connectivity monitoring
  createLazyFeature(
    'inOnline',
    'deferred',
    async () => {
      const module = await import('./features/inOnline.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
            void module.checkForInternet(mainWindow);
          }
        },
      };
    },
    {
      description: 'Internet connectivity monitoring',
    }
  ),

  // External links handler
  createLazyFeature(
    'externalLinks',
    'deferred',
    async () => {
      const module = await import('./features/externalLinks.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    {
      description: 'External links handler',
    }
  ),

  // Close to tray behavior
  createLazyFeature(
    'closeToTray',
    'deferred',
    async () => {
      const module = await import('./features/closeToTray.js');
      return {
        default: ({ mainWindow }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    {
      description: 'Close to tray behavior',
    }
  ),

  // Auto-launch
  createLazyFeature('openAtLogin', 'deferred', () => import('./features/openAtLogin.js'), {
    description: 'Auto-launch on system startup',
  }),

  // Update checker
  createLazyFeature('appUpdates', 'deferred', () => import('./features/appUpdates.js'), {
    description: 'Update notification system',
  }),

  // Context menu
  createLazyFeature(
    'contextMenu',
    'deferred',
    async () => {
      const module = await import('./features/contextMenu.js');
      return {
        default: () => {
          module.default(); // Call and discard cleanup function
        },
      };
    },
    {
      description: 'Right-click context menu',
    }
  ),

  // First launch logging
  createLazyFeature('firstLaunch', 'deferred', () => import('./features/firstLaunch.js'), {
    description: 'First launch logging',
  }),

  // macOS app location enforcement
  createLazyFeature(
    'enforceMacOSAppLocation',
    'deferred',
    async () => {
      const module = await import('./utils/platform.js');
      return {
        default: () => module.enforceMacOSAppLocation(),
      };
    },
    {
      description: 'macOS app location enforcement',
    }
  ),

  // Bootstrap promotion - promotes account-0 from login landing to authenticated session
  createLazyFeature(
    'bootstrapPromotion',
    'deferred',
    async () => {
      const module = await import('./features/bootstrapPromotion.js');
      return {
        default: () => module.default(),
        cleanup: () => module.cleanupBootstrapPromotion(),
      };
    },
    {
      description: 'Promotes bootstrap window after first login',
    }
  ),
]);

if (enforceSingleInstance()) {
  // Register deep link listener BEFORE app.ready (macOS fires open-url early)
  setupDeepLinkListener();

  app
    .whenReady()
    .then(async () => {
      perfMonitor.mark('app-ready', 'Electron app ready');

      // ===== INITIALIZE ERROR HANDLER =====
      // Initialize error handler
      try {
        initializeErrorHandler({
          gracefulShutdown: true,
        });
        log.info('[Main] Centralized error handler initialized');
      } catch (error: unknown) {
        log.error('[Main] Failed to initialize error handler:', error);
      }

      // ===== SECURITY PHASE =====
      // Initialize security features first (sequential)
      await featureManager.initializePhase('security');

      // ===== CRITICAL PHASE =====
      // Initialize critical features (sequential)
      await featureManager.initializePhase('critical');

      // ===== ACCOUNT WINDOW MANAGER INITIALIZATION =====
      // Initialize account window manager and create account-0 window
      const accountWindowManager = getAccountWindowManager();
      perfMonitor.mark('account-manager-init', 'Account window manager initialized');

      // Create account-0 window (primary window)
      createAccountWindow(environment.appUrl, 0);
      accountWindowManager.markAsBootstrap(0);
      perfMonitor.mark('window-created', 'Main window created');

      // Get the created window and use it as mainWindow for features
      // This preserves single-window behavior for account-0 while preparing for multi-account
      mainWindow = getWindowForAccount(0);

      // Update feature context with mainWindow and account manager
      // Convert null to undefined to match FeatureContext type signature
      featureManager.updateContext({ mainWindow: mainWindow ?? undefined, accountWindowManager });
      perfMonitor.mark('account-0-ready', 'Account-0 window ready');

      // ===== POST-WINDOW ICON WARMUP =====
      // Warm icon cache after window creation (256.png already loaded on-demand by windowWrapper)
      getIconCache().warmCache();
      perfMonitor.mark('icons-cached', 'Icons pre-loaded');

      // ===== UI PHASE =====
      // Initialize UI features (parallel for performance)
      await featureManager.initializePhase('ui');

      perfMonitor.mark('features-loaded', 'Critical features initialized');
      log.info('[Main] Critical features initialized');

      // ===== DEFERRED PHASE =====
      // Defer non-critical features using setImmediate
      // These run after the main event loop tick, improving startup time
      setImmediate(() => {
        void (async () => {
          if (!mainWindow) {
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
          // This runs after a short delay to not interfere with user interaction
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

// Log cache statistics and cleanup before app quits
app.on('before-quit', () => {
  try {
    log.info('[Main] ========== Application Shutdown ==========');

    // ===== Use FeatureManager for coordinated cleanup =====
    log.info('[Main] Cleaning up feature resources...');

    // FeatureManager handles cleanup in reverse initialization order
    void featureManager.cleanup();

    // Cleanup account window manager
    try {
      destroyAccountWindowManager();
      log.info('[Main] Account window manager cleaned up');
    } catch (error) {
      log.debug('[Main] Account window manager cleanup skipped:', error);
    }

    log.info('[Main] Feature cleanup completed');

    // ⚡ OPTIMIZATION: Comprehensive cache statistics logging
    logComprehensiveCacheStatistics();

    log.info('[Main] =====================================================');
  } catch (error: unknown) {
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      log.debug('[Main] Rate limiter not available:', error);
    }

    // ===== NEW: Feature Manager Statistics =====
    const summary = featureManager.getSummary();
    log.info('[Main] --- Feature Manager Statistics ---');
    log.info(`[Main]   Total features: ${summary.total}`);
    log.info(`[Main]   Initialized: ${summary.initialized}`);
    log.info(`[Main]   Failed: ${summary.failed}`);
    log.info(`[Main]   Pending: ${summary.pending}`);
    log.info(`[Main]   Total init time: ${summary.totalTime}ms`);
  } catch (error: unknown) {
    log.error('[Main] Failed to log comprehensive cache statistics:', error);
  }
}

app.setAppUserModelId('com.electron.google-chat');

app.on('window-all-closed', () => {
  app.exit();
});

app.on('activate', () => {
  // Always get fresh window reference — mainWindow may be stale after account switches
  const windowToShow = getMostRecentWindow() ?? mainWindow;
  if (windowToShow && !windowToShow.isDestroyed()) {
    windowToShow.show();
  }
});
