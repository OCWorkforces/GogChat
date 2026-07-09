import path from 'path';
import { app, BrowserWindow, Notification } from 'electron';
import {
  getWindowDefaults,
  attachEventLogging,
  attachHealthMonitoring,
} from './utils/platform/windowUtils.js';
import log from 'electron-log';
import { getIconCache } from './utils/platform/iconCache.js';
import { installPermissionHandlers } from './utils/security/permissionHandler.js';
import { installHeaderFix } from './utils/security/cspHeaderHandler.js';
import { installBenignWarningFilter } from './utils/ipc/benignLogFilter.js';
import { configGet, configSet } from './config.js';
import { platform } from './utils/platform/platformDetection.js';

installBenignWarningFilter();

// Module-level in-memory guard preventing duplicate Notification permission
// scheduling within the same process. The persisted config flag remains the
// cross-process gate; this guard collapses same-tick multi-window bursts so
// only one silent Notification and one configSet are issued.
let notificationPermissionScheduled = false;

/**
 * Parse the account index from a session partition string of the form
 * `persist:account-N`. Returns 0 (default) when the partition is not present
 * or does not match the expected pattern.
 *
 * Used to gate per-window `backgroundThrottling`: account-0 keeps
 * throttling disabled for badge/notification reliability while accounts 1+
 * permit Chromium to throttle background timers.
 */
function parseAccountIndexFromPartition(partition: string): number {
  const match = /^persist:account-(\d+)$/.exec(partition);
  if (match && match[1]) {
    const idx = parseInt(match[1], 10);
    if (!Number.isNaN(idx)) return idx;
  }
  return 0;
}

export default (url: string, partition?: string): BrowserWindow => {
  const webPrefs: Electron.WebPreferences = {
    autoplayPolicy: 'user-gesture-required',
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    disableBlinkFeatures: 'Auxclick',
    // account-0 keeps throttling disabled to preserve badge and
    // notification updates when the window is hidden/blurred. Accounts 1+
    // opt into Chromium background throttling (5–15% renderer CPU savings)
    // and are toggled live via `setBackgroundThrottling` on focus/blur in
    // accountWindowManager.attachActivityListeners.
    backgroundThrottling: partition !== undefined && parseAccountIndexFromPartition(partition) > 0,
    preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
  };
  if (partition !== undefined) {
    webPrefs.partition = partition;
  }
  const window = new BrowserWindow({
    webPreferences: webPrefs,
    icon: getIconCache().getIcon('resources/icons/normal/256.png'),
    show: false,
    paintWhenInitiallyHidden: false, // Defer painting until window.show() to save CPU/GPU
    minHeight: 570,
    minWidth: 480,
    center: true,
    title: 'GogChat',
    backgroundColor: '#E8EAED',
    autoHideMenuBar: getWindowDefaults().hideMenuBar,
  });

  // Chromium-level permission handlers (media TCC + non-media allowlist)
  installPermissionHandlers(window);

  // Proactively trigger macOS notification permission dialog at first launch only.
  // Electron's Notification calls UNUserNotificationCenter.requestAuthorization on
  // first .show(). Gate behind a persisted flag so the TCC prompt and XPC round-trip
  // only happen once — subsequent launches and additional account windows skip entirely.
  // Wrapped in setImmediate so it never blocks loadURL on the critical path.
  if (
    platform.isMac &&
    Notification.isSupported() &&
    !notificationPermissionScheduled &&
    !configGet('app.notificationPermissionRequested')
  ) {
    notificationPermissionScheduled = true;
    try {
      setImmediate(() => {
        try {
          const permNotification = new Notification({
            title: 'GogChat',
            body: 'Notifications enabled',
            silent: true,
          });
          permNotification.on('show', () => {
            permNotification.close();
            configSet('app.notificationPermissionRequested', true);
            notificationPermissionScheduled = false;
            log.info('[Notification] Triggered macOS notification permission request at startup');
          });
          permNotification.on('failed', () => {
            notificationPermissionScheduled = false;
            log.warn('[Notification] macOS notification permission request failed at startup');
          });
          permNotification.show();
        } catch (err) {
          notificationPermissionScheduled = false;
          throw err;
        }
      });
    } catch (err) {
      // Release the guard if scheduling itself fails before configSet runs.
      notificationPermissionScheduled = false;
      throw err;
    }
  }

  window.once('ready-to-show', () => {
    const defaults = getWindowDefaults();
    if (!defaults.startHidden) {
      window.show();
    }
    window.webContents.session.setSpellCheckerEnabled(!defaults.disableSpellChecker);
  });

  attachEventLogging(window);
  attachHealthMonitoring(window);

  installHeaderFix(window);
  void window.loadURL(url);
  return window;
};
