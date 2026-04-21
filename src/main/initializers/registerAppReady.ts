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
import { perfMonitor } from '../utils/performanceMonitor.js';
import { initializeErrorHandler } from '../utils/errorHandler.js';

import {
  getAccountWindowManager,
  createAccountWindow,
  getWindowForAccount,
  getMostRecentWindow,
} from '../utils/accountWindowManager.js';
// Re-exported so the thin index.ts orchestrator pulls window lookup from the
// same initializer module surface used for app-ready wiring.
export { getMostRecentWindow };
import { registerGlobalCleanups } from './registerGlobalCleanups.js';
import { initializeStore } from '../config.js';
  import { warmInitialIcons, runDeferredPhase } from '../utils/cacheWarmer.js';
import environment from '../../environment.js';
import type { FeatureManager } from '../utils/featureManager.js';
import type { WindowFactory } from '../../shared/types/window.js';

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
      await registerGlobalCleanups();

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
      warmInitialIcons();

      // ===== UI PHASE =====
      await featureManager.initializePhase('ui');

      perfMonitor.mark('features-loaded', 'Critical features initialized');
      log.info('[Main] Critical features initialized');

      // ===== DEFERRED PHASE =====
      // Defer non-critical features using setImmediate
      // These run after the main event loop tick, improving startup time
      setImmediate(() => {
        void runDeferredPhase({
          featureManager,
          getMainWindow,
          isDev: environment.isDev,
        });
      });
    })
    .catch((error: unknown) => {
      log.error('[Main] Failed to initialize application:', error);
      app.quit();
    });
}
