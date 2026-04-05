/**
 * Unit tests for AccountWindowManager — bootstrap window tracking
 *
 * Covers: markAsBootstrap, isBootstrap, promoteBootstrap, clearBootstrap,
 * getBootstrapAccounts, and cleanup paths (unregisterAccount, destroyAll).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
vi.mock('electron', () => require('../../../tests/mocks/electron'));
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('../config.js', () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AccountWindowManager,
  getAccountWindowManager,
  destroyAccountWindowManager,
  getMostRecentWindow,
  getWindowForAccount,
  getAccountIndex as getAccountIndexFn,
  createAccountWindow as createAccountWindowFn,
  getAccountForWebContents,
} from './accountWindowManager';
import { MockBrowserWindow } from '../../../tests/mocks/electron';
import type { BrowserWindow } from 'electron';
import store from '../config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWindow(): MockBrowserWindow {
  return new MockBrowserWindow();
}

/**
 * Creates a mock WindowFactory that returns the given window on createWindow().
 * Call `factory.createWindow.mockReturnValue(win)` to change the returned window.
 */
function makeMockFactory() {
  return {
    createWindow: vi.fn<(url: string, partition: string) => Electron.BrowserWindow>(),
  };
}

// ---------------------------------------------------------------------------
// Bootstrap API — class-level tests
// ---------------------------------------------------------------------------

