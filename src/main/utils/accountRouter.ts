/**
 * Account Router - Window creation and routing logic
 *
 * Decides whether to create a new window, reuse an existing one,
 * or skip navigation for a bootstrap window mid-auth-flow.
 *
 * @module accountRouter
 */

import type { BrowserWindow } from 'electron';
import { isGoogleAuthUrl } from '../../shared/validators.js';
import log from 'electron-log';
import { isBootstrap as _isBootstrap } from './bootstrapTracker.js';
import type { AccountWindowRegistry } from './accountWindowRegistry.js';
import type { WindowFactory } from '../../shared/types.js';

/**
 * Route a createAccountWindow request: reuse existing, skip if mid-auth, or create new.
 *
 * @param registry - The window registry to query/update
 * @param windowFactory - Optional factory for creating new BrowserWindows
 * @param url - The URL to load
 * @param accountIndex - The account index for this window
 * @returns The created or existing BrowserWindow
 */
export function routeAccountWindow(
  registry: AccountWindowRegistry,
  windowFactory: WindowFactory | undefined,
  url: string,
  accountIndex: number
): BrowserWindow {
  const existingWindow = registry.getAccountWindow(accountIndex);
  if (existingWindow && !existingWindow.isDestroyed()) {
    if (existingWindow.isMinimized()) {
      existingWindow.restore();
    }
    existingWindow.show();
    existingWindow.focus();
    registry.setMostRecentAccountIndex(accountIndex);
    // If this is a bootstrap window already mid-auth-flow, do not interrupt
    // sign-in by calling loadURL again.
    const isBootstrapWindow = _isBootstrap(accountIndex);
    const currentUrl = existingWindow.webContents.getURL();
    if (isBootstrapWindow && isGoogleAuthUrl(currentUrl)) {
      log.info(
        `[AccountRouter] Skipping loadURL for account ${accountIndex} — bootstrap window is mid-auth (${currentUrl})`
      );
      return existingWindow;
    }
    void existingWindow.loadURL(url);
    return existingWindow;
  }

  if (!windowFactory) {
    throw new Error('[AccountRouter] No WindowFactory injected — cannot create window');
  }
  const partition = `persist:account-${accountIndex}`;
  const window = windowFactory.createWindow(url, partition);

  registry.registerWindow(window, accountIndex);

  log.info(`[AccountRouter] Created account window ${accountIndex} with partition: ${partition}`);

  return window;
}
