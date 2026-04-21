/**
 * Deferred Window Feature Registration
 *
 * Window-bound features: menus, notifications, links, tray behavior, etc.
 */
import { createLazyFeature } from '../utils/featureManager.js';
import type { FeatureManager } from '../utils/featureManager.js';
import { createMainWindowFeature } from './featureHelpers.js';

export function registerDeferredWindowFeatures(
  featureManager: FeatureManager,
  callbacks: {
    setTrayIcon: (icon: Electron.Tray | null) => void;
    registerCleanupTask: (name: string, cleanup: () => void | Promise<void>) => void;
  }
): void {
  featureManager.registerAll([
    // App menu
    createMainWindowFeature('appMenu', () => import('../features/appMenu.js'), {
      dependencies: ['openAtLogin', 'externalLinks'],
      description: 'Application menu',
    }),

    // Passkey support
    createMainWindowFeature('passkeySupport', () => import('../features/passkeySupport.js'), {
      description: 'Passkey/WebAuthn support',
    }),

    // Notification handler
    createMainWindowFeature(
      'handleNotification',
      () => import('../features/handleNotification.js'),
      {
        description: 'Native notification handler',
      }
    ),

    // External links handler
    createMainWindowFeature('externalLinks', () => import('../features/externalLinks.js'), {
      dependencies: ['bootstrapPromotion'],
      description: 'External links handler',
    }),

    // Close to tray behavior
    createMainWindowFeature('closeToTray', () => import('../features/closeToTray.js'), {
      dependencies: ['trayIcon'],
      description: 'Close to tray behavior',
    }),

    // Context menu
    createLazyFeature(
      'contextMenu',
      'deferred',
      async () => {
        const module = await import('../features/contextMenu.js');
        return {
          default: () => {
            const cleanup = module.default();
            if (typeof cleanup === 'function') {
              callbacks.registerCleanupTask('contextMenu', cleanup);
            }
          },
        };
      },
      {
        description: 'Right-click context menu',
      }
    ),
  ]);
}
