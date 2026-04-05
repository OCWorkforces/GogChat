/**
 * Unit tests for bootstrapTracker — bootstrap window state management.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  markAsBootstrap,
  isBootstrap,
  promoteBootstrap,
  clearBootstrap,
  getBootstrapAccounts,
  clearAllBootstrap,
} from './bootstrapTracker';

describe('bootstrapTracker', () => {
  beforeEach(() => {
    clearAllBootstrap();
  });

  describe('markAsBootstrap', () => {
    it('marks an account as bootstrap', () => {
      markAsBootstrap(0);
      expect(isBootstrap(0)).toBe(true);
    });

    it('is idempotent — double mark does not throw', () => {
      markAsBootstrap(0);
      markAsBootstrap(0);
      expect(isBootstrap(0)).toBe(true);
    });

    it('supports multiple concurrent bootstrap accounts', () => {
      markAsBootstrap(0);
      markAsBootstrap(1);
      markAsBootstrap(2);
      expect(isBootstrap(0)).toBe(true);
      expect(isBootstrap(1)).toBe(true);
      expect(isBootstrap(2)).toBe(true);
    });
  });

  describe('isBootstrap', () => {
    it('returns false for an account that was never marked', () => {
      expect(isBootstrap(5)).toBe(false);
    });

    it('returns true after marking', () => {
      markAsBootstrap(3);
      expect(isBootstrap(3)).toBe(true);
    });
  });

  describe('promoteBootstrap', () => {
    it('returns true and clears the flag when the account was bootstrap', () => {
      markAsBootstrap(0);
      const result = promoteBootstrap(0);
      expect(result).toBe(true);
      expect(isBootstrap(0)).toBe(false);
    });

    it('returns false when the account was not bootstrap', () => {
      const result = promoteBootstrap(99);
      expect(result).toBe(false);
    });

    it('is idempotent — second promote returns false', () => {
      markAsBootstrap(1);
      expect(promoteBootstrap(1)).toBe(true);
      expect(promoteBootstrap(1)).toBe(false);
    });
  });

  describe('clearBootstrap', () => {
    it('clears the bootstrap flag for a marked account', () => {
      markAsBootstrap(2);
      clearBootstrap(2);
      expect(isBootstrap(2)).toBe(false);
    });

    it('does not throw for an account that was never marked', () => {
      expect(() => clearBootstrap(42)).not.toThrow();
    });
  });

  describe('getBootstrapAccounts', () => {
    it('returns empty array when nothing is marked', () => {
      expect(getBootstrapAccounts()).toEqual([]);
    });

    it('returns all marked account indices', () => {
      markAsBootstrap(0);
      markAsBootstrap(3);
      const accounts = getBootstrapAccounts();
      expect(accounts).toHaveLength(2);
      expect(accounts).toContain(0);
      expect(accounts).toContain(3);
    });

    it('excludes promoted accounts', () => {
      markAsBootstrap(0);
      markAsBootstrap(1);
      promoteBootstrap(0);
      expect(getBootstrapAccounts()).toEqual([1]);
    });
  });

  describe('clearAllBootstrap', () => {
    it('clears all bootstrap flags', () => {
      markAsBootstrap(0);
      markAsBootstrap(1);
      clearAllBootstrap();
      expect(getBootstrapAccounts()).toEqual([]);
      expect(isBootstrap(0)).toBe(false);
      expect(isBootstrap(1)).toBe(false);
    });

    it('is safe to call when empty', () => {
      expect(() => clearAllBootstrap()).not.toThrow();
    });
  });
});
