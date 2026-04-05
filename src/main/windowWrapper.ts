import path from 'path';
import { app, BrowserWindow, Notification } from 'electron';
import type { Event, WebContentsConsoleMessageEventParams } from 'electron';
import { getWindowDefaults } from './utils/windowDefaults.js';
import log from 'electron-log';
import { getIconCache } from './utils/iconCache.js';
import { installPermissionHandlers } from './utils/permissionHandler.js';
import { installHeaderFix } from './utils/cspHeaderHandler.js';
import {
  isBenignRendererConsoleMessage,
  isBenignSubframeLoadFailure,
  installBenignWarningFilter,
} from './utils/benignLogFilter.js';

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

  window.on('show', () => {
    log.debug(`[Window] show visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('hide', () => {
    log.debug(`[Window] hide visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('focus', () => {
    log.debug(`[Window] focus visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('blur', () => {
    log.debug(`[Window] blur visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('minimize', () => {
    log.debug(`[Window] minimize visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('restore', () => {
    log.debug(`[Window] restore visible=${window.isVisible()} focused=${window.isFocused()}`);
  });

  window.webContents.on('console-message', (event: Event<WebContentsConsoleMessageEventParams>) => {
    if (isBenignRendererConsoleMessage(event.message, event.sourceId)) {
      log.debug(`[Renderer:suppressed] ${event.message} (${event.sourceId}:${event.lineNumber})`);
      return;
    }

    log.info(`[Renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isBenignSubframeLoadFailure(errorCode, validatedURL, isMainFrame)) {
        log.debug(
          `[Load] Suppressed expected subframe failure: ${errorDescription} (${errorCode}) - ${validatedURL}`
        );
        return;
      }

      log.error(
        `[Load] FAILED ${isMainFrame ? '(main frame)' : '(subframe)'}: ${errorDescription} (${errorCode}) — ${validatedURL}`
      );
    }
  );
  window.webContents.on('did-finish-load', () => {
    log.info(`[Load] did-finish-load: ${window.webContents.getURL()}`);
  });
  window.webContents.on('did-navigate', (_event, navUrl, httpResponseCode) => {
    log.info(`[Nav] did-navigate: ${navUrl} (HTTP ${httpResponseCode})`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    log.error(
      `[Renderer] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
  });
  window.webContents.on('unresponsive', () => {
    log.warn('[Renderer] unresponsive');
  });
  window.webContents.on('responsive', () => {
    log.info('[Renderer] responsive');
  });

  installHeaderFix(window);
  void window.loadURL(url);
  return window;
};
