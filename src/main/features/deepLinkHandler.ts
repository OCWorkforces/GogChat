import { app, BrowserWindow } from 'electron';
import log from 'electron-log';
import { DEEP_LINK } from '../../shared/constants.js';
import { validateDeepLinkURL } from '../../shared/validators.js';

/** Buffered URL received before app was ready or before window existed */
let pendingDeepLinkUrl: string | null = null;

/** Reference to mainWindow for navigation (set during init) */
let windowRef: BrowserWindow | null = null;

/** Track if open-url listener is registered */
let openUrlListenerRegistered = false;

/**
 * Sanitize a URL for safe logging (strip query params that might contain tokens)
 */
function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep path but redact query params
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search ? '?[redacted]' : ''}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * Process a deep link URL: validate, convert, and navigate.
 * If the window is not ready yet, buffers the URL for later processing.
 */
export function processDeepLink(url: string): void {
  try {
    log.info(`[DeepLink] Received deep link: ${sanitizeUrlForLog(url)}`);

    // Validate and convert to HTTPS URL
    const validatedUrl = validateDeepLinkURL(url);

    // If window is not ready, buffer the URL
    if (!windowRef || windowRef.isDestroyed()) {
      log.info('[DeepLink] Window not ready, buffering URL');
      pendingDeepLinkUrl = validatedUrl;
      return;
    }

    // Navigate the window
    navigateToUrl(validatedUrl);
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to process deep link:', error);
  }
}

/**
 * Navigate the main window to the given URL and focus it
 */
function navigateToUrl(url: string): void {
  if (!windowRef || windowRef.isDestroyed()) {
    log.warn('[DeepLink] Cannot navigate — window unavailable');
    return;
  }

  log.info(`[DeepLink] Navigating to: ${sanitizeUrlForLog(url)}`);
  void windowRef.loadURL(url);

  // Bring window to front
  if (windowRef.isMinimized()) {
    windowRef.restore();
  }
  windowRef.show();
  windowRef.focus();
}

/**
 * Process any buffered deep link URL (called after window is ready)
 */
function processPendingDeepLink(): void {
  if (pendingDeepLinkUrl) {
    log.info('[DeepLink] Processing buffered deep link');
    const url = pendingDeepLinkUrl;
    pendingDeepLinkUrl = null;
    navigateToUrl(url);
  }
}

/**
 * EARLY PHASE: Register the macOS open-url listener.
 * MUST be called BEFORE app.whenReady() — macOS fires open-url before ready.
 * This is a static/module-level setup, not a feature init.
 */
export function setupDeepLinkListener(): void {
  if (openUrlListenerRegistered) {
    log.warn('[DeepLink] open-url listener already registered');
    return;
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    log.info(`[DeepLink] open-url event: ${sanitizeUrlForLog(url)}`);

    // Only handle our protocol
    if (url.startsWith(DEEP_LINK.PREFIX) || url.startsWith('https://chat.google.com')) {
      processDeepLink(url);
    } else {
      log.warn(`[DeepLink] Ignoring unrecognized URL scheme: ${sanitizeUrlForLog(url)}`);
    }
  });

  openUrlListenerRegistered = true;
  log.info('[DeepLink] open-url listener registered');
}

/**
 * Register the app as default protocol client for gchat://
 * Must be called AFTER app.ready.
 */
export function registerDeepLinkProtocol(): void {
  try {
    let result: boolean;

    // In development, Electron is not the app itself — pass explicit path
    if (process.defaultApp && process.argv.length >= 2) {
      result = app.setAsDefaultProtocolClient(
        DEEP_LINK.PROTOCOL,
        process.execPath,
        [process.argv[1]!]
      );
    } else {
      result = app.setAsDefaultProtocolClient(DEEP_LINK.PROTOCOL);
    }

    if (result) {
      log.info(`[DeepLink] Registered as default protocol client for ${DEEP_LINK.PREFIX}`);
    } else {
      log.error(`[DeepLink] Failed to register as default protocol client for ${DEEP_LINK.PREFIX}`);
    }
  } catch (error: unknown) {
    log.error('[DeepLink] Error registering protocol client:', error);
  }
}

/**
 * Feature init function — called during ui phase after window creation.
 * Sets the window reference and processes any buffered deep link.
 */
export default function initDeepLinkHandler(window: BrowserWindow): void {
  try {
    windowRef = window;

    // Register protocol client (requires app.ready)
    registerDeepLinkProtocol();

    // Process any URL that arrived before the window was ready
    processPendingDeepLink();

    log.info('[DeepLink] Deep link handler initialized');
  } catch (error: unknown) {
    log.error('[DeepLink] Failed to initialize deep link handler:', error);
  }
}

/**
 * Extract a deep link URL from command-line arguments.
 * Used by second-instance handler on Windows/Linux.
 * On macOS this is handled via open-url instead.
 */
export function extractDeepLinkFromArgv(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(DEEP_LINK.PREFIX)) ?? null;
}

/**
 * Cleanup function for deep link handler
 */
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
