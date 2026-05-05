/**
 * App Ready Initializer
 *
 * Encapsulates the app.whenReady() body that was previously inline in index.ts.
 * Handles error handler init, global cleanup registration, phased feature initialization,
 * store init, account window manager setup, icon cache warming, and deferred feature loading.
 *
 * The initialization order is security-critical — do not reorder phases.
 */

import { app, session, type BrowserWindow } from 'electron';
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
import { asAccountIndex } from '../../shared/types/branded.js';

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

      // Register global cleanups + security phase in parallel:
      // - registerGlobalCleanups: pure registration (no app.on, no network, no SafeStorage)
      // - security phase (cert pinning + permissions): independent of the cleanup registry
      await Promise.all([registerGlobalCleanups(), featureManager.initializePhase('security')]);

      // ===== CRITICAL PHASE + STORE INIT (parallel) =====
      // initializeStore requires app.ready + SafeStorage but NOT cert pinning or userAgent.
      // The critical phase (userAgent override) is sync and independent of store init.
      try {
        await Promise.all([featureManager.initializePhase('critical'), initializeStore()]);
        log.info('[Main] Config store initialized');
      } catch (error: unknown) {
        log.error('[Main] Failed to initialize critical phase or store:', error);
        throw error;
      }

      // ===== ACCOUNT WINDOW MANAGER INITIALIZATION =====
      const accountWindowManager = getAccountWindowManager(windowFactory);
      perfMonitor.mark('account-manager-init', 'Account window manager initialized');

      // Preconnect on the network thread before BrowserWindow construction so
      // DNS + TCP + TLS handshake starts in parallel with renderer startup (~50-200 ms on cold).
      // Expanded set covers: chat app shell (mail.google.com), auth flow (accounts.google.com),
      // and static asset/font CDNs (ssl.gstatic.com for icons/scripts, fonts.gstatic.com for font binaries).
      // All preconnects are session-scoped and must use the same partition as the account-0 window.
      const account0Session = session.fromPartition('persist:account-0');
      account0Session.preconnect({ url: 'https://mail.google.com', numSockets: 2 });
      account0Session.preconnect({ url: 'https://accounts.google.com', numSockets: 2 });
      account0Session.preconnect({ url: 'https://ssl.gstatic.com', numSockets: 1 });
      account0Session.preconnect({ url: 'https://fonts.gstatic.com', numSockets: 1 });

      // Create account-0 window (primary window)
      createAccountWindow(environment.appUrl, asAccountIndex(0));
      accountWindowManager.markAsBootstrap(asAccountIndex(0));
      perfMonitor.mark('window-created', 'Main window created');

      // Get the created window and use it as mainWindow for features
      // This preserves single-window behavior for account-0 while preparing for multi-account
      const mainWindow = getWindowForAccount(asAccountIndex(0));
      setMainWindow(mainWindow);

      // Update feature context with mainWindow and account manager
      featureManager.updateContext({ mainWindow, accountWindowManager });
      perfMonitor.mark('account-0-ready', 'Account-0 window ready');

      // ===== UI PHASE =====
      await featureManager.initializePhase('ui');

      perfMonitor.mark('features-loaded', 'Critical features initialized');
      log.info('[Main] Critical features initialized');

      // ===== DEFERRED PHASE =====
      // Defer non-critical features using setImmediate.
      // warmInitialIcons is moved here (off the critical path) — the window icon (256.png)
      // is already loaded on-demand in windowWrapper via getIconCache().getIcon().
      // All other warmed icons are consumed by deferred-only features (tray, badges, inOnline).
      setImmediate(() => {
        warmInitialIcons();
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
