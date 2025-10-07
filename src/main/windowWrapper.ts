import path from 'path';
import {app, BrowserWindow, nativeImage, session} from 'electron';
import store from './config';
import log from 'electron-log';

export default (url: string): BrowserWindow => {
  const window = new BrowserWindow({
    webPreferences: {
      autoplayPolicy: 'user-gesture-required',
      contextIsolation: true,  // Enabled - prevents renderer from accessing Node
      nodeIntegration: false,   // Keep disabled
      sandbox: true,            // Enabled - OS-level process isolation
      webSecurity: true,        // Explicit enable
      allowRunningInsecureContent: false, // Block mixed content
      disableBlinkFeatures: 'Auxclick', // Prevent Auxclick exploits
      preload: path.join(app.getAppPath(), 'lib/preload/index'),
    },
    icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'resources/icons/normal/256.png')),
    show: false,
    minHeight: 570,
    minWidth: 480,
    center: true,
    title: 'Google Chat',
    backgroundColor: '#E8EAED',
    autoHideMenuBar: store.get('app.hideMenuBar'),
  });

  // Implement Content Security Policy
  // Note: CSP is relaxed to allow Google Chat full functionality while still blocking malicious content
  const installCSP = () => {
    const ses = window.webContents.session;

    ses.webRequest.onHeadersReceived((details, callback) => {
      // Only apply CSP to main frame, not to Google's internal resources
      // This prevents blocking Google Chat's settings and other interactive features
      if (details.resourceType === 'mainFrame') {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; " +
              "object-src 'none'; " +
              "base-uri 'self';"
            ]
          }
        });
      } else {
        // Pass through other resources without modification
        callback({
          responseHeaders: details.responseHeaders
        });
      }
    });

    log.debug('[Security] Content Security Policy installed');
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
    window.webContents.session.setSpellCheckerEnabled( !store.get('app.disableSpellChecker') );
  });

  // Install CSP before loading URL
  installCSP();

  window.loadURL(url);

  return window;
};
