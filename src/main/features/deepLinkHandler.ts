import { app, BrowserWindow, shell } from 'electron';
import log from 'electron-log';
import { DEEP_LINK } from '../../shared/constants.js';
import { validateDeepLinkURL, validateExternalURL } from '../../shared/validators.js';

let pendingDeepLinkUrl: string | null = null;
let windowRef: BrowserWindow | null = null;
let openUrlListenerRegistered = false;

function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search ? '?[redacted]' : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

export function processDeepLink(url: string): void {
  try {
    log.info(`[DeepLink] Received deep link: ${sanitizeUrlForLog(url)}`);
    const validatedUrl = validateDeepLinkURL(url);

    if (!windowRef || windowRef.isDestroyed()) {
      log.info('[DeepLink] Window not ready, buffering URL');
      pendingDeepLinkUrl = validatedUrl;
      return;
    }

    navigateToUrl(validatedUrl);
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to process deep link:', error);
  }
}

function navigateToUrl(url: string): void {
  if (!windowRef || windowRef.isDestroyed()) {
    log.warn('[DeepLink] Cannot navigate — window unavailable');
    return;
  }

  log.info(`[DeepLink] Navigating to: ${sanitizeUrlForLog(url)}`);
  void windowRef.loadURL(url);

  if (windowRef.isMinimized()) {
    windowRef.restore();
  }
  windowRef.show();
  windowRef.focus();
}

function processPendingDeepLink(): void {
  if (pendingDeepLinkUrl) {
    log.info('[DeepLink] Processing buffered deep link');
    const url = pendingDeepLinkUrl;
    pendingDeepLinkUrl = null;
    navigateToUrl(url);
  }
}

function openInDefaultBrowser(url: string): void {
  try {
    const sanitizedUrl = validateExternalURL(url);
    log.info(`[DeepLink] Opening external URL in default browser: ${sanitizeUrlForLog(url)}`);
    void shell.openExternal(sanitizedUrl);
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to open external URL:', error);
  }
}

export function setupDeepLinkListener(): void {
  if (openUrlListenerRegistered) {
    log.warn('[DeepLink] open-url listener already registered');
    return;
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    log.info(`[DeepLink] open-url event: ${sanitizeUrlForLog(url)}`);

    if (url.startsWith(DEEP_LINK.PREFIX) || url.startsWith('https://chat.google.com')) {
      processDeepLink(url);
    } else if (url.startsWith('https://')) {
      openInDefaultBrowser(url);
    } else {
      log.warn(`[DeepLink] Ignoring unrecognized URL scheme: ${sanitizeUrlForLog(url)}`);
    }
  });

  openUrlListenerRegistered = true;
  log.info('[DeepLink] open-url listener registered');
}

function registerProtocolClient(protocol: string): void {
  try {
    let result: boolean;

    if (process.defaultApp && process.argv.length >= 2) {
      result = app.setAsDefaultProtocolClient(protocol, process.execPath, [process.argv[1]!]);
    } else {
      result = app.setAsDefaultProtocolClient(protocol);
    }

    if (result) {
      log.info(`[DeepLink] Registered as default protocol client for ${protocol}://`);
    } else {
      log.error(`[DeepLink] Failed to register as default protocol client for ${protocol}://`);
    }
  } catch (error: unknown) {
    log.error('[DeepLink] Error registering protocol client:', error);
  }
}

export function registerDeepLinkProtocol(): void {
  registerProtocolClient(DEEP_LINK.PROTOCOL);
}

export default function initDeepLinkHandler(window: BrowserWindow): void {
  try {
    windowRef = window;
    registerDeepLinkProtocol();
    processPendingDeepLink();
    log.info('[DeepLink] Deep link handler initialized');
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to initialize deep link handler:', error);
  }
}

export function extractDeepLinkFromArgv(argv: string[]): string | null {
  const deepLink = argv.find((arg) => arg.startsWith(DEEP_LINK.PREFIX));
  if (deepLink) return deepLink;

  const httpsChatLink = argv.find(
    (arg) => arg.startsWith('https://') && arg.includes('chat.google.com')
  );
  return httpsChatLink ?? null;
}

export function cleanupDeepLinkHandler(): void {
  try {
    log.debug('[DeepLink] Cleaning up deep link handler');
    pendingDeepLinkUrl = null;
    windowRef = null;
    log.info('[DeepLink] Deep link handler cleaned up');
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to cleanup:', error);
  }
}
