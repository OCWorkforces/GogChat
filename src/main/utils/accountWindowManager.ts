/**
 * Account Window Manager - Multi-account session management
 *
 * Provides isolated BrowserWindow instances per account using Electron's
 * partition concept. Each account gets its own session storage.
 *
 * @module accountWindowManager
 */

import { BrowserWindow } from 'electron';
import { isGoogleAuthUrl } from '../../shared/validators.js';
import log from 'electron-log';
import windowWrapper from '../windowWrapper.js';
import store from '../config.js';
import type { AccountWindowState, AccountWindowsMap } from '../../shared/types.js';

/**
 * Account window registration entry
 */
interface AccountWindowEntry {
  window: BrowserWindow;
  accountIndex: number;
  createdAt: number;
}

/**
 * Account Window Manager - Manages per-account BrowserWindow instances
 */
export class AccountWindowManager {
  private windows = new Map<number, AccountWindowEntry>();
  private reverseLookup = new Map<BrowserWindow, number>();
  private mostRecentAccountIndex: number | null = null;
  /**
   * Tracks which account indices are currently bootstrap windows.
   * A bootstrap window is a temporary login window created before the
   * account has completed first authentication. It should be promoted
   * (kept and re-labelled as a real account) or closed after login.
   */
  private bootstrapAccounts = new Set<number>();

  /**
   * Register a BrowserWindow for a specific account index
   * @param window - The BrowserWindow to register
   * @param accountIndex - The account index (0, 1, 2, ...)
   */
  registerWindow(window: BrowserWindow, accountIndex: number): void {
    // Clean up existing entry if re-registering
    if (this.reverseLookup.has(window)) {
      const existingIndex = this.reverseLookup.get(window);
      if (existingIndex !== undefined && existingIndex !== accountIndex) {
        this.windows.delete(existingIndex);
      }
    }

    const entry: AccountWindowEntry = {
      window,
      accountIndex,
      createdAt: Date.now(),
    };

    this.windows.set(accountIndex, entry);
    this.reverseLookup.set(window, accountIndex);
    this.mostRecentAccountIndex = accountIndex;

    window.on('focus', () => {
      this.mostRecentAccountIndex = accountIndex;
    });
    window.on('show', () => {
      this.mostRecentAccountIndex = accountIndex;
    });
    window.on('closed', () => {
      this.unregisterAccount(accountIndex);
    });

    log.info(`[AccountWindowManager] Registered window for account ${accountIndex}`);
  }

  /**
   * Get the account index for a given BrowserWindow
   * @param window - The BrowserWindow to look up
   * @returns The account index or null if not found
   */
  getAccountIndex(window: BrowserWindow): number | null {
    const index = this.reverseLookup.get(window);
    return index !== undefined ? index : null;
  }

  /**
   * Get the BrowserWindow for a specific account index
   * @param accountIndex - The account index to look up
   * @returns The BrowserWindow or null if not found
   */
  getAccountWindow(accountIndex: number): BrowserWindow | null {
    const entry = this.windows.get(accountIndex);
    return entry?.window ?? null;
  }

  /**
   * Get webContents for a specific account
   * @param accountIndex - The account index
   * @returns The webContents or null if window doesn't exist
   */
  getAccountWebContents(accountIndex: number): Electron.WebContents | null {
    const window = this.getAccountWindow(accountIndex);
    return window?.webContents ?? null;
  }

  getAccountForWebContents(webContentsId: number): number | null {
    for (const [accountIndex, entry] of this.windows) {
      if (entry.window.webContents.id === webContentsId) {
        return accountIndex;
      }
    }

    return null;
  }

  /**
   * Get all registered account windows
   * @returns Array of all BrowserWindows
   */
  getAllWindows(): BrowserWindow[] {
    return Array.from(this.windows.values()).map((entry) => entry.window);
  }

  /**
   * Get the most recently created account window
   * @returns The most recent BrowserWindow or null if none exist
   */
  getMostRecentWindow(): BrowserWindow | null {
    if (this.mostRecentAccountIndex === null) {
      return null;
    }
    return this.getAccountWindow(this.mostRecentAccountIndex);
  }

