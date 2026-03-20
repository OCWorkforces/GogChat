/**
 * Bootstrap Promotion Feature
 *
 * Detects when a bootstrap account window completes first-time authentication
 * and promotes it to a real authenticated session.
 *
 * On cold start without a saved session, Google serves the public landing page
 * in the bootstrap window.  After the user logs in, `did-navigate` fires with
 * an authenticated Chat URL.  This feature:
 *
 *  1. Attaches a `did-navigate` listener to the account window's webContents.
 *  2. On each navigation, checks `isAuthenticatedChatUrl()`.
 *  3. If authenticated AND the account is still marked as bootstrap:
 *     - Calls `promoteBootstrap(accountIndex)` to clear the bootstrap flag.
 *     - Removes itself (self-cleaning, no dangling listeners).
 *  4. Handles the child-window (popup) auth path:
 *     - Listens for `did-create-window` on the account window's webContents.
 *     - On the child window's `did-navigate`, checks the same condition.
 *     - On auth completion in the child, promotes the account and closes the
 *       child window if it is still open.  For account-0 it also reloads the
 *       main window to the authenticated Chat URL.
 *
 * `init()` is called once and attaches watchers for every account currently
 * registered as bootstrap (account-0, account-1, …).
 *
 * `watchBootstrapAccount(accountIndex)` is also exported so callers can attach
 * a watcher for a single account at any time — e.g. when a new secondary
 * account window is created during a routed sign-in flow.
 */

import type { BrowserWindow } from 'electron';
import log from 'electron-log';
import { isAuthenticatedChatUrl } from '../../shared/validators.js';
import environment from '../../environment.js';
import { getAccountWindowManager } from '../utils/accountWindowManager.js';

// ─── module-level cleanup refs ────────────────────────────────────────────────

/**
 * One cleanup function per account index currently being watched.
 * Each entry is removed (set to null / deleted from the map) once the watcher
 * fires or is explicitly cleaned up.
 */
const cleanupByAccount = new Map<number, (() => void) | null>();

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Attach a `did-navigate` watcher to `win`. Calls `onAuth` the first time an
 * authenticated Chat URL is detected, then removes itself automatically.
 *
 * Returns a detach function for early removal.
 */
function watchForAuth(win: BrowserWindow, onAuth: (url: string) => void): () => void {
  const handler = (_event: Electron.Event, url: string) => {
    if (isAuthenticatedChatUrl(url)) {
      // Self-remove before calling back (prevents double-fire if caller
      // synchronously triggers another navigation).
      detach();
      onAuth(url);
    }
  };

  const detach = () => {
    // Always remove the listener — webContents outlives the window destroy call
    // and we must not leave dangling handlers regardless of window state.
    try {
      win.webContents.removeListener('did-navigate', handler);
    } catch {
      // webContents already garbage-collected in some edge cases
    }
  };

  win.webContents.on('did-navigate', handler);
  return detach;
}

// ─── per-account watcher ──────────────────────────────────────────────────────

/**
 * Start watching a single bootstrap account window for authentication.
 *
 * - No-ops if the account is not currently marked as bootstrap.
 * - No-ops if the account window does not exist or is already destroyed.
 * - Attaches both Path A (direct navigation) and Path B (OAuth popup) watchers.
 * - Self-cleans on promotion or window closure.
 *
 * Returns a detach function that removes all listeners early (idempotent).
 * The returned function is also stored internally so `cleanupBootstrapPromotion`
 * can reach it.
 */
