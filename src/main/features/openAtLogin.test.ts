/**
 * Unit tests for openAtLogin feature.
 *
 * Note: openAtLogin uses a module-level singleton (autoLaunchInstance).
 * Tests that depend on the constructor being called must run before the singleton
 * is created. Later tests verify behavior via config mocking and side effects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockIsDev = false;

vi.mock('electron', () => ({
  app: {
    getName: vi.fn().mockReturnValue('GogChat'),
    commandLine: { hasSwitch: vi.fn().mockReturnValue(false) },
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('auto-launch', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      enable: vi.fn().mockResolvedValue(undefined),
      disable: vi.fn().mockResolvedValue(undefined),
      isEnabled: vi.fn().mockResolvedValue(false),
    };
  }),
}));

vi.mock('../config', () => ({
  default: {
    get: vi.fn().mockReturnValue(false),
  },
}));

vi.mock('../../environment', () => ({
  get default() {
    return { isDev: mockIsDev };
  },
}));

import openAtLogin from './openAtLogin';
import store from '../config';
import { app } from 'electron';
import AutoLaunch from 'auto-launch';

describe('openAtLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsDev = false;
    vi.mocked(app.commandLine.hasSwitch).mockReturnValue(false);
  });

  it('returns early in development mode', () => {
    mockIsDev = true;
    openAtLogin({ mainWindow: null });
    expect(AutoLaunch).not.toHaveBeenCalled();
  });

  it('creates AutoLaunch instance when auto-launch is enabled', () => {
    vi.mocked(store.get).mockReturnValue(true);
    openAtLogin({ mainWindow: null });
    expect(AutoLaunch).toHaveBeenCalled();
  });

  it('hides window when launched with --hidden flag', () => {
    vi.mocked(app.commandLine.hasSwitch).mockReturnValue(true);
    const fakeWindow = { hide: vi.fn() };
    vi.mocked(store.get).mockReturnValue(true);

    openAtLogin({ mainWindow: fakeWindow as any });
    expect(fakeWindow.hide).toHaveBeenCalled();
  });
});
