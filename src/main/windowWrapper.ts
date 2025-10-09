import path from 'path';
import { app, BrowserWindow } from 'electron';
import store from './config.js';
import log from 'electron-log';
import { getIconCache } from './utils/iconCache.js';

export default (url: string): BrowserWindow => {
  const window = new BrowserWindow({
    webPreferences: {
      autoplayPolicy: 'user-gesture-required',
      contextIsolation: true, // Enabled - prevents renderer from accessing Node
      nodeIntegration: false, // Keep disabled
      sandbox: true, // Enabled - OS-level process isolation
      webSecurity: true, // Explicit enable
      allowRunningInsecureContent: false, // Block mixed content
      disableBlinkFeatures: 'Auxclick', // Prevent Auxclick exploits
      preload: path.join(app.getAppPath(), 'lib/preload/index'),
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

  // Implement Content Security Policy and fix Google authentication blocking
  // Note: CSP is relaxed to allow Google Chat full functionality while still blocking malicious content
  const installCSP = () => {
    const ses = window.webContents.session;

    ses.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };

      // Strip problematic COEP/COOP headers for Google domains that block embedded content
      // This fixes ERR_BLOCKED_BY_RESPONSE for RotateCookiesPage and widget authentication
      const url = details.url.toLowerCase();
      const isGoogleDomain =
        url.includes('google.com') ||
        url.includes('gstatic.com') ||
        url.includes('googleapis.com') ||
        url.includes('googleusercontent.com');

      if (isGoogleDomain) {
        // Remove headers that block cross-origin embedding
        delete responseHeaders['cross-origin-embedder-policy'];
        delete responseHeaders['cross-origin-opener-policy'];
        delete responseHeaders['Cross-Origin-Embedder-Policy'];
        delete responseHeaders['Cross-Origin-Opener-Policy'];

        log.debug(`[Security] Stripped COEP/COOP headers for: ${details.url.substring(0, 80)}`);
      }

      // Apply CSP to main frame only
      if (details.resourceType === 'mainFrame') {
        responseHeaders['Content-Security-Policy'] = [
          "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
            "object-src 'none'; " +
            "base-uri 'self';",
        ];
      }

      callback({ responseHeaders });
    });

    log.debug('[Security] Content Security Policy installed with COEP/COOP fix');
  };

  // Set permission request handler
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Only allow specific permissions needed for Google Chat
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

  // Install CSP before loading URL
  installCSP();

  void window.loadURL(url);

  return window;
};