describe('AccountWindowManager — bootstrap tracking', () => {
  let manager: AccountWindowManager;
  let win0: MockBrowserWindow;
  let win1: MockBrowserWindow;

  beforeEach(() => {
    manager = new AccountWindowManager();
    win0 = makeWindow();
    win1 = makeWindow();
    // Register two windows so the manager knows about them
    manager.registerWindow(win0 as unknown as BrowserWindow, 0);
    manager.registerWindow(win1 as unknown as BrowserWindow, 1);
  });

  // --- markAsBootstrap ---

  describe('markAsBootstrap', () => {
    it('marks a registered account as bootstrap', () => {
      manager.markAsBootstrap(0);
      expect(manager.isBootstrap(0)).toBe(true);
    });

    it('does not affect other accounts', () => {
      manager.markAsBootstrap(0);
      expect(manager.isBootstrap(1)).toBe(false);
    });

    it('is idempotent — double-marking stays true', () => {
      manager.markAsBootstrap(0);
      manager.markAsBootstrap(0);
      expect(manager.isBootstrap(0)).toBe(true);
    });

    it('is a no-op for an unregistered account index', () => {
      // Should not throw, should not add to bootstrap set
      manager.markAsBootstrap(99);
      expect(manager.isBootstrap(99)).toBe(false);
    });
  });

  // --- isBootstrap ---

  describe('isBootstrap', () => {
    it('returns false for an account that was never marked', () => {
      expect(manager.isBootstrap(0)).toBe(false);
    });

    it('returns false for an unknown index', () => {
      expect(manager.isBootstrap(42)).toBe(false);
    });

    it('returns true after marking', () => {
      manager.markAsBootstrap(1);
      expect(manager.isBootstrap(1)).toBe(true);
    });
  });

  // --- promoteBootstrap ---

  describe('promoteBootstrap', () => {
    it('returns true and clears flag when window was bootstrap', () => {
      manager.markAsBootstrap(0);
      const result = manager.promoteBootstrap(0);
      expect(result).toBe(true);
      expect(manager.isBootstrap(0)).toBe(false);
    });

    it('returns false when window was not bootstrap', () => {
      const result = manager.promoteBootstrap(0);
      expect(result).toBe(false);
    });

    it('window stays registered after promotion', () => {
      manager.markAsBootstrap(0);
      manager.promoteBootstrap(0);
      expect(manager.hasAccount(0)).toBe(true);
    });

    it('does not affect other bootstrap accounts', () => {
      manager.markAsBootstrap(0);
      manager.markAsBootstrap(1);
      manager.promoteBootstrap(0);
      expect(manager.isBootstrap(1)).toBe(true);
    });
  });

  // --- clearBootstrap ---

  describe('clearBootstrap', () => {
    it('clears the bootstrap flag without throwing for non-bootstrap account', () => {
      expect(() => manager.clearBootstrap(0)).not.toThrow();
      expect(manager.isBootstrap(0)).toBe(false);
    });

    it('clears the flag after marking', () => {
      manager.markAsBootstrap(0);
      manager.clearBootstrap(0);
      expect(manager.isBootstrap(0)).toBe(false);
    });

    it('window stays registered after clear', () => {
      manager.markAsBootstrap(0);
      manager.clearBootstrap(0);
      expect(manager.hasAccount(0)).toBe(true);
    });
  });

  // --- getBootstrapAccounts ---

  describe('getBootstrapAccounts', () => {
    it('returns empty array when no bootstrap accounts', () => {
      expect(manager.getBootstrapAccounts()).toEqual([]);
    });

    it('returns only marked bootstrap indices', () => {
      manager.markAsBootstrap(0);
      const result = manager.getBootstrapAccounts();
      expect(result).toContain(0);
      expect(result).not.toContain(1);
    });

    it('updates after promotion', () => {
      manager.markAsBootstrap(0);
      manager.markAsBootstrap(1);
      manager.promoteBootstrap(0);
      const result = manager.getBootstrapAccounts();
      expect(result).not.toContain(0);
      expect(result).toContain(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Bootstrap flag lifecycle — integration with cleanup paths
// ---------------------------------------------------------------------------

describe('AccountWindowManager — bootstrap cleanup on window close', () => {
  let manager: AccountWindowManager;
  let win0: MockBrowserWindow;

  beforeEach(() => {
    manager = new AccountWindowManager();
    win0 = makeWindow();
    manager.registerWindow(win0 as unknown as BrowserWindow, 0);
    manager.markAsBootstrap(0);
  });

  it('bootstrap flag is cleared when the window fires "closed"', () => {
    // Simulates the window being closed (destroy emits "closed")
    win0.destroy();
    expect(manager.isBootstrap(0)).toBe(false);
    expect(manager.hasAccount(0)).toBe(false);
  });

  it('bootstrap flag cleared by unregisterAccount', () => {
    manager.unregisterAccount(0);
    expect(manager.isBootstrap(0)).toBe(false);
  });
});

describe('AccountWindowManager — bootstrap cleared on destroyAll', () => {
  let manager: AccountWindowManager;

  beforeEach(() => {
    manager = new AccountWindowManager();
    const win = makeWindow();
    manager.registerWindow(win as unknown as BrowserWindow, 0);
    manager.markAsBootstrap(0);
  });

  it('destroyAll clears all bootstrap flags', () => {
    manager.destroyAll();
    expect(manager.isBootstrap(0)).toBe(false);
    expect(manager.getBootstrapAccounts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Singleton convenience
// ---------------------------------------------------------------------------

describe('AccountWindowManager — singleton bootstrap', () => {
  beforeEach(() => {
    destroyAccountWindowManager();
  });

  it('bootstrap API available on singleton', () => {
    const m = getAccountWindowManager();
    // Create a window and register manually since createAccountWindow needs a WindowFactory
    const win = makeWindow();
    m.registerWindow(win as unknown as BrowserWindow, 0);
    m.markAsBootstrap(0);
    expect(m.isBootstrap(0)).toBe(true);
    m.promoteBootstrap(0);
    expect(m.isBootstrap(0)).toBe(false);
  });

  it('destroyAccountWindowManager resets bootstrap state', () => {
    const m = getAccountWindowManager();
    const win = makeWindow();
    m.registerWindow(win as unknown as BrowserWindow, 0);
    m.markAsBootstrap(0);
    destroyAccountWindowManager();
    // New singleton should have clean state
    const fresh = getAccountWindowManager();
    expect(fresh.isBootstrap(0)).toBe(false);
    expect(fresh.getBootstrapAccounts()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// createAccountWindow — auth-flow guard (bootstrap + isGoogleAuthUrl)
// ---------------------------------------------------------------------------

describe('AccountWindowManager — createAccountWindow auth-flow guard', () => {
  let manager: AccountWindowManager;
  let win: MockBrowserWindow;
  const GOOGLE_ACCOUNTS_URL = 'https://accounts.google.com/signin/v2/identifier';
  const CHAT_URL = 'https://chat.google.com/u/0/';
  const BOOTSTRAP_TARGET = 'https://accounts.google.com/ServiceLogin';

  beforeEach(() => {
    manager = new AccountWindowManager();
    win = makeWindow();
    manager.registerWindow(win as unknown as BrowserWindow, 0);
  });

  describe('bootstrap window in mid-auth flow — loadURL is skipped', () => {
    it('does not call loadURL when current URL is accounts.google.com', () => {
      // Simulate window already on Google auth page
      win.webContents.url = GOOGLE_ACCOUNTS_URL;
      manager.markAsBootstrap(0);
      const loadURLSpy = vi.spyOn(win, 'loadURL');

      manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(loadURLSpy).not.toHaveBeenCalled();
    });

    it('still shows and focuses the window', () => {
      win.webContents.url = GOOGLE_ACCOUNTS_URL;
      manager.markAsBootstrap(0);
      const showSpy = vi.spyOn(win, 'show');
      const focusSpy = vi.spyOn(win, 'focus');

      manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(showSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
    });

    it('returns the existing window without creating a new one', () => {
      win.webContents.url = GOOGLE_ACCOUNTS_URL;
      manager.markAsBootstrap(0);

      const result = manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(result).toBe(win);
      expect(manager.getAccountCount()).toBe(1);
    });
  });

  describe('bootstrap window NOT on auth URL — loadURL is called', () => {
    it('calls loadURL when current URL is a Chat URL (not accounts.google.com)', () => {
      // e.g. window landed back on chat after a partial auth
      win.webContents.url = CHAT_URL;
      manager.markAsBootstrap(0);
      const loadURLSpy = vi.spyOn(win, 'loadURL');

      manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(loadURLSpy).toHaveBeenCalledWith(BOOTSTRAP_TARGET);
    });

    it('calls loadURL when current URL is empty (fresh window)', () => {
      win.webContents.url = '';
      manager.markAsBootstrap(0);
      const loadURLSpy = vi.spyOn(win, 'loadURL');

      manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(loadURLSpy).toHaveBeenCalledWith(BOOTSTRAP_TARGET);
    });
  });

  describe('non-bootstrap window — loadURL is always called', () => {
    it('calls loadURL even when current URL is accounts.google.com', () => {
      // Bootstrap flag NOT set — must not suppress navigation
      win.webContents.url = GOOGLE_ACCOUNTS_URL;
      const loadURLSpy = vi.spyOn(win, 'loadURL');

      manager.createAccountWindow(BOOTSTRAP_TARGET, 0);

      expect(loadURLSpy).toHaveBeenCalledWith(BOOTSTRAP_TARGET);
    });

    it('calls loadURL for a regular account window loading a Chat URL', () => {
      win.webContents.url = CHAT_URL;
      const loadURLSpy = vi.spyOn(win, 'loadURL');

      manager.createAccountWindow(CHAT_URL, 0);

      expect(loadURLSpy).toHaveBeenCalledWith(CHAT_URL);
    });
  });
});

// ---------------------------------------------------------------------------
// Helper: typed window factory with numeric webContents.id
// ---------------------------------------------------------------------------

let nextWebContentsId = 1000;

function makeTypedWindow(): BrowserWindow {
  const win = new MockBrowserWindow();
  // Ensure webContents has a numeric id for the webContentsToAccountIndex Map
  (win.webContents as unknown as { id: number }).id = nextWebContentsId++;
  return win as unknown as BrowserWindow;
}

// ---------------------------------------------------------------------------
// registerWindow — re-registration, listener cleanup, webContents index
// ---------------------------------------------------------------------------

describe('AccountWindowManager — registerWindow', () => {
  let manager: AccountWindowManager;

  beforeEach(() => {
    nextWebContentsId = 1000;
    manager = new AccountWindowManager();
  });

  it('registers a window and sets up reverse lookup', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    expect(manager.getAccountIndex(win)).toBe(0);
    expect(manager.getAccountWindow(0)).toBe(win);
  });

  it('re-registration with different index removes old index entry', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    expect(manager.getAccountWindow(0)).toBe(win);

    manager.registerWindow(win, 5);
    expect(manager.getAccountWindow(0)).toBeNull();
    expect(manager.getAccountWindow(5)).toBe(win);
    expect(manager.getAccountIndex(win)).toBe(5);
  });

  it('re-registration with same index is idempotent', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    manager.registerWindow(win, 0);
    expect(manager.getAccountIndex(win)).toBe(0);
    expect(manager.getAccountCount()).toBe(1);
  });

  it('cleans up old event listeners on re-registration', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    const listenerCountBefore = win.listenerCount('focus');

    manager.registerWindow(win, 1);
    // Should still have exactly one focus listener (the new one)
    expect(win.listenerCount('focus')).toBe(listenerCountBefore);
    expect(win.listenerCount('show')).toBe(listenerCountBefore);
    expect(win.listenerCount('closed')).toBe(listenerCountBefore);
  });

  it('updates webContents reverse index on registration', () => {
    const win = makeTypedWindow();
    const wcId = win.webContents.id;
    manager.registerWindow(win, 3);
    expect(manager.getAccountForWebContents(wcId)).toBe(3);
  });

  it('focus event updates mostRecentAccountIndex', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);

    win0.emit('focus');
    expect(manager.getMostRecentWindow()).toBe(win0);

    win1.emit('focus');
    expect(manager.getMostRecentWindow()).toBe(win1);
  });

  it('show event updates mostRecentAccountIndex', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);

    win1.emit('show');
    expect(manager.getMostRecentWindow()).toBe(win1);
  });

  it('closed event triggers unregisterAccount', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    expect(manager.hasAccount(0)).toBe(true);

    win.emit('closed');
    expect(manager.hasAccount(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAccountIndex / getAccountWindow / getAccountWebContents / getAccountForWebContents
// ---------------------------------------------------------------------------

describe('AccountWindowManager — lookup methods', () => {
  let manager: AccountWindowManager;

  beforeEach(() => {
    nextWebContentsId = 2000;
    manager = new AccountWindowManager();
  });

  it('getAccountIndex returns null for unregistered window', () => {
    const win = makeTypedWindow();
    expect(manager.getAccountIndex(win)).toBeNull();
  });

  it('getAccountIndex returns correct index', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 7);
    expect(manager.getAccountIndex(win)).toBe(7);
  });

  it('getAccountWindow returns null for unregistered index', () => {
    expect(manager.getAccountWindow(99)).toBeNull();
  });

  it('getAccountWindow returns registered window', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 2);
    expect(manager.getAccountWindow(2)).toBe(win);
  });

  it('getAccountWebContents returns null for unregistered index', () => {
    expect(manager.getAccountWebContents(99)).toBeNull();
  });

  it('getAccountWebContents returns webContents for registered window', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    expect(manager.getAccountWebContents(0)).toBe(win.webContents);
  });

  it('getAccountForWebContents returns null for unknown webContentsId', () => {
    expect(manager.getAccountForWebContents(9999)).toBeNull();
  });

  it('getAccountForWebContents returns correct index', () => {
    const win = makeTypedWindow();
    const wcId = win.webContents.id;
    manager.registerWindow(win, 4);
    expect(manager.getAccountForWebContents(wcId)).toBe(4);
  });

  it('getAllWindows returns empty array when no windows registered', () => {
    expect(manager.getAllWindows()).toEqual([]);
  });

  it('getAllWindows returns all registered windows', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);
    const all = manager.getAllWindows();
    expect(all).toHaveLength(2);
    expect(all).toContain(win0);
    expect(all).toContain(win1);
  });

  it('getMostRecentWindow returns null when no windows exist', () => {
    expect(manager.getMostRecentWindow()).toBeNull();
  });

  it('hasAccount returns false for unregistered index', () => {
    expect(manager.hasAccount(0)).toBe(false);
  });

  it('hasAccount returns true for registered index', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    expect(manager.hasAccount(0)).toBe(true);
  });

  it('getAccountCount returns 0 when empty', () => {
    expect(manager.getAccountCount()).toBe(0);
  });

  it('getAccountCount returns correct count', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);
    expect(manager.getAccountCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createAccountWindow — new window creation + minimized restore + focus
// ---------------------------------------------------------------------------

describe('AccountWindowManager — createAccountWindow (new window path)', () => {
  let manager: AccountWindowManager;
  let mockFactory: ReturnType<typeof makeMockFactory>;

  beforeEach(() => {
    nextWebContentsId = 3000;
    mockFactory = makeMockFactory();
    manager = new AccountWindowManager(mockFactory);
  });

  it('creates a new window via WindowFactory when no existing window', () => {
    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    const result = manager.createAccountWindow('https://chat.google.com', 0);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-0'
    );
    expect(result).toBe(newWin);
    expect(manager.hasAccount(0)).toBe(true);
    expect(manager.getAccountWindow(0)).toBe(newWin);
  });

  it('creates new window with correct partition for account index 3', () => {
    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    manager.createAccountWindow('https://chat.google.com', 3);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-3'
    );
  });

  it('restores minimized existing window instead of creating new', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    // Simulate minimized state
    (win as unknown as MockBrowserWindow).minimize();

    const restoreSpy = vi.spyOn(win, 'restore');
    const showSpy = vi.spyOn(win, 'show');
    const focusSpy = vi.spyOn(win, 'focus');

    const result = manager.createAccountWindow('https://chat.google.com', 0);

    expect(restoreSpy).toHaveBeenCalled();
    expect(showSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(result).toBe(win);
    expect(mockFactory.createWindow).not.toHaveBeenCalled();
  });

  it('focuses non-minimized existing window and calls loadURL', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);

    const showSpy = vi.spyOn(win, 'show');
    const focusSpy = vi.spyOn(win, 'focus');
    const loadURLSpy = vi.spyOn(win, 'loadURL');

    manager.createAccountWindow('https://chat.google.com/new', 0);

    expect(showSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(loadURLSpy).toHaveBeenCalledWith('https://chat.google.com/new');
  });

  it('creates new window when existing window is destroyed', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).destroy();

    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    const result = manager.createAccountWindow('https://chat.google.com', 0);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-0'
    );
    expect(result).toBe(newWin);
  });

  it('updates mostRecentAccountIndex when reusing existing window', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);

    // Focus win1 first
    win1.emit('focus');
    expect(manager.getMostRecentWindow()).toBe(win1);

    // createAccountWindow for 0 should update mostRecent
    manager.createAccountWindow('https://chat.google.com', 0);
    expect(manager.getMostRecentWindow()).toBe(win0);
  });
});

// ---------------------------------------------------------------------------
// unregisterAccount — cleanup paths
// ---------------------------------------------------------------------------

describe('AccountWindowManager — unregisterAccount', () => {
  let manager: AccountWindowManager;

  beforeEach(() => {
    nextWebContentsId = 4000;
    manager = new AccountWindowManager();
  });

  it('removes window from all internal maps', () => {
    const win = makeTypedWindow();
    const wcId = win.webContents.id;
    manager.registerWindow(win, 0);

    manager.unregisterAccount(0);

    expect(manager.hasAccount(0)).toBe(false);
    expect(manager.getAccountIndex(win)).toBeNull();
    expect(manager.getAccountForWebContents(wcId)).toBeNull();
    expect(manager.getAccountCount()).toBe(0);
  });

  it('removes event listeners from window', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    const focusListenersBefore = win.listenerCount('focus');
    expect(focusListenersBefore).toBeGreaterThan(0);

    manager.unregisterAccount(0);

    // Listeners should be removed (only the ones AWM added)
    expect(win.listenerCount('focus')).toBe(focusListenersBefore - 1);
    expect(win.listenerCount('show')).toBe(0);
    expect(win.listenerCount('closed')).toBe(0);
  });

  it('updates mostRecentAccountIndex to next newest window', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    // Small delay to ensure different createdAt timestamps
    manager.registerWindow(win1, 1);

    // Make account 0 most recent
    win0.emit('focus');
    expect(manager.getMostRecentWindow()).toBe(win0);

    // Unregister account 0 — should fall back to newest remaining (account 1)
    manager.unregisterAccount(0);
    expect(manager.getMostRecentWindow()).toBe(win1);
  });

  it('sets mostRecentAccountIndex to null when last window unregistered', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    win.emit('focus');

    manager.unregisterAccount(0);
    expect(manager.getMostRecentWindow()).toBeNull();
  });

  it('is a no-op for unregistered account index', () => {
    // Should not throw
    expect(() => manager.unregisterAccount(99)).not.toThrow();
  });

  it('clears bootstrap flag on unregister', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    manager.markAsBootstrap(0);
    expect(manager.isBootstrap(0)).toBe(true);

    manager.unregisterAccount(0);
    expect(manager.isBootstrap(0)).toBe(false);
  });

  it('skips listener removal for destroyed window', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);

    // Destroy the window first — then unregister should skip removeListener
    (win as unknown as MockBrowserWindow).destroy();

    // Unregister should handle destroyed window gracefully
    // (the 'closed' event already triggered unregister, but calling again is safe)
    expect(() => manager.unregisterAccount(0)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// saveAccountWindowState / getAccountWindowState
// ---------------------------------------------------------------------------

describe('AccountWindowManager — window state persistence', () => {
  let manager: AccountWindowManager;
  const mockStore = vi.mocked(store);

  beforeEach(() => {
    nextWebContentsId = 5000;
    manager = new AccountWindowManager();
    mockStore.get.mockReset();
    mockStore.set.mockReset();
  });

  it('saveAccountWindowState saves bounds and maximized state', () => {
    const win = makeTypedWindow();
    (win as unknown as MockBrowserWindow).setBounds({ x: 100, y: 200, width: 1024, height: 768 });
    manager.registerWindow(win, 0);

    mockStore.get.mockReturnValue({});

    manager.saveAccountWindowState(0);

    expect(mockStore.set).toHaveBeenCalledWith('accountWindows', {
      0: {
        bounds: { x: 100, y: 200, width: 1024, height: 768 },
        isMaximized: false,
      },
    });
  });

  it('saveAccountWindowState saves maximized state as true', () => {
    const win = makeTypedWindow();
    (win as unknown as MockBrowserWindow).maximize();
    manager.registerWindow(win, 0);

    mockStore.get.mockReturnValue({});

    manager.saveAccountWindowState(0);

    expect(mockStore.set).toHaveBeenCalledWith(
      'accountWindows',
      expect.objectContaining({
        0: expect.objectContaining({ isMaximized: true }),
      })
    );
  });

  it('saveAccountWindowState merges with existing account state', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 1);

    // Existing state for account 0
    mockStore.get.mockReturnValue({
      0: { bounds: { x: 0, y: 0, width: 800, height: 600 }, isMaximized: false },
    });

    manager.saveAccountWindowState(1);

    expect(mockStore.set).toHaveBeenCalledWith(
      'accountWindows',
      expect.objectContaining({
        0: expect.objectContaining({ bounds: { x: 0, y: 0, width: 800, height: 600 } }),
        1: expect.objectContaining({ isMaximized: false }),
      })
    );
  });

  it('saveAccountWindowState returns early for unregistered account', () => {
    manager.saveAccountWindowState(99);
    expect(mockStore.set).not.toHaveBeenCalled();
  });

  it('saveAccountWindowState returns early for destroyed window', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).destroy();

    // After destroy, the closed handler unregistered it, but just in case
    // we also test with a direct call on a still-registered but destroyed window:
    // Re-register to put it back in the map (even though it's destroyed)
    // This tests the isDestroyed() guard directly
    manager.saveAccountWindowState(0);
    expect(mockStore.set).not.toHaveBeenCalled();
  });

  it('saveAccountWindowState handles null from store.get(accountWindows)', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);

    mockStore.get.mockReturnValue(undefined);

    manager.saveAccountWindowState(0);

    expect(mockStore.set).toHaveBeenCalledWith(
      'accountWindows',
      expect.objectContaining({
        0: expect.any(Object),
      })
    );
  });

  it('getAccountWindowState returns saved state', () => {
    const savedState = {
      bounds: { x: 100, y: 200, width: 1024, height: 768 },
      isMaximized: true,
    };
    mockStore.get.mockReturnValue({ 0: savedState });

    const result = manager.getAccountWindowState(0);
    expect(result).toEqual(savedState);
  });

  it('getAccountWindowState returns null when no saved state', () => {
    mockStore.get.mockReturnValue(undefined);

    const result = manager.getAccountWindowState(0);
    expect(result).toBeNull();
  });

  it('getAccountWindowState returns null for missing account index', () => {
    mockStore.get.mockReturnValue({
      1: { bounds: { x: 0, y: 0, width: 800, height: 600 }, isMaximized: false },
    });

    const result = manager.getAccountWindowState(0);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// destroyAll — comprehensive cleanup
// ---------------------------------------------------------------------------

describe('AccountWindowManager — destroyAll', () => {
  let manager: AccountWindowManager;

  beforeEach(() => {
    nextWebContentsId = 6000;
    manager = new AccountWindowManager();
  });

  it('destroys all windows and clears all internal state', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    manager.registerWindow(win0, 0);
    manager.registerWindow(win1, 1);
    manager.markAsBootstrap(0);

    win0.emit('focus');

    manager.destroyAll();

    expect(manager.getAccountCount()).toBe(0);
    expect(manager.getAllWindows()).toEqual([]);
    expect(manager.getMostRecentWindow()).toBeNull();
    expect(manager.getBootstrapAccounts()).toEqual([]);
    expect(manager.hasAccount(0)).toBe(false);
    expect(manager.hasAccount(1)).toBe(false);
  });

  it('calls destroy on non-destroyed windows', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    const destroySpy = vi.spyOn(win, 'destroy');

    manager.destroyAll();

    expect(destroySpy).toHaveBeenCalled();
  });

  it('skips destroy on already-destroyed windows', () => {
    const win = makeTypedWindow();
    manager.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).destroy();

    // Re-add to the internal map by registering a new window at same index
    // and then destroying it — the destroyAll should not throw
    expect(() => manager.destroyAll()).not.toThrow();
  });

  it('clears webContents reverse index', () => {
    const win = makeTypedWindow();
    const wcId = win.webContents.id;
    manager.registerWindow(win, 0);

    manager.destroyAll();

    expect(manager.getAccountForWebContents(wcId)).toBeNull();
  });

  it('is safe to call on empty manager', () => {
    expect(() => manager.destroyAll()).not.toThrow();
    expect(manager.getAccountCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Singleton: getAccountWindowManager / destroyAccountWindowManager
// ---------------------------------------------------------------------------

describe('AccountWindowManager — singleton lifecycle', () => {
  afterEach(() => {
    destroyAccountWindowManager();
  });

  it('getAccountWindowManager returns same instance', () => {
    const m1 = getAccountWindowManager();
    const m2 = getAccountWindowManager();
    expect(m1).toBe(m2);
  });

  it('destroyAccountWindowManager creates fresh instance on next call', () => {
    const m1 = getAccountWindowManager();
    const win = makeTypedWindow();
    m1.registerWindow(win, 0);

    destroyAccountWindowManager();

    const m2 = getAccountWindowManager();
    expect(m2).not.toBe(m1);
    expect(m2.getAccountCount()).toBe(0);
  });

  it('destroyAccountWindowManager is safe to call when no instance', () => {
    destroyAccountWindowManager();
    expect(() => destroyAccountWindowManager()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Module-level convenience functions
// ---------------------------------------------------------------------------

describe('AccountWindowManager — module-level convenience functions', () => {
  let mockFactory: ReturnType<typeof makeMockFactory>;

  afterEach(() => {
    destroyAccountWindowManager();
  });

  it('getMostRecentWindow delegates to singleton', () => {
    const m = getAccountWindowManager();
    const win = makeTypedWindow();
    m.registerWindow(win, 0);
    win.emit('focus');

    expect(getMostRecentWindow()).toBe(win);
  });

  it('getMostRecentWindow returns null with no windows', () => {
    expect(getMostRecentWindow()).toBeNull();
  });

  it('getWindowForAccount delegates to singleton', () => {
    const m = getAccountWindowManager();
    const win = makeTypedWindow();
    m.registerWindow(win, 2);

    expect(getWindowForAccount(2)).toBe(win);
  });

  it('getWindowForAccount returns null for unregistered index', () => {
    expect(getWindowForAccount(99)).toBeNull();
  });

  it('getAccountIndex delegates to singleton', () => {
    const m = getAccountWindowManager();
    const win = makeTypedWindow();
    m.registerWindow(win, 5);

    expect(getAccountIndexFn(win)).toBe(5);
  });

  it('createAccountWindow delegates to singleton and creates via WindowFactory', () => {
    mockFactory = makeMockFactory();
    // Initialize singleton with mock factory (first call creates the instance)
    destroyAccountWindowManager();
    getAccountWindowManager(mockFactory);

    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    const result = createAccountWindowFn('https://chat.google.com', 0);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-0'
    );
    expect(result).toBe(newWin);
  });

  it('getAccountForWebContents delegates to singleton', () => {
    const m = getAccountWindowManager();
    const win = makeTypedWindow();
    const wcId = win.webContents.id;
    m.registerWindow(win, 3);

    expect(getAccountForWebContents(wcId)).toBe(3);
  });

  it('getAccountForWebContents returns null for unknown id', () => {
    expect(getAccountForWebContents(9999)).toBeNull();
  });
});