  /**
   * Create a new account window with isolated session partition
   * @param url - The URL to load
   * @param accountIndex - The account index for this window
   * @returns The created BrowserWindow
   */
  createAccountWindow(url: string, accountIndex: number): BrowserWindow {
    const existingWindow = this.getAccountWindow(accountIndex);
    if (existingWindow && !existingWindow.isDestroyed()) {
      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      existingWindow.show();
      existingWindow.focus();
      this.mostRecentAccountIndex = accountIndex;
      // If this is a bootstrap window already mid-auth-flow, do not interrupt
      // sign-in by calling loadURL again.
      const isBootstrapWindow = this.bootstrapAccounts.has(accountIndex);
      const currentUrl = existingWindow.webContents.getURL();
      if (isBootstrapWindow && isGoogleAuthUrl(currentUrl)) {
        log.info(
          `[AccountWindowManager] Skipping loadURL for account ${accountIndex} — bootstrap window is mid-auth (${currentUrl})`
        );
        return existingWindow;
      }
      void existingWindow.loadURL(url);
      return existingWindow;
    }

    const partition = `persist:account-${accountIndex}`;
    const window = windowWrapper(url, partition);

    this.registerWindow(window, accountIndex);

    log.info(
      `[AccountWindowManager] Created account window ${accountIndex} with partition: ${partition}`
    );

    return window;
  }

  /**
   * Remove a window from management (without destroying it)
   * @param accountIndex - The account index to remove
   */
  unregisterAccount(accountIndex: number): void {
    const entry = this.windows.get(accountIndex);
    if (entry) {
      this.reverseLookup.delete(entry.window);
      this.windows.delete(accountIndex);
      this.bootstrapAccounts.delete(accountIndex);

      if (this.mostRecentAccountIndex === accountIndex) {
        // Find the next most recent
        let newestIndex: number | null = null;
        let newestTime = 0;
        for (const [idx, e] of this.windows) {
          if (e.createdAt > newestTime) {
            newestTime = e.createdAt;
            newestIndex = idx;
          }
        }
        this.mostRecentAccountIndex = newestIndex;
      }

      log.info(`[AccountWindowManager] Unregistered account ${accountIndex}`);
    }
  }

  // ─── Bootstrap window tracking ───────────────────────────────────────────

  /**
   * Mark an existing account window as a bootstrap (pre-auth) window.
   * Calling this on an unknown accountIndex is a no-op.
   * @param accountIndex - The account index to mark
   */
  markAsBootstrap(accountIndex: number): void {
    if (!this.windows.has(accountIndex)) {
      log.warn(
        `[AccountWindowManager] markAsBootstrap: account ${accountIndex} not registered — ignored`
      );
      return;
    }
    this.bootstrapAccounts.add(accountIndex);
    log.debug(`[AccountWindowManager] Account ${accountIndex} marked as bootstrap window`);
  }

  /**
   * Query whether an account window is currently in bootstrap state.
   * @param accountIndex - The account index to query
   * @returns True if the window is a bootstrap window
   */
  isBootstrap(accountIndex: number): boolean {
    return this.bootstrapAccounts.has(accountIndex);
  }

  /**
   * Promote a bootstrap window to a real authenticated account window.
   * Clears the bootstrap flag; the window remains registered and open.
   * @param accountIndex - The account index to promote
   * @returns True if the window was previously marked as bootstrap
   */
  promoteBootstrap(accountIndex: number): boolean {
    const wasBootstrap = this.bootstrapAccounts.delete(accountIndex);
    if (wasBootstrap) {
      log.info(
        `[AccountWindowManager] Account ${accountIndex} promoted from bootstrap to authenticated`
      );
    }
    return wasBootstrap;
  }

