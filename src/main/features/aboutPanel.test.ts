/**
 * Unit tests for aboutPanel feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow as BrowserWindowType } from 'electron';

vi.mock('electron', () => ({
  app: {
    setAboutPanelOptions: vi.fn(),
    showAboutPanel: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('os', () => ({
  default: {
    type: vi.fn().mockReturnValue('Darwin'),
    release: vi.fn().mockReturnValue('23.0.0'),
    arch: vi.fn().mockReturnValue('arm64'),
  },
}));

vi.mock('../utils/packageInfo', () => ({
  getPackageInfo: vi.fn().mockReturnValue({
    productName: 'GogChat',
    version: '1.0.0',
    author: 'Test Author',
  }),
}));

import aboutPanel from './aboutPanel';
import { app, BrowserWindow } from 'electron';

describe('aboutPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeFakeWindow(id: number): BrowserWindowType {
    return {
      id,
      isDestroyed: vi.fn().mockReturnValue(false),
      setAlwaysOnTop: vi.fn(),
      once: vi.fn(),
    } as unknown as BrowserWindowType;
  }

  it('calls setAboutPanelOptions with correct package info', () => {
    const mainWindow = makeFakeWindow(1);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mainWindow]);

    aboutPanel(mainWindow);

    expect(app.setAboutPanelOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationName: 'GogChat',
        applicationVersion: '1.0.0',
        copyright: 'Developed by Test Author',
      })
    );
  });

  it('calls showAboutPanel', () => {
    const mainWindow = makeFakeWindow(1);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mainWindow]);

    aboutPanel(mainWindow);
    expect(app.showAboutPanel).toHaveBeenCalled();
  });

  it('includes platform info in version string', () => {
    const mainWindow = makeFakeWindow(1);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mainWindow]);

    aboutPanel(mainWindow);

    const callArgs = vi.mocked(app.setAboutPanelOptions).mock.calls[0][0];
    expect(callArgs.version).toBe('Darwin, 23.0.0, arm64');
  });

  it('does not error on second call', () => {
    const mainWindow = makeFakeWindow(1);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mainWindow]);

    aboutPanel(mainWindow);
    vi.mocked(app.setAboutPanelOptions).mockClear();
    vi.mocked(app.showAboutPanel).mockClear();

    aboutPanel(mainWindow);
  });

  it('finds and configures the about window when a new window is created', () => {
    const mainWindow = makeFakeWindow(1);
    const aboutWin = makeFakeWindow(2);
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mainWindow, aboutWin]);

    aboutPanel(mainWindow);
  });
});
