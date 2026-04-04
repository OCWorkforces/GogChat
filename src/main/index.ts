import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { perfMonitor } from './utils/performanceMonitor.js';
import { compareStorePerformance } from './utils/configProfiler.js';

import path from 'path';
import { enforceSingleInstance } from './features/singleInstance.js';
import { setupDeepLinkListener } from './features/deepLinkHandler.js';
import environment from '../environment.js';
import { getIconCache } from './utils/iconCache.js';
import { initializeStore } from './config.js';
import { registerBuiltInGlobalCleanups } from './utils/resourceCleanup.js';
import { createTrackedTimeout, registerCleanupTask } from './utils/trackedResources.js';

import { getFeatureManager } from './utils/featureManager.js';
import { initializeErrorHandler } from './utils/errorHandler.js';
import {
  getAccountWindowManager,
  createAccountWindow,
  getWindowForAccount,
  getMostRecentWindow,
} from './utils/accountWindowManager.js';

import { registerAllFeatures } from './initializers/registerFeatures.js';
import { registerShutdownHandler } from './initializers/registerShutdown.js';
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null = null;

// Initialize performance monitoring
perfMonitor.mark('app-start', 'App initialization started');

// ===== Initialize Error Handler and Store =====
// Synchronous initialization at module level
// Store initialization deferred to app.whenReady() (requires SafeStorage)
// Previously initialized at module level, but SafeStorage requires app.ready on macOS

// Error handler will be initialized asynchronously in app.whenReady

// ===== Feature Registration =====
const featureManager = getFeatureManager();

// Delegate feature registration to initializer module
registerAllFeatures(featureManager, {
  setTrayIcon: () => {},
  registerCleanupTask,
});

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

      // Register built-in global cleanup callbacks (lazy imports to avoid coupling)
      registerBuiltInGlobalCleanups();

      // ===== SECURITY PHASE =====
      // Initialize security features first (sequential)
      await featureManager.initializePhase('security');

      // ===== CRITICAL PHASE =====
      // Initialize critical features (sequential)
      await featureManager.initializePhase('critical');

      // ===== ACCOUNT WINDOW MANAGER INITIALIZATION =====
      // Ensure store is initialized after app.ready (safeStorage requires it on macOS)
      // Safe to call again — no-op if already initialized at module level
      try {
        await initializeStore();
        log.info('[Main] Config store initialized');
      } catch (error: unknown) {
        log.error('[Main] Failed to initialize store after app.ready:', error);
        throw error;
      }

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
      // Update feature context with mainWindow and account manager
      featureManager.updateContext({ mainWindow, accountWindowManager });
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
// ===== Shutdown Handler =====
// Delegate shutdown handling to initializer module
registerShutdownHandler({ featureManager });

app.setAppUserModelId('com.electron.google-chat');

app.on('window-all-closed', () => {
  app.exit();
});

app.on('activate', () => {
  // Always get fresh window reference — mainWindow may be stale after account switches
  const windowToShow = getMostRecentWindow() ?? mainWindow;
  if (windowToShow && !windowToShow.isDestroyed()) {
    if (windowToShow.isMinimized()) {
      windowToShow.restore();
    }
    windowToShow.show();
    windowToShow.focus();
  }
});
