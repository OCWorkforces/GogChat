/**
 * Deferred Phase Feature Registration
 *
 * Non-critical features loaded asynchronously with dynamic imports.
 * Initialized via setImmediate() after the main window is ready.
 *
 * Features are grouped by domain into sub-registrars:
 * - System: tray, badges, window state, auto-launch, updates
 * - Window: menus, notifications, links, context menu
 * - Network: connectivity monitoring
 */

import type { FeatureManager } from '../utils/featureManager.js';
import { registerDeferredSystemFeatures } from './registerDeferredSystemFeatures.js';
import { registerDeferredWindowFeatures } from './registerDeferredWindowFeatures.js';
import { registerDeferredNetworkFeatures } from './registerDeferredNetworkFeatures.js';

export function registerDeferredFeatures(
  featureManager: FeatureManager,
  callbacks: {
    setTrayIcon: (icon: Electron.Tray | null) => void;
    registerCleanupTask: (name: string, cleanup: () => void | Promise<void>) => void;
  }
): void {
  registerDeferredSystemFeatures(featureManager, callbacks);
  registerDeferredWindowFeatures(featureManager, callbacks);
  registerDeferredNetworkFeatures(featureManager, callbacks);
}
