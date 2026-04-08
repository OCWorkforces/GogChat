/**
 * Unit tests for accountRouter — window creation routing logic
 *
 * Covers: existing window reuse, minimized restore, auth-flow guard,
 * new window creation via WindowFactory.
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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { routeAccountWindow } from './accountRouter';
import { AccountWindowRegistry } from './accountWindowRegistry';
import { markAsBootstrap, clearAllBootstrap } from './bootstrapTracker';
import { MockBrowserWindow } from '../../../tests/mocks/electron';
import type { BrowserWindow } from 'electron';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextWebContentsId = 7000;

function makeTypedWindow(): BrowserWindow {
  const win = new MockBrowserWindow();
  (win.webContents as unknown as { id: number }).id = nextWebContentsId++;
  return win as unknown as BrowserWindow;
}

function makeMockFactory() {
  return {
    createWindow: vi.fn<(url: string, partition: string) => Electron.BrowserWindow>(),
  };
}

// ---------------------------------------------------------------------------
// routeAccountWindow — new window creation
// ---------------------------------------------------------------------------

describe('routeAccountWindow — new window path', () => {
  let registry: AccountWindowRegistry;
  let mockFactory: ReturnType<typeof makeMockFactory>;

  beforeEach(() => {
    nextWebContentsId = 7000;
    registry = new AccountWindowRegistry();
    mockFactory = makeMockFactory();
  });

  it('creates a new window via WindowFactory when no existing window', () => {
    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    const result = routeAccountWindow(registry, mockFactory, 'https://chat.google.com', 0);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-0'
    );
    expect(result).toBe(newWin);
    expect(registry.hasAccount(0)).toBe(true);
    expect(registry.getAccountWindow(0)).toBe(newWin);
  });

  it('creates new window with correct partition for account index 3', () => {
    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    routeAccountWindow(registry, mockFactory, 'https://chat.google.com', 3);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-3'
    );
  });

  it('throws when no WindowFactory and no existing window', () => {
    expect(() => routeAccountWindow(registry, undefined, 'https://chat.google.com', 0)).toThrow(
      'No WindowFactory injected'
    );
  });

  it('creates new window when existing window is destroyed', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).destroy();

    const newWin = makeTypedWindow();
    mockFactory.createWindow.mockReturnValue(newWin);

    const result = routeAccountWindow(registry, mockFactory, 'https://chat.google.com', 0);

    expect(mockFactory.createWindow).toHaveBeenCalledWith(
      'https://chat.google.com',
      'persist:account-0'
    );
    expect(result).toBe(newWin);
  });
});

// ---------------------------------------------------------------------------
// routeAccountWindow — existing window reuse
// ---------------------------------------------------------------------------

describe('routeAccountWindow — existing window reuse', () => {
  let registry: AccountWindowRegistry;
  let mockFactory: ReturnType<typeof makeMockFactory>;

  beforeEach(() => {
    nextWebContentsId = 8000;
    registry = new AccountWindowRegistry();
    mockFactory = makeMockFactory();
  });

  it('restores minimized existing window instead of creating new', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).minimize();

    const restoreSpy = vi.spyOn(win, 'restore');
    const showSpy = vi.spyOn(win, 'show');
    const focusSpy = vi.spyOn(win, 'focus');

    const result = routeAccountWindow(registry, mockFactory, 'https://chat.google.com', 0);

    expect(restoreSpy).toHaveBeenCalled();
    expect(showSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(result).toBe(win);
    expect(mockFactory.createWindow).not.toHaveBeenCalled();
  });

  it('focuses non-minimized existing window and calls loadURL', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);

    const showSpy = vi.spyOn(win, 'show');
    const focusSpy = vi.spyOn(win, 'focus');
    const loadURLSpy = vi.spyOn(win, 'loadURL');

    routeAccountWindow(registry, mockFactory, 'https://chat.google.com/new', 0);

    expect(showSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
    expect(loadURLSpy).toHaveBeenCalledWith('https://chat.google.com/new');
  });

  it('updates mostRecentAccountIndex when reusing existing window', () => {
    const win0 = makeTypedWindow();
    const win1 = makeTypedWindow();
    registry.registerWindow(win0, 0);
    registry.registerWindow(win1, 1);

    win1.emit('focus');
    expect(registry.getMostRecentWindow()).toBe(win1);

    routeAccountWindow(registry, mockFactory, 'https://chat.google.com', 0);
    expect(registry.getMostRecentWindow()).toBe(win0);
  });
});

// ---------------------------------------------------------------------------
// routeAccountWindow — bootstrap auth-flow guard
// ---------------------------------------------------------------------------

describe('routeAccountWindow — auth-flow guard', () => {
  let registry: AccountWindowRegistry;
  let mockFactory: ReturnType<typeof makeMockFactory>;
  const GOOGLE_ACCOUNTS_URL = 'https://accounts.google.com/signin/v2/identifier';
  const CHAT_URL = 'https://chat.google.com/u/0/';
  const BOOTSTRAP_TARGET = 'https://accounts.google.com/ServiceLogin';

  beforeEach(() => {
    nextWebContentsId = 9000;
    clearAllBootstrap();
    registry = new AccountWindowRegistry();
    mockFactory = makeMockFactory();
  });

  it('does not call loadURL when bootstrap window is on accounts.google.com', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).webContents.url = GOOGLE_ACCOUNTS_URL;

    markAsBootstrap(0);

    const loadURLSpy = vi.spyOn(win, 'loadURL');
    routeAccountWindow(registry, mockFactory, BOOTSTRAP_TARGET, 0);
    expect(loadURLSpy).not.toHaveBeenCalled();
  });

  it('still shows and focuses the window when mid-auth', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).webContents.url = GOOGLE_ACCOUNTS_URL;

    markAsBootstrap(0);

    const showSpy = vi.spyOn(win, 'show');
    const focusSpy = vi.spyOn(win, 'focus');

    routeAccountWindow(registry, mockFactory, BOOTSTRAP_TARGET, 0);

    expect(showSpy).toHaveBeenCalled();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('calls loadURL when bootstrap window is NOT on auth URL', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).webContents.url = CHAT_URL;

    markAsBootstrap(0);

    const loadURLSpy = vi.spyOn(win, 'loadURL');
    routeAccountWindow(registry, mockFactory, BOOTSTRAP_TARGET, 0);
    expect(loadURLSpy).toHaveBeenCalledWith(BOOTSTRAP_TARGET);
  });

  it('calls loadURL for non-bootstrap window even on auth URL', () => {
    const win = makeTypedWindow();
    registry.registerWindow(win, 0);
    (win as unknown as MockBrowserWindow).webContents.url = GOOGLE_ACCOUNTS_URL;

    const loadURLSpy = vi.spyOn(win, 'loadURL');
    routeAccountWindow(registry, mockFactory, BOOTSTRAP_TARGET, 0);
    expect(loadURLSpy).toHaveBeenCalledWith(BOOTSTRAP_TARGET);
  });
});