  /**
   * Clear the bootstrap flag for an account without promoting it.
   * Use this when the bootstrap window should be discarded rather than kept.
   * @param accountIndex - The account index to clear
   */
  clearBootstrap(accountIndex: number): void {
    this.bootstrapAccounts.delete(accountIndex);
    log.debug(`[AccountWindowManager] Bootstrap flag cleared for account ${accountIndex}`);
  }

  /**
   * Return all account indices currently in bootstrap state.
   */
  getBootstrapAccounts(): number[] {
    return Array.from(this.bootstrapAccounts);
  }

  /**
   * Check if an account window exists
   * @param accountIndex - The account index to check
   * @returns True if the account window exists
   */
  hasAccount(accountIndex: number): boolean {
    return this.windows.has(accountIndex);
  }

  /**
   * Get the number of registered accounts
   * @returns The count of registered accounts
   */
  getAccountCount(): number {
    return this.windows.size;
  }

  /**
   * Save window state for an account to the store
   * @param accountIndex - The account index
   */
  saveAccountWindowState(accountIndex: number): void {
    const window = this.getAccountWindow(accountIndex);
    if (!window || window.isDestroyed()) {
      return;
    }

    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();

    const accountWindows = (store.get('accountWindows') ?? {}) as AccountWindowsMap;
    accountWindows[accountIndex] = {
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
      isMaximized,
    };

    store.set('accountWindows', accountWindows);
    log.debug(`[AccountWindowManager] Saved state for account ${accountIndex}`);
  }

  /**
   * Get saved window state for an account from the store
   * @param accountIndex - The account index
   * @returns The saved window state or default
   */
  getAccountWindowState(accountIndex: number): AccountWindowState | null {
    const accountWindows = store.get('accountWindows') as AccountWindowsMap | undefined;
    return accountWindows?.[accountIndex] ?? null;
  }

  /**
   * Cleanup and destroy all account windows
   */
  destroyAll(): void {
    log.info(`[AccountWindowManager] Destroying ${this.windows.size} account windows`);

    for (const entry of this.windows.values()) {
      if (!entry.window.isDestroyed()) {
        entry.window.destroy();
      }
    }

    this.windows.clear();
    this.reverseLookup.clear();
    this.bootstrapAccounts.clear();
    this.mostRecentAccountIndex = null;
    this.reverseLookup.clear();
    this.mostRecentAccountIndex = null;
  }
}

// Singleton instance
let accountWindowManager: AccountWindowManager | null = null;

/**
 * Get the global account window manager instance
 */
export function getAccountWindowManager(): AccountWindowManager {
  if (!accountWindowManager) {
    accountWindowManager = new AccountWindowManager();
  }
  return accountWindowManager;
}

/**
 * Destroy the account window manager singleton
 */
export function destroyAccountWindowManager(): void {
  if (accountWindowManager) {
    accountWindowManager.destroyAll();
    accountWindowManager = null;
    log.info('[AccountWindowManager] Manager destroyed');
  }
}

/**
 * Convenience function: Get the most recently created account window
 * Shorthand for getAccountWindowManager().getMostRecentWindow()
 */
export function getMostRecentWindow(): BrowserWindow | null {
  return getAccountWindowManager().getMostRecentWindow();
}

/**
 * Convenience function: Get the BrowserWindow for a specific account index
 * Shorthand for getAccountWindowManager().getAccountWindow(accountIndex)
 */
export function getWindowForAccount(accountIndex: number): BrowserWindow | null {
  return getAccountWindowManager().getAccountWindow(accountIndex);
}

export function getAccountIndex(window: BrowserWindow): number | null {
  return getAccountWindowManager().getAccountIndex(window);
}

/**
 * Convenience function: Create a new account window with isolated session partition
 * Shorthand for getAccountWindowManager().createAccountWindow(url, accountIndex)
 */
export function createAccountWindow(url: string, accountIndex: number): BrowserWindow {
  return getAccountWindowManager().createAccountWindow(url, accountIndex);
}

export function getAccountForWebContents(webContentsId: number): number | null {
  return getAccountWindowManager().getAccountForWebContents(webContentsId);
}
