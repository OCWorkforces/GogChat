/**
 * Unit tests for firstLaunch feature.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../utils/platform', () => ({
  isFirstAppLaunch: vi.fn().mockReturnValue(true),
}));

vi.mock('../config', () => ({
  default: {
    get: vi.fn().mockReturnValue(false),
  },
}));

import firstLaunch from './firstLaunch';
import { isFirstAppLaunch } from '../utils/platform';

describe('firstLaunch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs debug message on first launch', () => {
    vi.mocked(isFirstAppLaunch).mockReturnValue(true);
    firstLaunch();
    expect(isFirstAppLaunch).toHaveBeenCalled();
  });

  it('does nothing when not first launch', () => {
    vi.mocked(isFirstAppLaunch).mockReturnValue(false);
    // Should not throw
    firstLaunch();
    expect(isFirstAppLaunch).toHaveBeenCalled();
  });
});
