/**
 * Unit tests for appUpdates feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-update-notifier', () => ({
  setUpdateNotification: vi.fn(),
  checkForUpdates: vi.fn(),
}));

vi.mock('../config', () => ({
  default: {
    get: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../utils/resourceCleanup', () => ({
  createTrackedTimeout: vi.fn(),
  createTrackedInterval: vi.fn().mockReturnValue(42),
}));

import appUpdates from './appUpdates';
import store from '../config';
import { setUpdateNotification, checkForUpdates } from 'electron-update-notifier';
import { createTrackedTimeout, createTrackedInterval } from '../utils/resourceCleanup';

describe('appUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets up initial update check timeout', () => {
    appUpdates();
    expect(createTrackedTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      5000,
      'appUpdates-initial-check'
    );
  });

  it('sets up daily interval for periodic updates', () => {
    appUpdates();
    expect(createTrackedInterval).toHaveBeenCalledWith(
      expect.any(Function),
      1000 * 60 * 60 * 24,
      'appUpdates-daily-check'
    );
  });

  it('does not call update functions when auto-check is disabled', () => {
    vi.mocked(store.get).mockReturnValue(false);
    vi.mocked(createTrackedTimeout).mockImplementation((fn: () => void) => fn());
    vi.mocked(createTrackedInterval).mockImplementation((fn: () => void) => fn());

    appUpdates();

    expect(setUpdateNotification).not.toHaveBeenCalled();
    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it('calls setUpdateNotification and checkForUpdates when auto-check is enabled', () => {
    vi.mocked(store.get).mockReturnValue(true);
    vi.mocked(createTrackedTimeout).mockImplementation((fn: () => void) => fn());
    vi.mocked(createTrackedInterval).mockImplementation((fn: () => void) => fn());

    appUpdates();

    expect(setUpdateNotification).toHaveBeenCalled();
    expect(checkForUpdates).toHaveBeenCalled();
  });

  it('clears previous interval on re-init', () => {
    vi.mocked(store.get).mockReturnValue(true);
    appUpdates();
    appUpdates();
    expect(createTrackedInterval).toHaveBeenCalledTimes(2);
  });
});
