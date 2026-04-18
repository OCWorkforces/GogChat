import { describe, it, expect } from 'vitest';
import { commonValidators } from './ipcCommonValidators';

describe('commonValidators', () => {
  describe('isObject', () => {
    it('returns plain object', () => {
      const obj = { a: 1 };
      expect(commonValidators.isObject(obj)).toBe(obj);
    });

    it('throws on null', () => {
      expect(() => commonValidators.isObject(null)).toThrow('Expected object');
    });

    it('throws on undefined', () => {
      expect(() => commonValidators.isObject(undefined)).toThrow('Expected object');
    });

    it('returns array (arrays are objects in JS)', () => {
      const arr = [1, 2, 3];
      expect(commonValidators.isObject(arr)).toBe(arr);
    });

    it('throws on string', () => {
      expect(() => commonValidators.isObject('string')).toThrow('Expected object');
    });
  });

  describe('isString', () => {
    it('returns "hello"', () => {
      expect(commonValidators.isString('hello')).toBe('hello');
    });

    it('returns empty string', () => {
      expect(commonValidators.isString('')).toBe('');
    });

    it('throws on number', () => {
      expect(() => commonValidators.isString(123)).toThrow('Expected string');
    });

    it('throws on null', () => {
      expect(() => commonValidators.isString(null)).toThrow('Expected string');
    });

    it('throws on boolean', () => {
      expect(() => commonValidators.isString(true)).toThrow('Expected string');
    });
  });

  describe('isNumber', () => {
    it('returns 42', () => {
      expect(commonValidators.isNumber(42)).toBe(42);
    });

    it('returns 0', () => {
      expect(commonValidators.isNumber(0)).toBe(0);
    });

    it('returns -1', () => {
      expect(commonValidators.isNumber(-1)).toBe(-1);
    });

    it('throws on NaN', () => {
      expect(() => commonValidators.isNumber(NaN)).toThrow('Expected valid number');
    });

    it('throws on numeric string', () => {
      expect(() => commonValidators.isNumber('42')).toThrow('Expected valid number');
    });

    it('returns Infinity', () => {
      expect(commonValidators.isNumber(Infinity)).toBe(Infinity);
    });

    it('throws on null', () => {
      expect(() => commonValidators.isNumber(null)).toThrow('Expected valid number');
    });
  });

  describe('isBoolean', () => {
    it('returns true', () => {
      expect(commonValidators.isBoolean(true)).toBe(true);
    });

    it('returns false', () => {
      expect(commonValidators.isBoolean(false)).toBe(false);
    });

    it('throws on "true" string', () => {
      expect(() => commonValidators.isBoolean('true')).toThrow('Expected boolean');
    });

    it('throws on 1', () => {
      expect(() => commonValidators.isBoolean(1)).toThrow('Expected boolean');
    });

    it('throws on null', () => {
      expect(() => commonValidators.isBoolean(null)).toThrow('Expected boolean');
    });
  });

  describe('noData', () => {
    it('returns undefined for object input', () => {
      expect(commonValidators.noData({ foo: 'bar' })).toBeUndefined();
    });

    it('returns undefined for null', () => {
      expect(commonValidators.noData(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
      expect(commonValidators.noData(undefined)).toBeUndefined();
    });

    it('does not throw on any input', () => {
      expect(() => commonValidators.noData('anything')).not.toThrow();
      expect(() => commonValidators.noData(42)).not.toThrow();
      expect(() => commonValidators.noData([])).not.toThrow();
    });
  });
});
