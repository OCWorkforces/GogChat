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
vi.mock('../windowWrapper.js', () => ({
  default: vi.fn(),
}));

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AccountWindowManager,
  getAccountWindowManager,
  destroyAccountWindowManager,
} from './accountWindowManager';
import { MockBrowserWindow } from '../../../tests/mocks/electron';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWindow(): MockBrowserWindow {
  return new MockBrowserWindow();
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
    manager.registerWindow(win0 as any, 0);
    manager.registerWindow(win1 as any, 1);
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
    manager.registerWindow(win0 as any, 0);
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
    manager.registerWindow(win as any, 0);
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
    // Create a window and register manually since createAccountWindow needs windowWrapper
    const win = makeWindow();
    m.registerWindow(win as any, 0);
    m.markAsBootstrap(0);
    expect(m.isBootstrap(0)).toBe(true);
    m.promoteBootstrap(0);
    expect(m.isBootstrap(0)).toBe(false);
  });

  it('destroyAccountWindowManager resets bootstrap state', () => {
    const m = getAccountWindowManager();
    const win = makeWindow();
    m.registerWindow(win as any, 0);
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
    manager.registerWindow(win as any, 0);
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
