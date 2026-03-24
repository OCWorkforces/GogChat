import path from 'path';
import { app, BrowserWindow, Notification } from 'electron';
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

  // When we strip frame-ancestors from CSP, Chromium falls back to X-Frame-Options
  // and warns about the deprecated ALLOW-FROM directive. The header is ignored
  // (frame loads fine), so this is purely cosmetic noise.
  if (
    message.includes("Invalid 'X-Frame-Options' header encountered when loading") &&
    message.includes('is not a recognized directive')
  ) {
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
    /^Framing '([^']+)' violates the following (?:report-only )?Content Security Policy directive:/
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

/**
 * Check if a Node.js process warning is a benign Electron URL load failure.
 * Electron emits these via process.emitWarning() when subframes fail to load,
 * which bypasses our did-fail-load handler and goes directly to stderr.
 */
function isBenignElectronUrlWarning(message: string): boolean {
  const match = message.match(/Failed to load URL: (.+) with error: ERR_BLOCKED_BY_RESPONSE/);
  if (!match) return false;

  const hostname = getHostname(match[1]!);
  return hostname !== null && BENIGN_CSP_BLOCKED_HOSTS.has(hostname);
}

/**
 * Suppress Electron's internal Node.js process warnings for benign subframe
 * load failures. Adding a 'warning' listener disables Node.js default stderr
 * output for ALL warnings, so non-benign warnings are re-printed manually.
 */
process.on('warning', (warning: Error) => {
  if (isBenignElectronUrlWarning(warning.message)) {
    log.debug(`[Load] Suppressed Electron process warning: ${warning.message.split('\n')[0]}`);
    return;
  }
  // Non-benign warnings: re-print to stderr since adding a 'warning'
  // listener disables Node.js default stderr output for warnings
  process.stderr.write(`${warning.name}: ${warning.message}\n`);
});

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
    minHeight: 570,
    minWidth: 480,
    center: true,
    title: 'GogChat',
    backgroundColor: '#E8EAED',
    autoHideMenuBar: store.get('app.hideMenuBar') as boolean,
  });

  // Strip COEP/COOP headers that block cross-origin embedding in GogChat.
  // We intentionally do NOT wholesale replace Google's own CSP — doing so
  // (especially with a nonce) causes 'unsafe-inline' to be silently ignored
  // per the CSP3 spec, which blocks all of GogChat's inline scripts.
  // However, we surgically remove frame-ancestors from CSP on responses from
  // BENIGN_CSP_BLOCKED_HOSTS. These hosts set frame-ancestors to
  // studio.workspace.google.com, which causes ERR_BLOCKED_BY_RESPONSE when
  // embedded inside chat.google.com. Removing the directive allows the
  // subframes to load without affecting any other CSP protections.
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

        // Strip frame-ancestors from CSP for benign hosts to prevent
        // subframe load failures (ERR_BLOCKED_BY_RESPONSE)
        const requestHostname = getHostname(details.url);
        if (requestHostname !== null && BENIGN_CSP_BLOCKED_HOSTS.has(requestHostname)) {
          for (const key of ['content-security-policy', 'Content-Security-Policy']) {
            const csp = responseHeaders[key];
            if (Array.isArray(csp)) {
              responseHeaders[key] = csp
                .map((policy) => policy.replace(/frame-ancestors\s+[^;]*;?/g, '').trim())
                .filter(Boolean);
              if (responseHeaders[key].length === 0) {
                delete responseHeaders[key];
              }
            }
          }

          // Also strip X-Frame-Options for these hosts. Since we removed
          // frame-ancestors from CSP, the ALLOW-FROM directive is the only
          // remaining framing restriction — and it's deprecated/ignored by
          // Chromium, causing noisy console warnings with no security benefit.
          delete responseHeaders['x-frame-options'];
          delete responseHeaders['X-Frame-Options'];
        }

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
    if (!store.get('app.startHidden')) {
      window.show();
    }
    window.webContents.session.setSpellCheckerEnabled(!store.get('app.disableSpellChecker'));
  });

  window.on('show', () => {
    log.info(`[Window] show visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('hide', () => {
    log.info(`[Window] hide visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('focus', () => {
    log.info(`[Window] focus visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('blur', () => {
    log.info(`[Window] blur visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('minimize', () => {
    log.info(`[Window] minimize visible=${window.isVisible()} focused=${window.isFocused()}`);
  });
  window.on('restore', () => {
    log.info(`[Window] restore visible=${window.isVisible()} focused=${window.isFocused()}`);
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

  installHeaderFix();
  void window.loadURL(url);
  return window;
};
