/**
 * Bootstrap Watcher Utility
 *
 * Watches bootstrap account windows for authentication completion.
 * Extracted from bootstrapPromotion.ts to break the feature→feature import
 * between externalLinks→bootstrapPromotion.
 *
 * Used by both bootstrapPromotion.ts (init) and externalLinks.ts (routing).
 */

import type { BrowserWindow } from 'electron';
import log from 'electron-log';
import { isAuthenticatedChatUrl } from '../../shared/urlValidators.js';
import { getAccountWindowManager } from './accountWindowManager.js';
import type { AccountIndex } from '../../shared/types/branded.js';
import { asAccountIndex } from '../../shared/types/branded.js';

// ─── module-level cleanup refs ────────────────────────────────────────────────

/**
 * One cleanup function per account index currently being watched.
 * Each entry is removed (set to null / deleted from the map) once the watcher
 * fires or is explicitly cleaned up.
 */
const cleanupByAccount = new Map<AccountIndex, (() => void) | null>();

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
export function watchBootstrapAccount(accountIndex: AccountIndex): () => void {
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

      if (accountIndex === asAccountIndex(0)) {
        const mainWindow = mgr.getAccountWindow(asAccountIndex(0));
        if (mainWindow && !mainWindow.isDestroyed()) {
          const currentUrl = mainWindow.webContents.getURL();
          if (currentUrl !== url) {
            void mainWindow.loadURL(url);
          }
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

// ─── cleanup export ───────────────────────────────────────────────────────────

/**
 * Explicitly remove all listeners attached by this module.
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
