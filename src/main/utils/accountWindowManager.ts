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
import type { AccountIndex, WebContentsId } from '../../shared/types/branded.js';
import { toPartition } from '../../shared/types/branded.js';
import {
  markAsBootstrap as _markAsBootstrap,
  isBootstrap as _isBootstrap,
  promoteBootstrap as _promoteBootstrap,
  clearBootstrap as _clearBootstrap,
  getBootstrapAccounts as _getBootstrapAccounts,
  clearAllBootstrap,
} from './bootstrapTracker.js';
import { AccountWindowRegistry } from './accountWindowRegistry.js';
import { routeAccountWindow, type HydrationHook } from './accountRouter.js';
import {
  getAccountActivityTracker,
  startSessionMaintenance,
  stopSessionMaintenance,
} from './accountSessionMaintenance.js';
import { createTrackedTimeout } from './resourceCleanup.js';

/**
 * Idle threshold (T12/M3) after which a blurred or hidden account window is
 * dehydrated — the BrowserWindow is destroyed while its `persist:account-N`
 * partition (cookies/localStorage/IDB) survives. Independent of T11's
 * 30-minute session-maintenance threshold.
 */
const DEHYDRATE_IDLE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Per-account state captured immediately before {@link AccountWindowManager.dehydrateAccount}
 * destroys the BrowserWindow. Used to recreate an equivalent window in
 * {@link AccountWindowManager.hydrateAccount}.
 */