export function watchBootstrapAccount(accountIndex: number): () => void {
  const mgr = getAccountWindowManager();

  const noop = () => {
    /* intentional no-op */
  };

  if (!mgr.isBootstrap(accountIndex)) {
    log.debug(`[BootstrapPromotion] Account-${accountIndex} is not a bootstrap window — skipping`);
    return noop;
  }

  const win = mgr.getAccountWindow(accountIndex);
  if (!win || win.isDestroyed()) {
    log.warn(`[BootstrapPromotion] Account-${accountIndex} window not found — skipping`);
    return noop;
  }

  log.info(`[BootstrapPromotion] Watching account-${accountIndex} for authentication`);

  // ── Path A: user authenticates inside the same window ──────────────────────
  const detachMain = watchForAuth(win, (url) => {
    log.info(`[BootstrapPromotion] Account-${accountIndex} authenticated in main window: ${url}`);
    detachChildCreated();
    if (mgr.isBootstrap(accountIndex)) {
      mgr.promoteBootstrap(accountIndex);
    }
    cleanupByAccount.delete(accountIndex);
  });

  // ── Path B: Google opens an OAuth popup / child window for login ───────────
  let detachChild: (() => void) | null = null;

  const childCreatedHandler = (
    childWindow: BrowserWindow,
    _details: Electron.DidCreateWindowDetails
  ) => {
    log.debug(
      `[BootstrapPromotion] Account-${accountIndex} child window created — watching for auth redirect`
    );

    // If a previous child watcher is still attached, remove it first.
    detachChild?.();

    detachChild = watchForAuth(childWindow, (url) => {
      log.info(
        `[BootstrapPromotion] Account-${accountIndex} authenticated via child window: ${url}`
      );
      detachMain();
      detachChildCreated();

      if (mgr.isBootstrap(accountIndex)) {
        mgr.promoteBootstrap(accountIndex);
      }

      // For account-0, reload the main window to the authenticated Chat URL so
      // the UI transitions from the landing page to the real Chat shell.
      if (accountIndex === 0) {
        const mainWindow = mgr.getAccountWindow(0);
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.loadURL(environment.appUrl);
        }
      }

      // Close the child window if still alive.
      if (!childWindow.isDestroyed()) {
        log.debug(
          `[BootstrapPromotion] Closing account-${accountIndex} child auth window after promotion`
        );
        childWindow.destroy();
      }

      cleanupByAccount.delete(accountIndex);
    });

    // Also detach child watcher if the popup is closed before auth completes.
    childWindow.once('closed', () => {
      detachChild = null;
    });
  };

  const detachChildCreated = () => {
    try {
      win.webContents.removeListener('did-create-window', childCreatedHandler);
    } catch {
      // webContents already garbage-collected
    }
    detachChild?.();
    detachChild = null;
  };

  // `did-create-window` is emitted on webContents when a new BrowserWindow is
  // opened as a child (e.g. the Google OAuth popup).
  win.webContents.on('did-create-window', childCreatedHandler);

  // Also self-clean if the account window is closed before auth completes.
  win.once('closed', () => {
    detachMain();
    detachChildCreated();
    cleanupByAccount.delete(accountIndex);
    log.debug(`[BootstrapPromotion] Account-${accountIndex} window closed — listeners removed`);
  });

  const fullCleanup = () => {
    detachMain();
    detachChildCreated();
    log.debug(
      `[BootstrapPromotion] Cleaned up bootstrap promotion listeners for account-${accountIndex}`
    );
  };

  cleanupByAccount.set(accountIndex, fullCleanup);
  return fullCleanup;
}

// ─── feature init ─────────────────────────────────────────────────────────────

export default function init(): void {
  try {
    const mgr = getAccountWindowManager();
    const bootstrapIndices = mgr.getBootstrapAccounts();

    if (bootstrapIndices.length === 0) {
      log.debug('[BootstrapPromotion] No bootstrap accounts — skipping');
      return;
    }

    for (const idx of bootstrapIndices) {
      watchBootstrapAccount(idx);
    }

    log.info(
      `[BootstrapPromotion] Feature initialized; watching accounts: ${bootstrapIndices.join(', ')}`
    );
  } catch (error: unknown) {
    log.error('[BootstrapPromotion] Failed to initialize:', error);
  }
}

// ─── cleanup export ───────────────────────────────────────────────────────────

/**
 * Explicitly remove all listeners attached by this feature.
 * Called by the feature manager on app quit, or by tests after each scenario.
 */
export function cleanupBootstrapPromotion(): void {
  try {
    for (const [idx, fn] of cleanupByAccount) {
      if (fn) {
        fn();
      }
      cleanupByAccount.delete(idx);
    }
    log.debug('[BootstrapPromotion] Cleanup complete');
  } catch (error: unknown) {
    log.error('[BootstrapPromotion] Failed to cleanup:', error);
  }
}
