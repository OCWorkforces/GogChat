import path from 'path';
import {app, BrowserWindow, nativeImage, session} from 'electron';
import store from './config';
import log from 'electron-log';

export default (url: string): BrowserWindow => {
  const window = new BrowserWindow({
    webPreferences: {
      autoplayPolicy: 'user-gesture-required',
      contextIsolation: true,  // ✅ SECURITY: Enabled - prevents renderer from accessing Node.js
      nodeIntegration: false,   // ✅ SECURITY: Keep disabled
      sandbox: true,            // ✅ SECURITY: Enabled - OS-level process isolation
      webSecurity: true,        // ✅ SECURITY: Explicit enable
      allowRunningInsecureContent: false, // ✅ SECURITY: Block mixed content
      disableBlinkFeatures: 'Auxclick', // ✅ SECURITY: Prevent Auxclick exploits
      preload: path.join(app.getAppPath(), 'lib/preload/index.js'),
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

  // ✅ SECURITY: Implement Content Security Policy
  const installCSP = () => {
    const ses = window.webContents.session;

    ses.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' https://mail.google.com https://*.google.com https://*.gstatic.com; " +
            "script-src 'self' https://mail.google.com https://*.google.com https://*.gstatic.com 'unsafe-inline' 'unsafe-eval'; " +
            "style-src 'self' https://*.google.com https://*.gstatic.com 'unsafe-inline'; " +
            "img-src 'self' https://*.google.com https://*.gstatic.com https://*.googleusercontent.com data: blob:; " +
            "font-src 'self' https://*.google.com https://*.gstatic.com data:; " +
            "connect-src 'self' https://*.google.com https://*.googleapis.com wss://*.google.com; " +
            "frame-src 'self' https://*.google.com; " +
            "media-src 'self' https://*.google.com https://*.googleusercontent.com blob:; " +
            "object-src 'none'; " +
            "base-uri 'self';"
          ]
        }
      });
    });

    log.debug('[Security] Content Security Policy installed');
  };

  // ✅ SECURITY: Set permission request handler
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
