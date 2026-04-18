import path from 'path';
import { app, BrowserWindow, Notification } from 'electron';
import { getWindowDefaults, attachEventLogging, attachHealthMonitoring } from './utils/windowUtils.js';
import log from 'electron-log';
import { getIconCache } from './utils/iconCache.js';
import { installPermissionHandlers } from './utils/permissionHandler.js';
import { installHeaderFix } from './utils/cspHeaderHandler.js';
import { installBenignWarningFilter } from './utils/benignLogFilter.js';

installBenignWarningFilter();

export default (url: string, partition?: string): BrowserWindow => {
  const window = new BrowserWindow({
    webPreferences: {
      autoplayPolicy: 'user-gesture-required',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      disableBlinkFeatures: 'Auxclick',
      backgroundThrottling: false, // Keep badge/notification updates alive when hidden
      preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
      partition: partition ?? undefined,
    },
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

  // Proactively trigger macOS notification permission dialog at startup.
  // Electron's Notification internally calls UNUserNotificationCenter.requestAuthorization
  // on first .show(). If permission was already granted/denied, the notification
  // flashes briefly and is closed — minimal disruption.
  if (Notification.isSupported()) {
    const permNotification = new Notification({
      title: 'GogChat',
      body: 'Notifications enabled',
      silent: true,
    });
    permNotification.on('show', () => {
      permNotification.close();
    });
    permNotification.show();
    log.info('[Notification] Triggered macOS notification permission request at startup');
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
