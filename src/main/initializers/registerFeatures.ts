/**
 * Feature Registration Orchestrator
 *
 * Thin orchestrator that delegates to phase-specific registration modules.
 * All features are registered here with their phases, dependencies, and init logic.
 *
 * The initialization order is security-critical — see index.ts for phase execution order.
 */

import log from 'electron-log';
import type { FeatureManager } from '../utils/featureManager.js';
import { registerSecurityFeatures } from './registerSecurityFeatures.js';
import { registerUIFeatures } from './registerUIFeatures.js';
import { registerDeferredSystemFeatures } from './registerDeferredSystemFeatures.js';
import { registerDeferredWindowFeatures } from './registerDeferredWindowFeatures.js';
import { registerDeferredNetworkFeatures } from './registerDeferredNetworkFeatures.js';

/**
 * Register all application features with the feature manager.
 *
 * @param featureManager - The global feature manager instance
 * @param callbacks - Callbacks for side effects that require access to index.ts module state
 */
export function registerAllFeatures(
  featureManager: FeatureManager,
  callbacks: {
    /** Called when trayIcon feature sets the tray icon */
    setTrayIcon: (icon: Electron.Tray | null) => void;
    /** Called to register a cleanup task (delegates to resourceCleanup) */
    registerCleanupTask: (name: string, cleanup: () => void | Promise<void>) => void;
  }
): void {
  registerSecurityFeatures(featureManager);
  registerUIFeatures(featureManager);
  registerDeferredSystemFeatures(featureManager, callbacks);
  registerDeferredWindowFeatures(featureManager, callbacks);
  registerDeferredNetworkFeatures(featureManager, callbacks);

  log.info('[Features] All features registered');
}
