import path from 'path';
import crypto from 'crypto';
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

  /**
   * Generate cryptographically secure nonce for CSP
   * Uses 128-bit random value (16 bytes) encoded in base64
   * @returns Base64-encoded nonce string
   */
  const generateCSPNonce = (): string => {
    return crypto.randomBytes(16).toString('base64');
  };

  // Implement Content Security Policy and fix Google authentication blocking
  // Note: CSP balances security with Google Chat compatibility requirements
  // Trade-offs:
  // - 'unsafe-inline' and 'unsafe-eval' required for Google Chat's dynamic content loading
  // - Nonce provides defense-in-depth for future script injection protection
  // - Explicit directives provide granular control over resource loading
  // - frame-ancestors prevents clickjacking attacks
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

      // Apply enhanced CSP to main frame only
      if (details.resourceType === 'mainFrame') {
        // Skip CSP modification for authentication pages
        // Google Sign-In has its own CSP requirements that we shouldn't override
        const isAuthPage =
          url.includes('accounts.google.com') || url.includes('accounts.youtube.com');

        if (isAuthPage) {
          log.debug(
            `[Security] Skipping custom CSP for authentication page: ${details.url.substring(0, 80)}`
          );
          callback({ responseHeaders });
          return;
        }

        // Generate fresh nonce for this page load
        const nonce = generateCSPNonce();
        log.debug(`[Security] Generated CSP nonce: ${nonce.substring(0, 12)}...`);

        // Enhanced Content Security Policy with explicit directives
        // Note: 'unsafe-inline' and 'unsafe-eval' are necessary for Google Chat functionality
        // The nonce provides additional protection if we inject scripts in the future
        const cspDirectives = [
          // Script sources: nonce-based (for future use) + Google domains + unsafe fallbacks (required)
          `script-src 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.gstatic.com https://*.googleapis.com https://*.googleusercontent.com`,
          // Style sources: Google domains + inline styles (required by Google Chat)
          `style-src 'unsafe-inline' https://*.google.com https://*.gstatic.com https://*.googleapis.com`,
          // Image sources: Google domains + data URIs + blob URIs
          `img-src 'self' https://*.google.com https://*.gstatic.com https://*.googleapis.com https://*.googleusercontent.com data: blob:`,
          // Connection sources: Google domains for XHR/WebSocket/EventSource
          `connect-src 'self' https://*.google.com https://*.gstatic.com https://*.googleapis.com wss://*.google.com`,
          // Font sources: Google domains + data URIs
          `font-src 'self' https://*.google.com https://*.gstatic.com https://fonts.gstatic.com data:`,
          // Media sources: Google domains + blob URIs
          `media-src 'self' https://*.google.com https://*.googleusercontent.com blob:`,
          // Frame sources: Google domains only
          `frame-src https://*.google.com`,
          // Block object/embed (Flash, Java applets, etc.)
          `object-src 'none'`,
          // Prevent clickjacking by restricting frame ancestors to same origin
          `frame-ancestors 'self'`,
          // Restrict base URI to prevent base tag injection
          `base-uri 'self'`,
          // Form submission targets
          `form-action 'self' https://*.google.com`,
        ].join('; ');

        responseHeaders['Content-Security-Policy'] = [cspDirectives];

        log.debug(
          '[Security] Enhanced CSP applied with nonce, frame-ancestors, and explicit directives'
        );
      }

      callback({ responseHeaders });
    });

    log.debug('[Security] Content Security Policy handler installed with COEP/COOP fix');
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
