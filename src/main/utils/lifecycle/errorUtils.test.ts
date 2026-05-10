/**
 * Unit tests for errorUtils — pure error utility functions
 *
 * Covers: toErrorMessage, toError, isError with comprehensive input types.
 * These are pure functions with zero project dependencies.
 */

import { describe, it, expect } from 'vitest';
import { toErrorMessage, toError, isError } from './errorUtils';

describe('errorUtils', () => {
  // ========================================================================
  // toErrorMessage
  // ========================================================================

  describe('toErrorMessage', () => {
    it('returns error.message for Error instances', () => {
      expect(toErrorMessage(new Error('test error'))).toBe('test error');
    });

    it('returns error.message for Error subclasses', () => {
      expect(toErrorMessage(new TypeError('type err'))).toBe('type err');
      expect(toErrorMessage(new RangeError('range err'))).toBe('range err');
    });

    it('returns string as-is for string errors', () => {
      expect(toErrorMessage('just a string')).toBe('just a string');
      expect(toErrorMessage('')).toBe('');
    });

    it('converts numbers via String()', () => {
      expect(toErrorMessage(42)).toBe('42');
      expect(toErrorMessage(0)).toBe('0');
      expect(toErrorMessage(NaN)).toBe('NaN');
      expect(toErrorMessage(Infinity)).toBe('Infinity');
    });

    it('converts null and undefined via String()', () => {
      expect(toErrorMessage(null)).toBe('null');
      expect(toErrorMessage(undefined)).toBe('undefined');
    });

    it('converts booleans via String()', () => {
      expect(toErrorMessage(true)).toBe('true');
      expect(toErrorMessage(false)).toBe('false');
    });

    it('converts objects with message property via String()', () => {
      expect(toErrorMessage({ message: 'custom' })).toBe('[object Object]');
    });

    it('converts plain objects via String()', () => {
      expect(toErrorMessage({})).toBe('[object Object]');
      expect(toErrorMessage({ code: 'ERR' })).toBe('[object Object]');
    });

    it('converts symbols via String()', () => {
      expect(toErrorMessage(Symbol('test'))).toBe('Symbol(test)');
      expect(toErrorMessage(Symbol())).toBe('Symbol()');
    });

    it('converts bigint via String()', () => {
      expect(toErrorMessage(BigInt(123))).toBe('123');
    });

    it('uses custom toString() when available', () => {
      const obj = { toString: () => 'custom string' };
      expect(toErrorMessage(obj)).toBe('custom string');
    });
  });

  // ========================================================================
  // toError
  // ========================================================================

  describe('toError', () => {
    it('returns Error instance unchanged (same reference)', () => {
      const error = new Error('original');
      const result = toError(error);
      expect(result).toBe(error);
      expect(result).toBeInstanceOf(Error);
    });

    it('returns Error subclass instances unchanged', () => {
      const error = new TypeError('type error');
      const result = toError(error);
      expect(result).toBe(error);
      expect(result).toBeInstanceOf(TypeError);
    });

    it('wraps string into Error instance', () => {
      const result = toError('string error');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('wraps number into Error instance', () => {
      const result = toError(42);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('42');
    });

    it('wraps null into Error instance', () => {
      const result = toError(null);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('null');
    });

    it('wraps undefined into Error instance', () => {
      const result = toError(undefined);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('undefined');
    });

    it('wraps object into Error via toErrorMessage', () => {
      const result = toError({ message: 'custom' });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('[object Object]');
    });

    it('wraps symbol into Error instance', () => {
      const result = toError(Symbol('sym'));
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('Symbol(sym)');
    });
  });

  // ========================================================================
  // isError
  // ========================================================================

  describe('isError', () => {
    it('returns true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
    });

    it('returns true for Error subclasses', () => {
      expect(isError(new TypeError('type'))).toBe(true);
      expect(isError(new RangeError('range'))).toBe(true);
      expect(isError(new SyntaxError('syntax'))).toBe(true);
    });

    it('returns false for strings', () => {
      expect(isError('error string')).toBe(false);
      expect(isError('')).toBe(false);
    });

    it('returns false for numbers', () => {
      expect(isError(42)).toBe(false);
      expect(isError(0)).toBe(false);
    });

    it('returns false for null and undefined', () => {
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });

    it('returns false for objects with message property', () => {
      expect(isError({ message: 'not an error' })).toBe(false);
    });

    it('returns false for plain objects', () => {
      expect(isError({})).toBe(false);
    });

    it('returns false for booleans', () => {
      expect(isError(true)).toBe(false);
      expect(isError(false)).toBe(false);
    });

    it('returns false for symbols', () => {
      expect(isError(Symbol('test'))).toBe(false);
    });

    it('narrows type correctly (type guard)', () => {
      const value: unknown = new Error('typed');
      if (isError(value)) {
        // TypeScript should allow accessing .message here
        expect(value.message).toBe('typed');
      }
    });
  });
});
