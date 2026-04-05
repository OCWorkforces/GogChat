/**
 * Unit tests for windowDefaults — store-backed window configuration defaults.
 *
 * Covers: getWindowDefaults() with all boolean store keys.
 * Mocks: ../config.js (electron-store)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(),
}));

vi.mock('../config.js', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

import { getWindowDefaults, type WindowDefaults } from './windowDefaults';

describe('windowDefaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getWindowDefaults', () => {
    it('returns all false when store has default values', () => {
      mockGet.mockReturnValue(false);

      const result = getWindowDefaults();

      expect(result).toEqual({
        hideMenuBar: false,
        startHidden: false,
        disableSpellChecker: false,
      });
    });

    it('returns all true when store has all options enabled', () => {
      mockGet.mockReturnValue(true);

      const result = getWindowDefaults();

      expect(result).toEqual({
        hideMenuBar: true,
        startHidden: true,
        disableSpellChecker: true,
      });
    });

    it('reads hideMenuBar from store with correct key', () => {
      mockGet.mockImplementation((key: string) => key === 'app.hideMenuBar');

      const result = getWindowDefaults();

      expect(result.hideMenuBar).toBe(true);
      expect(result.startHidden).toBe(false);
      expect(result.disableSpellChecker).toBe(false);
    });

    it('reads startHidden from store with correct key', () => {
      mockGet.mockImplementation((key: string) => key === 'app.startHidden');

      const result = getWindowDefaults();

      expect(result.hideMenuBar).toBe(false);
      expect(result.startHidden).toBe(true);
      expect(result.disableSpellChecker).toBe(false);
    });

    it('reads disableSpellChecker from store with correct key', () => {
      mockGet.mockImplementation((key: string) => key === 'app.disableSpellChecker');

      const result = getWindowDefaults();

      expect(result.hideMenuBar).toBe(false);
      expect(result.startHidden).toBe(false);
      expect(result.disableSpellChecker).toBe(true);
    });

    it('calls store.get exactly 3 times', () => {
      mockGet.mockReturnValue(false);

      getWindowDefaults();

      expect(mockGet).toHaveBeenCalledTimes(3);
    });

    it('calls store.get with correct keys', () => {
      mockGet.mockReturnValue(false);

      getWindowDefaults();

      expect(mockGet).toHaveBeenCalledWith('app.hideMenuBar');
      expect(mockGet).toHaveBeenCalledWith('app.startHidden');
      expect(mockGet).toHaveBeenCalledWith('app.disableSpellChecker');
    });

    it('returns a plain object with correct shape', () => {
      mockGet.mockReturnValue(false);

      const result = getWindowDefaults();

      expect(Object.keys(result)).toHaveLength(3);
      expect(result).toHaveProperty('hideMenuBar');
      expect(result).toHaveProperty('startHidden');
      expect(result).toHaveProperty('disableSpellChecker');
    });

    it('returns correct types for each property', () => {
      mockGet.mockReturnValue(true);

      const result: WindowDefaults = getWindowDefaults();

      expect(typeof result.hideMenuBar).toBe('boolean');
      expect(typeof result.startHidden).toBe('boolean');
      expect(typeof result.disableSpellChecker).toBe('boolean');
    });

    it('returns fresh object on each call (no caching)', () => {
      mockGet.mockReturnValue(false);

      const first = getWindowDefaults();
      const second = getWindowDefaults();

      expect(first).not.toBe(second);
      expect(first).toEqual(second);
    });

    it('reflects store changes between calls', () => {
      mockGet.mockReturnValue(false);
      const first = getWindowDefaults();

      mockGet.mockReturnValue(true);
      const second = getWindowDefaults();

      expect(first.hideMenuBar).toBe(false);
      expect(second.hideMenuBar).toBe(true);
    });
  });
});
