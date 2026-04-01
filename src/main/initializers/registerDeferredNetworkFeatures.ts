/**
 * Deferred Network Feature Registration
 *
 * Network-related features: connectivity monitoring, etc.
 */
import { BrowserWindow } from 'electron';
import { createLazyFeature } from '../utils/featureTypes.js';
import type { FeatureManager } from '../utils/featureManager.js';
import { createTrackedTimeout } from '../utils/trackedResources.js';

export function registerDeferredNetworkFeatures(
  featureManager: FeatureManager,
  _callbacks: {
    setTrayIcon: (icon: Electron.Tray | null) => void;
    registerCleanupTask: (name: string, cleanup: () => void | Promise<void>) => void;
  }
): void {
  featureManager.registerAll([
    // Offline/connectivity monitoring
    createLazyFeature(
      'inOnline',
      'deferred',
      async () => {
        const module = await import('../features/inOnline.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
            if (mainWindow) {
              module.default(mainWindow);
              createTrackedTimeout(
                () => { void module.checkForInternet(mainWindow); },
                3000,
                'initial-connectivity-check'
              );
            }
          },
        };
      },
      {
        description: 'Internet connectivity monitoring',
      }
    ),
  ]);
}
