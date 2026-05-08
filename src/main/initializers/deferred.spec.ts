/**
 * Deferred phase feature specs.
 *
 * Consolidates the previous deferredSystem / deferredWindow / deferredNetwork
 * registration modules into one declarative array. Loaded via setImmediate
 * after the main window is ready. Side effects (setTrayIcon, registerCleanupTask,
 * updateContext) are routed through the `callbacks` slot on FeatureContext.
 */

import type { BrowserWindow, Tray } from 'electron';
import { createTrackedTimeout } from '../utils/resourceCleanup.js';
import type { FeatureSpec } from '../utils/featureConfigTypes.js';

export const DEFERRED_FEATURES = [
  // System: tray icon — load first; other features depend on it
  {
    name: 'trayIcon',
    phase: 'deferred',
    description: 'System tray icon',
    init: async ({ mainWindow, callbacks }) => {
      if (!mainWindow) return;
      const module = await import('../features/trayIcon.js');
      const icon = module.default(mainWindow);
      callbacks?.setTrayIcon(icon);
      callbacks?.updateContext({ trayIcon: icon });
    },
  },
  {
    name: 'badgeIcons',
    phase: 'deferred',
    dependencies: ['trayIcon'],
    description: 'Badge/overlay icon for unread count',
    init: async ({ mainWindow, trayIcon }) => {
      if (!mainWindow || !trayIcon) return;
      const module = await import('../features/badgeIcon.js');
      module.default(mainWindow, trayIcon);
    },
  },
  {
    name: 'bootstrapPromotion',
    phase: 'deferred',
    description: 'Bootstrap window promotion after first login',
    init: async () => {
      const module = await import('../features/bootstrapPromotion.js');
      await module.default();
    },
  },
  {
    name: 'windowState',
    phase: 'deferred',
    dependencies: ['singleInstance', 'deepLinkHandler', 'bootstrapPromotion'],
    description: 'Window state persistence',
    init: async ({ accountWindowManager }) => {
      const module = await import('../features/windowState.js');
      module.default(accountWindowManager ? { accountWindowManager } : {});
    },
  },
  {
    name: 'openAtLogin',
    phase: 'deferred',
    description: 'Auto-launch on system startup',
    init: async (context) => {
      const module = await import('../features/openAtLogin.js');
      await module.default(context);
    },
  },
  {
    name: 'appUpdates',
    phase: 'deferred',
    description: 'Update notification system',
    init: async () => {
      const module = await import('../features/appUpdates.js');
      await module.default();
    },
  },
  {
    name: 'firstLaunch',
    phase: 'deferred',
    description: 'First launch logging',
    init: async () => {
      const module = await import('../features/firstLaunch.js');
      await module.default();
    },
  },
  {
    name: 'enforceMacOSAppLocation',
    phase: 'deferred',
    description: 'macOS app location enforcement',
    init: async () => {
      const module = await import('../utils/platformHelpers.js');
      module.enforceMacOSAppLocation();
    },
  },
  // Window: features that need a main window
  {
    name: 'appMenu',
    phase: 'deferred',
    dependencies: ['openAtLogin', 'externalLinks'],
    description: 'Application menu',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/appMenu.js');
      module.default(mainWindow);
    },
  },
  {
    name: 'passkeySupport',
    phase: 'deferred',
    description: 'Passkey/WebAuthn support',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/passkeySupport.js');
      module.default(mainWindow);
    },
  },
  {
    name: 'handleNotification',
    phase: 'deferred',
    description: 'Native notification handler',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/handleNotification.js');
      module.default(mainWindow);
    },
  },
  {
    name: 'externalLinks',
    phase: 'deferred',
    dependencies: ['bootstrapPromotion'],
    description: 'External links handler',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/externalLinks.js');
      module.default(mainWindow);
    },
  },
  {
    name: 'closeToTray',
    phase: 'deferred',
    dependencies: ['trayIcon'],
    description: 'Close to tray behavior',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/closeToTray.js');
      module.default(mainWindow);
    },
  },
  {
    name: 'contextMenu',
    phase: 'deferred',
    description: 'Right-click context menu',
    init: async ({ callbacks }) => {
      const module = await import('../features/contextMenu.js');
      const cleanup = module.default();
      if (typeof cleanup === 'function') {
        callbacks?.registerCleanupTask('contextMenu', cleanup);
      }
    },
  },
  // Network: connectivity monitoring
  {
    name: 'inOnline',
    phase: 'deferred',
    description: 'Internet connectivity monitoring',
    init: async ({ mainWindow }) => {
      if (!mainWindow) return;
      const module = await import('../features/inOnline.js');
      const win: BrowserWindow = mainWindow;
      module.default(win);
      createTrackedTimeout(
        () => {
          void module.checkForInternet(win);
        },
        3000,
        'initial-connectivity-check'
      );
    },
  },
  // Telemetry: local-only CDP RUM — zero network, killable via secure flag
  {
    name: 'cdpTelemetry',
    phase: 'deferred',
    required: false,
    description: 'Local-only Chrome DevTools Protocol RUM telemetry',
    init: async ({ accountWindowManager, callbacks }) => {
      const module = await import('../features/cdpTelemetry.js');
      const cleanup = await module.default(accountWindowManager);
      if (typeof cleanup === 'function') {
        callbacks?.registerCleanupTask('cdpTelemetry', cleanup);
      }
    },
  },
] as const satisfies readonly FeatureSpec[];

// Re-export for type inference completeness in callsites that import callbacks
export type { Tray };
