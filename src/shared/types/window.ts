/**
 * Window and account-window state shapes.
 */

/**
 * Window bounds for state persistence
 */
export interface WindowBounds {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

/**
 * Window state configuration
 */
export interface WindowState {
  bounds: WindowBounds;
  isMaximized: boolean;
}

/**
 * Account-scoped window bounds for multi-account sessions
 */
export interface AccountWindowBounds {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

/**
 * Account-scoped window state for per-account BrowserWindows
 */
export interface AccountWindowState {
  bounds: AccountWindowBounds;
  isMaximized: boolean;
}

/**
 * Maps account index to account window state
 */
export type AccountWindowsMap = Record<number, AccountWindowState>;

/**
 * Factory interface for creating account BrowserWindows.
 * Breaks the concrete coupling between accountWindowManager and windowWrapper.
 */
export interface WindowFactory {
  createWindow(url: string, partition: string): Electron.BrowserWindow;
}

/**
 * Account window manager interface — public API surface for multi-account
 * BrowserWindow management. Consumers should depend on this abstraction
 * rather than the concrete `AccountWindowManager` class.
 */
export interface IAccountWindowManager {
  registerWindow(window: Electron.BrowserWindow, accountIndex: number): void;
  getAccountIndex(window: Electron.BrowserWindow): number | null;
  getAccountWindow(accountIndex: number): Electron.BrowserWindow | null;
  getAccountWebContents(accountIndex: number): Electron.WebContents | null;
  getAccountForWebContents(webContentsId: number): number | null;
  getAllWindows(): Electron.BrowserWindow[];
  getMostRecentWindow(): Electron.BrowserWindow | null;
  hasAccount(accountIndex: number): boolean;
  unregisterAccount(accountIndex: number): void;
  getAccountCount(): number;
  destroyAll(): void;
  createAccountWindow(url: string, accountIndex: number): Electron.BrowserWindow;
  markAsBootstrap(accountIndex: number): void;
  promoteBootstrap(accountIndex: number): boolean;
  isBootstrap(accountIndex: number): boolean;
  clearBootstrap(accountIndex: number): void;
  getBootstrapAccounts(): number[];
  saveAccountWindowState(accountIndex: number): void;
  getAccountWindowState(accountIndex: number): AccountWindowState | null;
  /**
   * Dehydrate the account: destroy the BrowserWindow and persist
   * URL/bounds/maximized state for later rehydration. The
   * `persist:account-N` partition is preserved (cookies/localStorage/IDB
   * survive). No-op for bootstrap accounts, unknown indices, or accounts
   * that are already dehydrated.
   */
  dehydrateAccount(accountIndex: number): void;
  /**
   * Hydrate the account: recreate the BrowserWindow against the same
   * `persist:account-N` partition and restore URL/bounds/maximized state.
   * Returns the hydrated window, or `null` if the account is unknown.
   * Returns the existing window if the account is already alive.
   * Throws if hydration is required but no `WindowFactory` is configured.
   */
  hydrateAccount(accountIndex: number): Electron.BrowserWindow | null;
  /**
   * Whether the given account is currently in the dehydrated state.
   */
  isDehydrated(accountIndex: number): boolean;
}
