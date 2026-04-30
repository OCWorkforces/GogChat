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
import { configGet, configSet } from '../config.js';
import type {
  AccountWindowState,
  WindowFactory,
  IAccountWindowManager,
  AccountWindowsMap,
} from '../../shared/types/window.js';
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
import {
  getAccountActivityTracker,
  startSessionMaintenance,
  stopSessionMaintenance,
} from './accountSessionMaintenance.js';

/**
 * Serialized write queue for the `accountWindows` config key.
 *
 * Multiple account windows may concurrently call `saveAccountWindowState`
 * (resize, app quit, etc.). Without serialization, the read-modify-write
 * pattern can lose updates: two reads observe the same baseline, then the
 * second write overwrites the first.
 *
 * All mutations to `accountWindows` MUST go through `updateAccountWindows`
 * so they execute sequentially on this microtask chain.
 */
let accountWindowsWriteQueue: Promise<void> = Promise.resolve();

function updateAccountWindows(
  updater: (current: AccountWindowsMap) => AccountWindowsMap
): Promise<void> {
  accountWindowsWriteQueue = accountWindowsWriteQueue.then(() => {
    const current = configGet('accountWindows') ?? {};
    configSet('accountWindows', updater(current));
  });
  return accountWindowsWriteQueue;
}

/**
 * Await all pending `accountWindows` writes. Intended for tests and
 * shutdown paths that must observe a fully-flushed state.
 */
export function flushAccountWindowsWrites(): Promise<void> {
  return accountWindowsWriteQueue;
}

/**
 * Account Window Manager - Manages per-account BrowserWindow instances
 *
 * Facade that delegates to:
 * - {@link AccountWindowRegistry} for window registration/lookup/lifecycle
 * - {@link routeAccountWindow} for window creation routing
 */
export class AccountWindowManager implements IAccountWindowManager {
  private readonly registry: AccountWindowRegistry;
  private maintenanceStarted = false;
  /**
   * Per-window activity listener handles, kept so we can detach on
   * re-registration (different accountIndex) and on unregister/destroy.
   * Without this, repeated `registerWindow` calls would leak listeners.
   */
  private readonly activityListeners = new Map<
    BrowserWindow,
    { record: () => void; onClosed: () => void }
  >();

  constructor(private readonly windowFactory?: WindowFactory) {
    // Reset shared bootstrap tracker so each manager instance starts clean
    clearAllBootstrap();
    this.registry = new AccountWindowRegistry();
    this.startMaintenance();
  }

  /**
   * Start the periodic session maintenance scheduler. Idempotent — safe to
   * call from the constructor and again from explicit init paths.
   */
  private startMaintenance(): void {
    if (this.maintenanceStarted) {
      return;
    }
    startSessionMaintenance(getAccountActivityTracker(), this);
    this.maintenanceStarted = true;
  }

  // ─── Registry delegates ──────────────────────────────────────────────────

  registerWindow(window: BrowserWindow, accountIndex: number): void {
    this.detachActivityListeners(window);
    this.registry.registerWindow(window, accountIndex);
    this.attachActivityListeners(window, accountIndex);
  }

  /**
   * Wire focus/blur/show/hide BrowserWindow events to the activity tracker.
   * The registry already tracks focus/show for most-recent-window purposes; we
   * additionally record blur/hide so that any user interaction with the
   * window — gaining or losing OS focus — counts as recent activity.
   */
  private attachActivityListeners(window: BrowserWindow, accountIndex: number): void {
    const tracker = getAccountActivityTracker();
    // Stamp activity immediately on registration so the window is not
    // immediately considered idle.
    tracker.recordActivity(accountIndex);
    const record = (): void => {
      tracker.recordActivity(accountIndex);
    };
    const onClosed = (): void => {
      this.detachActivityListeners(window);
    };
    window.on('focus', record);
    window.on('blur', record);
    window.on('show', record);
    window.on('hide', record);
    window.once('closed', onClosed);
    this.activityListeners.set(window, { record, onClosed });
  }

  private detachActivityListeners(window: BrowserWindow): void {
    const handle = this.activityListeners.get(window);
    if (!handle) {
      return;
    }
    if (!window.isDestroyed()) {
      window.removeListener('focus', handle.record);
      window.removeListener('blur', handle.record);
      window.removeListener('show', handle.record);
      window.removeListener('hide', handle.record);
      window.removeListener('closed', handle.onClosed);
    }
    this.activityListeners.delete(window);
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
    const window = this.registry.getAccountWindow(accountIndex);
    if (window) {
      this.detachActivityListeners(window);
    }
    this.registry.unregisterAccount(accountIndex);
  }

  hasAccount(accountIndex: number): boolean {
    return this.registry.hasAccount(accountIndex);
  }

  getAccountCount(): number {
    return this.registry.getAccountCount();
  }

  destroyAll(): void {
    stopSessionMaintenance();
    this.maintenanceStarted = false;
    for (const window of this.activityListeners.keys()) {
      this.detachActivityListeners(window);
    }
    this.activityListeners.clear();
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

    void updateAccountWindows((current) => ({
      ...current,
      [accountIndex]: {
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
        isMaximized,
      },
    }));
    log.debug(`[AccountWindowManager] Saved state for account ${accountIndex}`);
  }

  getAccountWindowState(accountIndex: number): AccountWindowState | null {
    const accountWindows = configGet('accountWindows');
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
