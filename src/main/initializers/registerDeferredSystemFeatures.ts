/**
 * Deferred System Feature Registration
 *
 * System-level features: tray, badges, window state, auto-launch, updates, etc.
 */
import type { BrowserWindow } from 'electron';
import { createLazyFeature } from '../utils/featureManager.js';
import type { FeatureManager } from '../utils/featureManager.js';
import type { IAccountWindowManager } from '../../shared/types/window.js';

export function registerDeferredSystemFeatures(
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

    // Bootstrap window promotion - moved from UI phase (safe to defer: only attaches
    // did-navigate watchers; auth events won't fire for 100s of ms after window creation)
    createLazyFeature(
      'bootstrapPromotion',
      'deferred',
      () => import('../features/bootstrapPromotion.js'),
      {
        description: 'Bootstrap window promotion after first login',
      }
    ),

    // Window state persistence
    createLazyFeature(
      'windowState',
      'deferred',
      async () => {
        const module = await import('../features/windowState.js');
        return {
          default: ({ accountWindowManager }: { accountWindowManager?: IAccountWindowManager }) => {
            module.default(accountWindowManager ? { accountWindowManager } : {});
          },
        };
      },
      {
        dependencies: ['singleInstance', 'deepLinkHandler', 'bootstrapPromotion'],
        description: 'Window state persistence',
      }
    ),

    // Auto-launch
    createLazyFeature('openAtLogin', 'deferred', () => import('../features/openAtLogin.js'), {
      description: 'Auto-launch on system startup',
    }),

    // Update checker
    createLazyFeature('appUpdates', 'deferred', () => import('../features/appUpdates.js'), {
      description: 'Update notification system',
    }),

    // First launch logging
    createLazyFeature('firstLaunch', 'deferred', () => import('../features/firstLaunch.js'), {
      description: 'First launch logging',
    }),

    // macOS app location enforcement
    createLazyFeature(
      'enforceMacOSAppLocation',
      'deferred',
      async () => {
        const module = await import('../utils/platformHelpers.js');
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
