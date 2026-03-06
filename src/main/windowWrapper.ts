import path from 'path';
import { app, BrowserWindow } from 'electron';
import type { Event, WebContentsConsoleMessageEventParams } from 'electron';
import store from './config.js';
import log from 'electron-log';
import { getIconCache } from './utils/iconCache.js';

const BENIGN_CSP_BLOCKED_HOSTS = new Set(['accounts.google.com', 'ogs.google.com']);

function getHostname(value: string): string | null {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function isBenignRendererConsoleMessage(message: string, sourceId: string): boolean {
  if (message.includes('Electron Security Warning (Disabled webSecurity)')) {
    return true;
  }

  if (message.includes('Deprecated API for given entry type.')) {
    return true;
  }

  if (message.includes('WARNING!') || message.includes('Using this console may allow attackers')) {
    return true;
  }

  if (
    message.includes(
      'allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing'
    ) &&
    sourceId.includes('studio.workspace.google.com')
  ) {
    return true;
  }

  const cspFrameAncestorsMatch = message.match(
    /^Framing '([^']+)' violates the following Content Security Policy directive:/
  );
  if (!cspFrameAncestorsMatch) {
    return false;
  }

  const blockedUrl = cspFrameAncestorsMatch[1];
  if (!blockedUrl) {
    return false;
  }

  const blockedHostname = getHostname(blockedUrl);
  return blockedHostname !== null && BENIGN_CSP_BLOCKED_HOSTS.has(blockedHostname);
}

function isBenignSubframeLoadFailure(
  errorCode: number,
  validatedURL: string,
  isMainFrame: boolean
): boolean {
  if (isMainFrame || errorCode !== -27) {
    return false;
  }

  const hostname = getHostname(validatedURL);
  return hostname !== null && BENIGN_CSP_BLOCKED_HOSTS.has(hostname);
}

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
      backgroundThrottling: false, // Keep badge/notification updates alive when hidden
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
    ses.webRequest.onHeadersReceived(
      {
        urls: [
          '*://*.google.com/*',
          '*://*.gstatic.com/*',
          '*://*.googleapis.com/*',
          '*://*.googleusercontent.com/*',
        ],
      },
      (details, callback) => {
        const responseHeaders = { ...details.responseHeaders };
        delete responseHeaders['cross-origin-embedder-policy'];
        delete responseHeaders['cross-origin-opener-policy'];
        delete responseHeaders['Cross-Origin-Embedder-Policy'];
        delete responseHeaders['Cross-Origin-Opener-Policy'];
        callback({ responseHeaders });
      }
    );
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

  installHeaderFix();
  void window.loadURL(url);
  return window;
};