interface DehydratedSnapshot {
  url: string;
  bounds: { x: number; y: number; width: number; height: number };
  isMaximized: boolean;
}

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
    {
      record: () => void;
      onClosed: () => void;
      onIdleStart: () => void;
      onIdleCancel: () => void;
    }
  >();
  /**
   * T12/M3 — Sidecar map of accounts whose BrowserWindow has been destroyed
   * to free webContents memory. Entries persist URL/bounds/maximized so
   * {@link hydrateAccount} can recreate an equivalent window against the
   * same `persist:account-N` partition. The partition itself is owned by
   * Electron's session subsystem, NOT this map, so cookies/localStorage/IDB
   * survive even though the entry only stores presentation state.
   */
  private readonly dehydratedAccounts = new Map<AccountIndex, DehydratedSnapshot>();
  /**
   * T12/M3 — Pending dehydration timers per account. A timer is started by
   * blur/hide and cancelled by focus/show, hydrate, register, and destroy.
   * Tracked via {@link createTrackedTimeout} so app shutdown clears them.
   */
  private readonly dehydrateTimers = new Map<AccountIndex, NodeJS.Timeout>();

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

  registerWindow(window: BrowserWindow, accountIndex: AccountIndex): void {
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
  private attachActivityListeners(window: BrowserWindow, accountIndex: AccountIndex): void {
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
    // T12/M3 — idle dehydration timer. Bootstrap accounts are excluded:
    // dehydrating mid-auth would destroy the in-flight Google sign-in flow.
    const onIdleStart = (): void => {
      if (_isBootstrap(accountIndex)) {
        return;
      }
      this.scheduleDehydrate(accountIndex);
    };
    const onIdleCancel = (): void => {
      this.cancelDehydrate(accountIndex);
    };
    window.on('focus', record);
    window.on('blur', record);
    window.on('show', record);
    window.on('hide', record);
    window.on('blur', onIdleStart);
    window.on('hide', onIdleStart);
    window.on('focus', onIdleCancel);
    window.on('show', onIdleCancel);
    window.once('closed', onClosed);
    this.activityListeners.set(window, { record, onClosed, onIdleStart, onIdleCancel });
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
      window.removeListener('blur', handle.onIdleStart);
      window.removeListener('hide', handle.onIdleStart);
      window.removeListener('focus', handle.onIdleCancel);
      window.removeListener('show', handle.onIdleCancel);
      window.removeListener('closed', handle.onClosed);
    }
    this.activityListeners.delete(window);
  }

  getAccountIndex(window: BrowserWindow): AccountIndex | null {
    return this.registry.getAccountIndex(window);
  }

  getAccountWindow(accountIndex: AccountIndex): BrowserWindow | null {
    // T12/M3 — a dehydrated account has no live BrowserWindow. Callers must
    // use {@link hydrateAccount} (or routeAccountWindow's hydration hook) to
    // bring the window back. Returning the registry value here would expose a
    // destroyed window, since `dehydrateAccount` calls `window.destroy()`.
    if (this.dehydratedAccounts.has(accountIndex)) {
      return null;
    }
    return this.registry.getAccountWindow(accountIndex);
  }

  getAccountWebContents(accountIndex: AccountIndex): Electron.WebContents | null {
    return this.registry.getAccountWebContents(accountIndex);
  }

  getAccountForWebContents(webContentsId: WebContentsId): AccountIndex | null {
    return this.registry.getAccountForWebContents(webContentsId);
  }

  getAllWindows(): BrowserWindow[] {
    return this.registry.getAllWindows();
  }

  getMostRecentWindow(): BrowserWindow | null {
    return this.registry.getMostRecentWindow();
  }

  unregisterAccount(accountIndex: AccountIndex): void {
    const window = this.registry.getAccountWindow(accountIndex);
    if (window) {
      this.detachActivityListeners(window);
    }
    this.cancelDehydrate(accountIndex);
    this.dehydratedAccounts.delete(accountIndex);
    this.registry.unregisterAccount(accountIndex);
  }

  hasAccount(accountIndex: AccountIndex): boolean {
    return this.registry.hasAccount(accountIndex);
  }

  getAccountCount(): number {
    return this.registry.getAccountCount();
  }

  destroyAll(): void {
    stopSessionMaintenance();
    this.maintenanceStarted = false;
    for (const accountIndex of this.dehydrateTimers.keys()) {
      this.cancelDehydrate(accountIndex);
    }
    this.dehydrateTimers.clear();
    this.dehydratedAccounts.clear();
    for (const window of this.activityListeners.keys()) {
      this.detachActivityListeners(window);
    }
    this.activityListeners.clear();
    this.registry.destroyAll();
  }

  // ─── Router delegate ─────────────────────────────────────────────────────

  // ─── Router delegate ──────────────────────────────────────────────────

  createAccountWindow(url: string, accountIndex: AccountIndex): BrowserWindow {
    // Pass our own dehydrate/hydrate hooks so the router transparently
    // rehydrates a dehydrated account before navigating (T12/M3).
    const hydrationHook: HydrationHook = {
      isDehydrated: (i) => this.isDehydrated(i),
      hydrate: (i) => this.hydrateAccount(i),
    };
    return routeAccountWindow(this.registry, this.windowFactory, url, accountIndex, hydrationHook);
  }

  // ─── Bootstrap window tracking ───────────────────────────────────────────

  markAsBootstrap(accountIndex: AccountIndex): void {
    if (!this.registry.hasAccount(accountIndex)) {
      log.warn(
        `[AccountWindowManager] markAsBootstrap: account ${accountIndex} not registered — ignored`
      );
      return;
    }
    _markAsBootstrap(accountIndex);
  }

  isBootstrap(accountIndex: AccountIndex): boolean {
    return _isBootstrap(accountIndex);
  }

  promoteBootstrap(accountIndex: AccountIndex): boolean {
    return _promoteBootstrap(accountIndex);
  }

  clearBootstrap(accountIndex: AccountIndex): void {
    _clearBootstrap(accountIndex);
  }

  getBootstrapAccounts(): AccountIndex[] {
    return _getBootstrapAccounts();
  }

  // ─── Window state persistence ────────────────────────────────────────────

  saveAccountWindowState(accountIndex: AccountIndex): void {
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

  getAccountWindowState(accountIndex: AccountIndex): AccountWindowState | null {
    const accountWindows = configGet('accountWindows');
    return accountWindows?.[accountIndex] ?? null;
  }

  // ─── T12/M3 — Hydrate / Dehydrate ──────────────────────────────────────────

  isDehydrated(accountIndex: AccountIndex): boolean {
    return this.dehydratedAccounts.has(accountIndex);
  }

  /**
   * Destroy the BrowserWindow for an account, persisting URL/bounds/maximized
   * so {@link hydrateAccount} can recreate an equivalent window against the
   * same `persist:account-N` partition. The session partition itself is owned
   * by Electron and survives — cookies, localStorage, and IndexedDB are
   * preserved. Bootstrap accounts and unknown indices are no-ops to keep
   * mid-auth Google sign-in flows intact.
   */
  dehydrateAccount(accountIndex: AccountIndex): void {
    if (this.dehydratedAccounts.has(accountIndex)) {
      return;
    }
    if (_isBootstrap(accountIndex)) {
      log.debug(
        `[AccountWindowManager] dehydrateAccount: skipped bootstrap account ${accountIndex}`
      );
      return;
    }
    const window = this.registry.getAccountWindow(accountIndex);
    if (!window || window.isDestroyed()) {
      return;
    }
    // Capture state BEFORE destroying — once destroyed, webContents/getURL
    // become unreliable.
    const bounds = window.getBounds();
    const snapshot: DehydratedSnapshot = {
      url: window.webContents.getURL(),
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      isMaximized: window.isMaximized(),
    };
    this.dehydratedAccounts.set(accountIndex, snapshot);
    this.cancelDehydrate(accountIndex);
    // Detach our listeners first so the closed handler does not race with the
    // explicit cleanup we are about to perform.
    this.detachActivityListeners(window);
    log.info(`[AccountWindowManager] Dehydrating account ${accountIndex} (url=${snapshot.url})`);
    window.destroy();
    // The registry's `closed` listener unregisters the window automatically;
    // no manual unregister needed here.
  }

  /**
   * Recreate a dehydrated account window against its original
   * `persist:account-N` partition and restore bounds/maximized state. Returns
   * the existing window when the account is already alive. Returns `null`
   * when the account is unknown to both the registry and the dehydration
   * sidecar. Throws when hydration is required but no {@link WindowFactory}
   * is configured — we cannot create a partitioned window without one.
   */
  hydrateAccount(accountIndex: AccountIndex): BrowserWindow | null {
    const snapshot = this.dehydratedAccounts.get(accountIndex);
    if (!snapshot) {
      // Already hydrated — return the live window if any.
      return this.registry.getAccountWindow(accountIndex);
    }
    if (!this.windowFactory) {
      throw new Error(
        `[AccountWindowManager] hydrateAccount(${accountIndex}): no WindowFactory configured — cannot recreate window`
      );
    }
    const partition = toPartition(accountIndex);
    const window = this.windowFactory.createWindow(snapshot.url, partition);
    // Clear sidecar BEFORE registering so getAccountWindow (which checks the
    // sidecar) returns the new window during downstream `registerWindow`
    // observers.
    this.dehydratedAccounts.delete(accountIndex);
    this.registry.registerWindow(window, accountIndex);
    this.attachActivityListeners(window, accountIndex);
    // Restore presentation state. setBounds first, then maximize, so that the
    // pre-maximize bounds are remembered for later unmaximize.
    window.setBounds(snapshot.bounds);
    if (snapshot.isMaximized) {
      window.maximize();
    }
    // Explicitly navigate to the saved URL. The factory may already invoke
    // `loadURL` internally (the live windowWrapper does), but we cannot
    // depend on factory side effects — the public contract is “the hydrated
    // window loads the saved URL”, so we make it explicit here.
    void window.loadURL(snapshot.url);
    log.info(
      `[AccountWindowManager] Hydrated account ${accountIndex} (partition=${partition}, url=${snapshot.url})`
    );
    return window;
  }

  /**
   * Schedule a dehydration after {@link DEHYDRATE_IDLE_THRESHOLD_MS}. Idempotent:
   * a pending timer for the same account is left in place so the original
   * blur/hide moment continues to drive the deadline (resetting on every
   * blur/hide would let frequent re-blurs delay dehydration indefinitely).
   */
  private scheduleDehydrate(accountIndex: AccountIndex): void {
    if (this.dehydrateTimers.has(accountIndex)) {
      return;
    }
    if (this.dehydratedAccounts.has(accountIndex)) {
      return;
    }
    const timer = createTrackedTimeout(
      () => {
        this.dehydrateTimers.delete(accountIndex);
        this.dehydrateAccount(accountIndex);
      },
      DEHYDRATE_IDLE_THRESHOLD_MS,
      `dehydrate-account-${accountIndex}`
    );
    this.dehydrateTimers.set(accountIndex, timer);
  }

  private cancelDehydrate(accountIndex: AccountIndex): void {
    const timer = this.dehydrateTimers.get(accountIndex);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.dehydrateTimers.delete(accountIndex);
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
export function getWindowForAccount(accountIndex: AccountIndex): BrowserWindow | null {
  return getAccountWindowManager().getAccountWindow(accountIndex);
}

export function getAccountIndex(window: BrowserWindow): AccountIndex | null {
  return getAccountWindowManager().getAccountIndex(window);
}

/**
 * Convenience function: Create a new account window with isolated session partition
 * Shorthand for getAccountWindowManager().createAccountWindow(url, accountIndex)
 */
export function createAccountWindow(url: string, accountIndex: AccountIndex): BrowserWindow {
  return getAccountWindowManager().createAccountWindow(url, accountIndex);
}

export function getAccountForWebContents(webContentsId: WebContentsId): AccountIndex | null {
  return getAccountWindowManager().getAccountForWebContents(webContentsId);
}
