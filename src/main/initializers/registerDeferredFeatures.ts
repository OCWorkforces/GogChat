/**
 * Deferred Phase Feature Registration
 *
 * Non-critical features loaded asynchronously with dynamic imports.
 * Initialized via setImmediate() after the main window is ready.
 */

import { BrowserWindow } from 'electron';
import { createLazyFeature } from '../utils/featureTypes.js';
import type { FeatureManager } from '../utils/featureManager.js';
import { createMainWindowFeature } from './featureHelpers.js';

export function registerDeferredFeatures(
  featureManager: FeatureManager,
  callbacks: {
    setTrayIcon: (icon: Electron.Tray | null) => void;
    registerCleanupTask: (name: string, cleanup: () => void | Promise<void>) => void;
  }
): void {
  featureManager.registerAll([
    // Tray icon - load first as other features depend on it
    createLazyFeature(
      'trayIcon',
      'deferred',
      async () => {
        const module = await import('../features/trayIcon.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
            if (mainWindow) {
              const icon = module.default(mainWindow);
              callbacks.setTrayIcon(icon);
              featureManager.updateContext({ trayIcon: icon });
            }
          },
        };
      },
      {
        description: 'System tray icon',
      }
    ),

    // App menu
    createMainWindowFeature('appMenu', () => import('../features/appMenu.js'), {
      dependencies: ['openAtLogin', 'externalLinks'],
      description: 'Application menu',
    }),

    // Badge icons - depends on trayIcon
    createLazyFeature(
      'badgeIcons',
      'deferred',
      async () => {
        const module = await import('../features/badgeIcon.js');
        return {
          default: ({
            mainWindow,
            trayIcon,
          }: {
            mainWindow?: BrowserWindow | null;
            trayIcon?: Electron.Tray | null;
          }) => {
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
        const module = await import('../features/windowState.js');
        return {
          default: ({ accountWindowManager }: { accountWindowManager?: unknown }) => {
            // Pass account window manager for dynamic window resolution
            module.default({ accountWindowManager });
          },
        };
      },
      {
        dependencies: ['singleInstance', 'deepLinkHandler', 'bootstrapPromotion'],
        description: 'Window state persistence',
      }
    ),

    // Passkey support
    createMainWindowFeature('passkeySupport', () => import('../features/passkeySupport.js'), {
      description: 'Passkey/WebAuthn support',
    }),

    // Notification handler
    createMainWindowFeature('handleNotification', () => import('../features/handleNotification.js'), {
      description: 'Native notification handler',
    }),

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
    createMainWindowFeature('externalLinks', () => import('../features/externalLinks.js'), {
      dependencies: ['bootstrapPromotion'],
      description: 'External links handler',
    }),

    // Close to tray behavior
    createMainWindowFeature('closeToTray', () => import('../features/closeToTray.js'), {
      dependencies: ['trayIcon'],
      description: 'Close to tray behavior',
    }),

    // Auto-launch
    createLazyFeature('openAtLogin', 'deferred', () => import('../features/openAtLogin.js'), {
      description: 'Auto-launch on system startup',
    }),

    // Update checker
    createLazyFeature('appUpdates', 'deferred', () => import('../features/appUpdates.js'), {
      description: 'Update notification system',
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

    // First launch logging
    createLazyFeature('firstLaunch', 'deferred', () => import('../features/firstLaunch.js'), {
      description: 'First launch logging',
    }),

    // macOS app location enforcement
    createLazyFeature(
      'enforceMacOSAppLocation',
      'deferred',
      async () => {
        const module = await import('../utils/platform.js');
        return {
          default: () => module.enforceMacOSAppLocation(),
        };
      },
      {
        description: 'macOS app location enforcement',
      }
    ),
  ]);
}
