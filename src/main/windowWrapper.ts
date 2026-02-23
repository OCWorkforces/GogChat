import path from 'path';
import { app, BrowserWindow } from 'electron';
import store from './config.js';
import log from 'electron-log';
import { getIconCache } from './utils/iconCache.js';

export default (url: string): BrowserWindow => {
  const window = new BrowserWindow({
    webPreferences: {
      autoplayPolicy: 'user-gesture-required',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: false, // DISABLED for Google Chat compatibility
      allowRunningInsecureContent: false,
      disableBlinkFeatures: 'Auxclick',
      preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
    },
    icon: getIconCache().getIcon('resources/icons/normal/256.png'),
    show: false,
    minHeight: 570,
    minWidth: 480,
    center: true,
    title: 'Google Chat',
    backgroundColor: '#E8EAED',
    autoHideMenuBar: store.get('app.hideMenuBar') as boolean,
  });

  // Strip COEP/COOP headers that block cross-origin embedding in Google Chat.
  // We intentionally do NOT replace Google's own CSP — doing so (especially with
  // a nonce) causes 'unsafe-inline' to be silently ignored per the CSP3 spec,
  // which blocks all of Google Chat's inline scripts and freezes the loading screen.
  const installHeaderFix = () => {
    const ses = window.webContents.session;
    ses.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      const url = details.url.toLowerCase();
      const isGoogleDomain =
        url.includes('google.com') ||
        url.includes('gstatic.com') ||
        url.includes('googleapis.com') ||
        url.includes('googleusercontent.com');
      if (isGoogleDomain) {
        delete responseHeaders['cross-origin-embedder-policy'];
        delete responseHeaders['cross-origin-opener-policy'];
        delete responseHeaders['Cross-Origin-Embedder-Policy'];
        delete responseHeaders['Cross-Origin-Opener-Policy'];
      }
      callback({ responseHeaders });
    });
    log.debug('[Security] COEP/COOP header stripping installed');
  };

  window.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowedPermissions = ['notifications', 'media', 'mediaKeySystem', 'geolocation'];
    if (allowedPermissions.includes(permission)) {
      log.debug(`[Security] Permission granted: ${permission}`);
      callback(true);
    } else {
      log.warn(`[Security] Permission denied: ${permission}`);
      callback(false);
    }
  });

  window.once('ready-to-show', () => {
    if (!store.get('app.startHidden')) {
      window.show();
    }
    window.webContents.session.setSpellCheckerEnabled(!store.get('app.disableSpellChecker'));
  });

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    const levelName = ['verbose', 'info', 'warning', 'error'][level] ?? 'unknown';
    log.info(`[Renderer:${levelName}] ${message} (${sourceId}:${line})`);
  });
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
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

  installHeaderFix();
  void window.loadURL(url);
  return window;
};
