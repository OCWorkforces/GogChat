/**
 * Feature Registration Initializer
 *
 * Extracts the feature registration block from index.ts into a dedicated module.
 * All features are registered here with their phases, dependencies, and init logic.
 *
 * The initialization order is security-critical — see index.ts for phase execution order.
 */

import { BrowserWindow } from 'electron';
import log from 'electron-log';
import { perfMonitor } from '../utils/performanceMonitor.js';
import { createFeature, createLazyFeature } from '../utils/featureManager.js';
import type { FeatureManager } from '../utils/featureManager.js';
import overrideUserAgent from '../features/userAgent.js';
import setupCertificatePinning, {
  cleanupCertificatePinning,
} from '../features/certificatePinning.js';
import { restoreFirstInstance } from '../features/singleInstance.js';

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
      () => import('../features/reportExceptions.js'),
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
        const module = await import('../features/deepLinkHandler.js');
        // Pass account window manager for dynamic window lookup
        module.default({ accountWindowManager });
      },
      {
        cleanup: async () => {
          const module = await import('../features/deepLinkHandler.js');
          module.cleanupDeepLinkHandler();
        },
        description: 'Custom protocol (gogchat://) handler',
      }
    ),

    createFeature(
      'bootstrapPromotion',
      'ui',
      async () => {
        const module = await import('../features/bootstrapPromotion.js');
        module.default();
      },
      {
        cleanup: async () => {
          const module = await import('../features/bootstrapPromotion.js');
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
    createLazyFeature(
      'appMenu',
      'deferred',
      async () => {
        const module = await import('../features/appMenu.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
            if (mainWindow) {
              module.default(mainWindow);
            }
          },
        };
      },
      {
        dependencies: ['openAtLogin', 'externalLinks'],
        description: 'Application menu',
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
    createLazyFeature(
      'passkeySupport',
      'deferred',
      async () => {
        const module = await import('../features/passkeySupport.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
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
        const module = await import('../features/handleNotification.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
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
    createLazyFeature(
      'externalLinks',
      'deferred',
      async () => {
        const module = await import('../features/externalLinks.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
            if (mainWindow) {
              module.default(mainWindow);
            }
          },
        };
      },
      {
        dependencies: ['bootstrapPromotion'],
        description: 'External links handler',
      }
    ),

    // Close to tray behavior
    createLazyFeature(
      'closeToTray',
      'deferred',
      async () => {
        const module = await import('../features/closeToTray.js');
        return {
          default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
            if (mainWindow) {
              module.default(mainWindow);
            }
          },
        };
      },
      {
        dependencies: ['trayIcon'],
        description: 'Close to tray behavior',
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

  log.info('[Features] All features registered');
}
