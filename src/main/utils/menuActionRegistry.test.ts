/**
 * Unit tests for menuActionRegistry utility.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { registerMenuAction, getMenuAction, clearMenuActions } from './menuActionRegistry';
import type { MenuAction } from './menuActionRegistry';

describe('menuActionRegistry', () => {
  beforeEach(() => {
    clearMenuActions();
  });

  describe('registerMenuAction', () => {
    it('registers an action that can be retrieved by id', () => {
      const action: MenuAction = {
        label: 'Test Action',
        handler: () => 'executed',
      };

      registerMenuAction('testAction', action);

      const retrieved = getMenuAction('testAction');
      expect(retrieved).toBeDefined();
      expect(retrieved?.label).toBe('Test Action');
      expect(retrieved?.handler()).toBe('executed');
    });

    it('overwrites a previously registered action with the same id', () => {
      const action1: MenuAction = { label: 'First', handler: () => 1 };
      const action2: MenuAction = { label: 'Second', handler: () => 2 };

      registerMenuAction('myAction', action1);
      registerMenuAction('myAction', action2);

      const retrieved = getMenuAction('myAction');
      expect(retrieved?.label).toBe('Second');
      expect(retrieved?.handler()).toBe(2);
    });

    it('supports registering multiple distinct actions', () => {
      registerMenuAction('a', { label: 'Action A', handler: () => 'a' });
      registerMenuAction('b', { label: 'Action B', handler: () => 'b' });
      registerMenuAction('c', { label: 'Action C', handler: () => 'c' });

      expect(getMenuAction('a')?.label).toBe('Action A');
      expect(getMenuAction('b')?.label).toBe('Action B');
      expect(getMenuAction('c')?.label).toBe('Action C');
    });
  });

  describe('getMenuAction', () => {
    it('returns undefined for a non-existent id', () => {
      expect(getMenuAction('nonexistent')).toBeUndefined();
    });

    it('returns undefined after clearMenuActions is called', () => {
      registerMenuAction('toBeCleared', {
        label: 'Temp',
        handler: () => {},
      });
      expect(getMenuAction('toBeCleared')).toBeDefined();

      clearMenuActions();
      expect(getMenuAction('toBeCleared')).toBeUndefined();
    });
  });

  describe('clearMenuActions', () => {
    it('removes all registered actions', () => {
      registerMenuAction('x', { label: 'X', handler: () => {} });
      registerMenuAction('y', { label: 'Y', handler: () => {} });

      clearMenuActions();

      expect(getMenuAction('x')).toBeUndefined();
      expect(getMenuAction('y')).toBeUndefined();
    });

    it('is safe to call when no actions are registered', () => {
      expect(() => clearMenuActions()).not.toThrow();
    });

    it('is idempotent (double-call)', () => {
      registerMenuAction('z', { label: 'Z', handler: () => {} });
      clearMenuActions();
      clearMenuActions();
      expect(getMenuAction('z')).toBeUndefined();
    });
  });

  describe('action handler execution', () => {
    it('executes async handler correctly', async () => {
      const action: MenuAction = {
        label: 'Async',
        handler: async () => 'async-result',
      };

      registerMenuAction('asyncAction', action);
      const result = await getMenuAction('asyncAction')?.handler();
      expect(result).toBe('async-result');
    });

    it('passes arguments to handler', () => {
      const action: MenuAction = {
        label: 'WithArgs',
        handler: (a: number, b: number) => a + b,
      };

      registerMenuAction('argsAction', action);
      const result = getMenuAction('argsAction')?.handler(3, 7);
      expect(result).toBe(10);
    });
  });
});
