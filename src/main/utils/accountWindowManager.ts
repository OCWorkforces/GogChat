/**
 * Account Window Manager - Multi-account session management (Facade)
 *
 * Public API facade for per-account BrowserWindow management.
 * Delegates window registry operations to {@link AccountWindowRegistry}
 * and window creation/routing to {@link routeAccountWindow}.
 *
 * All consumers import from this module — internal structure is transparent.
 *
 * @module accountWindowManager
 */

import type { BrowserWindow } from 'electron';
import log from 'electron-log';
import store from '../config.js';
import type { AccountWindowState, WindowFactory, IAccountWindowManager } from '../../shared/types/window.js';
import {
  markAsBootstrap as _markAsBootstrap,
  isBootstrap as _isBootstrap,
  promoteBootstrap as _promoteBootstrap,
  clearBootstrap as _clearBootstrap,
  getBootstrapAccounts as _getBootstrapAccounts,
  clearAllBootstrap,
} from './bootstrapTracker.js';
import { AccountWindowRegistry } from './accountWindowRegistry.js';
import { routeAccountWindow } from './accountRouter.js';

/**
 * Account Window Manager - Manages per-account BrowserWindow instances
 *
 * Facade that delegates to:
 * - {@link AccountWindowRegistry} for window registration/lookup/lifecycle
 * - {@link routeAccountWindow} for window creation routing
 */
export class AccountWindowManager implements IAccountWindowManager {
  private readonly registry: AccountWindowRegistry;

  constructor(private readonly windowFactory?: WindowFactory) {
    // Reset shared bootstrap tracker so each manager instance starts clean
    clearAllBootstrap();
    this.registry = new AccountWindowRegistry();
  }

  // ─── Registry delegates ──────────────────────────────────────────────────

  registerWindow(window: BrowserWindow, accountIndex: number): void {
    this.registry.registerWindow(window, accountIndex);
  }

  getAccountIndex(window: BrowserWindow): number | null {
    return this.registry.getAccountIndex(window);
  }

  getAccountWindow(accountIndex: number): BrowserWindow | null {
    return this.registry.getAccountWindow(accountIndex);
  }

  getAccountWebContents(accountIndex: number): Electron.WebContents | null {
    return this.registry.getAccountWebContents(accountIndex);
  }

  getAccountForWebContents(webContentsId: number): number | null {
    return this.registry.getAccountForWebContents(webContentsId);
  }

  getAllWindows(): BrowserWindow[] {
    return this.registry.getAllWindows();
  }

  getMostRecentWindow(): BrowserWindow | null {
    return this.registry.getMostRecentWindow();
  }

  unregisterAccount(accountIndex: number): void {
    this.registry.unregisterAccount(accountIndex);
  }

  hasAccount(accountIndex: number): boolean {
    return this.registry.hasAccount(accountIndex);
  }

  getAccountCount(): number {
    return this.registry.getAccountCount();
  }

  destroyAll(): void {
    this.registry.destroyAll();
  }

  // ─── Router delegate ─────────────────────────────────────────────────────

  createAccountWindow(url: string, accountIndex: number): BrowserWindow {
    return routeAccountWindow(this.registry, this.windowFactory, url, accountIndex);
  }

  // ─── Bootstrap window tracking ───────────────────────────────────────────

  markAsBootstrap(accountIndex: number): void {
    if (!this.registry.hasAccount(accountIndex)) {
      log.warn(
        `[AccountWindowManager] markAsBootstrap: account ${accountIndex} not registered — ignored`
      );
      return;
    }
    _markAsBootstrap(accountIndex);
  }

  isBootstrap(accountIndex: number): boolean {
    return _isBootstrap(accountIndex);
  }

  promoteBootstrap(accountIndex: number): boolean {
    return _promoteBootstrap(accountIndex);
  }

  clearBootstrap(accountIndex: number): void {
    _clearBootstrap(accountIndex);
  }

  getBootstrapAccounts(): number[] {
    return _getBootstrapAccounts();
  }

  // ─── Window state persistence ────────────────────────────────────────────

  saveAccountWindowState(accountIndex: number): void {
    const window = this.getAccountWindow(accountIndex);
    if (!window || window.isDestroyed()) {
      return;
    }

    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();

    const accountWindows = store.get('accountWindows') ?? {};
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

  getAccountWindowState(accountIndex: number): AccountWindowState | null {
    const accountWindows = store.get('accountWindows');
    return accountWindows?.[accountIndex] ?? null;
  }
}

// Singleton instance

let accountWindowManager: AccountWindowManager | null = null;

/**
 * Get the global account window manager instance
 */
export function getAccountWindowManager(factory?: WindowFactory): IAccountWindowManager {
  if (!accountWindowManager) {
    accountWindowManager = new AccountWindowManager(factory);
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
