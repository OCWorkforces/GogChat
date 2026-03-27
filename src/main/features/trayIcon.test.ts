/**
 * Unit tests for trayIcon feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    showAboutPanel: vi.fn(),
    exit: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn().mockReturnValue({}),
  },
  Tray: vi.fn().mockImplementation(function (_icon: unknown) {
    return {
      setIgnoreDoubleClickEvents: vi.fn(),
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
      on: vi.fn(),
      isDestroyed: vi.fn().mockReturnValue(false),
      destroy: vi.fn(),
    };
  }),
  NativeImage: {},
}));

vi.mock('../utils/iconCache', () => ({
  getIconCache: vi.fn().mockReturnValue({
    getIcon: vi.fn().mockReturnValue({}),
  }),
}));

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import createTrayIcon, { cleanupTrayIcon } from './trayIcon';
import { Tray, Menu } from 'electron';

describe('trayIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFakeWindow() {
    return {
      isMinimized: vi.fn().mockReturnValue(false),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };
  }

  function getLastTrayInstance() {
    const calls = vi.mocked(Tray).mock.calls;
    const lastCall = calls[calls.length - 1];
    // The instance is the return value of the mock implementation
    return lastCall ? vi.mocked(Tray).mock.results[calls.length - 1].value : null;
  }

  it('creates a tray icon', () => {
    const window = makeFakeWindow();
    const tray = createTrayIcon(window as any);
    expect(tray).toBeDefined();
  });

  it('sets ignore double click events', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;
    expect(tray.setIgnoreDoubleClickEvents).toHaveBeenCalledWith(true);
  });

  it('sets tooltip', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;
    expect(tray.setToolTip).toHaveBeenCalledWith('GogChat');
  });

  it('registers click handler for open action', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;
    expect(tray.on).toHaveBeenCalledWith('click', expect.any(Function));
  });

  it('sets context menu with menu template', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;
    expect(Menu.buildFromTemplate).toHaveBeenCalled();
    expect(tray.setContextMenu).toHaveBeenCalled();
  });

  it('shows and focuses window on open click', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;

    const clickHandler = tray.on.mock.calls.find((c: [string]) => c[0] === 'click')?.[1];
    expect(clickHandler).toBeDefined();

    clickHandler!();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('restores window if minimized on open click', () => {
    const window = makeFakeWindow();
    vi.mocked(window.isMinimized).mockReturnValue(true);
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;

    const clickHandler = tray.on.mock.calls.find((c: [string]) => c[0] === 'click')?.[1];
    clickHandler!();

    expect(window.restore).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('cleanup destroys tray icon', () => {
    const window = makeFakeWindow();
    createTrayIcon(window as any);
    const tray = getLastTrayInstance()!;

    cleanupTrayIcon();
    expect(tray.destroy).toHaveBeenCalled();
  });
});
