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
