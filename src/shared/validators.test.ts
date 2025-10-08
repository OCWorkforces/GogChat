/**
 * Unit tests for input validators
 * Tests all validation functions for security and correctness
 */

import { describe, it, expect } from 'vitest';
import {
  validateUnreadCount,
  validateFaviconURL,
  validateExternalURL,
  validateBoolean,
  validateString,
  sanitizeHTML,
  isWhitelistedHost,
  isSafeObject,
} from './validators';

describe('validateUnreadCount', () => {
  it('should accept valid counts within range', () => {
    expect(validateUnreadCount(0)).toBe(0);
    expect(validateUnreadCount(1)).toBe(1);
    expect(validateUnreadCount(50)).toBe(50);
    expect(validateUnreadCount(9999)).toBe(9999);
  });

  it('should accept string numbers and convert to integers', () => {
    expect(validateUnreadCount('42')).toBe(42);
    expect(validateUnreadCount('0')).toBe(0);
    expect(validateUnreadCount('9999')).toBe(9999);
  });

  it('should floor decimal numbers', () => {
    expect(validateUnreadCount(42.7)).toBe(42);
    expect(validateUnreadCount(1.1)).toBe(1);
    expect(validateUnreadCount(99.99)).toBe(99);
  });

  it('should handle very large finite numbers within max', () => {
    expect(validateUnreadCount(9998.9)).toBe(9998);
    expect(validateUnreadCount(5000.5)).toBe(5000);
  });

  it('should reject negative numbers', () => {
    expect(() => validateUnreadCount(-1)).toThrow('Unread count cannot be negative');
    expect(() => validateUnreadCount(-100)).toThrow('Unread count cannot be negative');
  });

  it('should reject numbers above max count', () => {
    expect(() => validateUnreadCount(10000)).toThrow('Unread count exceeds maximum');
    expect(() => validateUnreadCount(99999)).toThrow('Unread count exceeds maximum');
  });

  it('should reject NaN', () => {
    expect(() => validateUnreadCount(NaN)).toThrow('Unread count is not a valid number');
    expect(() => validateUnreadCount('abc')).toThrow('Unread count is not a valid number');
  });

  it('should reject null and undefined', () => {
    expect(() => validateUnreadCount(null)).toThrow('Unread count must be a number or string');
    expect(() => validateUnreadCount(undefined)).toThrow('Unread count must be a number or string');
  });
});

describe('validateFaviconURL', () => {
  it('should accept valid HTTP URLs', () => {
    const url = 'http://example.com/favicon.ico';
    expect(validateFaviconURL(url)).toBe(url);
  });

  it('should accept valid HTTPS URLs', () => {
    const url = 'https://example.com/favicon.ico';
    expect(validateFaviconURL(url)).toBe(url);
  });

  it('should accept data URLs', () => {
    const url = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    expect(validateFaviconURL(url)).toBe(url);
  });

  it('should reject URLs with unsafe protocols', () => {
    expect(() => validateFaviconURL('javascript:alert(1)')).toThrow(
      'Favicon URL must use http, https, or data protocol'
    );
    expect(() => validateFaviconURL('file:///etc/passwd')).toThrow(
      'Favicon URL must use http, https, or data protocol'
    );
    expect(() => validateFaviconURL('vbscript:msgbox(1)')).toThrow(
      'Favicon URL must use http, https, or data protocol'
    );
  });

  it('should reject invalid URLs', () => {
    expect(() => validateFaviconURL('not a url')).toThrow('Invalid favicon URL format');
    expect(() => validateFaviconURL('')).toThrow('Favicon URL cannot be empty');
    expect(() => validateFaviconURL('    ')).toThrow('Favicon URL cannot be empty');
  });

  it('should reject non-string inputs', () => {
    expect(() => validateFaviconURL(null)).toThrow('Favicon URL must be a string');
    expect(() => validateFaviconURL(undefined)).toThrow('Favicon URL must be a string');
    expect(() => validateFaviconURL(123)).toThrow('Favicon URL must be a string');
  });

  it('should reject URLs exceeding max length', () => {
    const longURL = 'https://example.com/' + 'a'.repeat(5000);
    expect(() => validateFaviconURL(longURL)).toThrow('Favicon URL too long');
  });
});

describe('validateExternalURL', () => {
  it('should accept valid HTTP URLs', () => {
    const url = 'http://example.com/path';
    expect(validateExternalURL(url)).toBe(url);
  });

  it('should accept valid HTTPS URLs', () => {
    const url = 'https://example.com/path';
    expect(validateExternalURL(url)).toBe(url);
  });

  it('should strip credentials from URLs', () => {
    expect(validateExternalURL('https://user:pass@example.com/path')).toBe(
      'https://example.com/path'
    );
    expect(validateExternalURL('http://admin:secret@site.com')).toBe('http://site.com/');
  });

  it('should reject unsafe protocols', () => {
    expect(() => validateExternalURL('javascript:alert(1)')).toThrow('Unsafe protocol');
    expect(() => validateExternalURL('data:text/html,<script>alert(1)</script>')).toThrow(
      'Unsafe protocol'
    );
    expect(() => validateExternalURL('file:///etc/passwd')).toThrow('Unsafe protocol');
    expect(() => validateExternalURL('vbscript:msgbox(1)')).toThrow('Unsafe protocol');
  });

  it('should reject URLs containing dangerous patterns in path', () => {
    expect(() => validateExternalURL('https://example.com/javascript:alert(1)')).toThrow(
      'dangerous pattern'
    );
    expect(() => validateExternalURL('https://example.com/path?data:text')).toThrow(
      'dangerous pattern'
    );
    expect(() => validateExternalURL('https://example.com/vbscript:void')).toThrow(
      'dangerous pattern'
    );
    expect(() => validateExternalURL('https://example.com/file:///path')).toThrow(
      'dangerous pattern'
    );
    expect(() => validateExternalURL('https://example.com/about:blank')).toThrow(
      'dangerous pattern'
    );
  });

  it('should reject invalid URL formats', () => {
    expect(() => validateExternalURL('not a url')).toThrow('Invalid URL format');
    expect(() => validateExternalURL('')).toThrow('Invalid URL format');
    expect(() => validateExternalURL('ftp://example.com')).toThrow('Unsafe protocol');
  });

  it('should reject non-string inputs', () => {
    expect(() => validateExternalURL(null)).toThrow('URL must be a string');
    expect(() => validateExternalURL(undefined)).toThrow('URL must be a string');
    expect(() => validateExternalURL({})).toThrow('URL must be a string');
  });

  it('should handle URLs with query parameters', () => {
    const url = 'https://example.com/path?foo=bar&baz=qux';
    expect(validateExternalURL(url)).toBe(url);
  });

  it('should handle URLs with hash fragments', () => {
    const url = 'https://example.com/path#section';
    expect(validateExternalURL(url)).toBe(url);
  });

  it('should reject URLs exceeding max length', () => {
    const longURL = 'https://example.com/' + 'a'.repeat(5000);
    expect(() => validateExternalURL(longURL)).toThrow('URL too long');
  });
});

describe('validateBoolean', () => {
  it('should accept true', () => {
    expect(validateBoolean(true)).toBe(true);
  });

  it('should accept false', () => {
    expect(validateBoolean(false)).toBe(false);
  });

  it('should convert string "true" to boolean true', () => {
    expect(validateBoolean('true')).toBe(true);
  });

  it('should convert string "false" to boolean false', () => {
    expect(validateBoolean('false')).toBe(false);
  });

  it('should convert 1 to true and 0 to false', () => {
    expect(validateBoolean(1)).toBe(true);
    expect(validateBoolean(0)).toBe(false);
  });

  it('should reject other numbers', () => {
    expect(() => validateBoolean(42)).toThrow('Value is not a valid boolean');
    expect(() => validateBoolean(-1)).toThrow('Value is not a valid boolean');
    expect(() => validateBoolean(2)).toThrow('Value is not a valid boolean');
  });

  it('should reject null', () => {
    expect(() => validateBoolean(null)).toThrow('Value is not a valid boolean');
  });

  it('should reject undefined', () => {
    expect(() => validateBoolean(undefined)).toThrow('Value is not a valid boolean');
  });

  it('should reject objects', () => {
    expect(() => validateBoolean({})).toThrow('Value is not a valid boolean');
    expect(() => validateBoolean([])).toThrow('Value is not a valid boolean');
  });
});

describe('validateString', () => {
  it('should accept valid strings', () => {
    expect(validateString('hello')).toBe('hello');
    expect(validateString('test string')).toBe('test string');
    expect(validateString('123')).toBe('123');
  });

  it('should accept empty string', () => {
    expect(validateString('')).toBe('');
  });

  it('should not trim whitespace by default', () => {
    expect(validateString('  hello  ')).toBe('  hello  ');
    expect(validateString('\ttest\n')).toBe('\ttest\n');
  });

  it('should reject strings exceeding max length', () => {
    const longString = 'a'.repeat(2000);
    expect(() => validateString(longString)).toThrow('String exceeds maximum length');
  });

  it('should accept strings at max length', () => {
    const maxString = 'a'.repeat(1000);
    expect(validateString(maxString)).toBe(maxString);
  });

  it('should reject non-string inputs', () => {
    expect(() => validateString(null)).toThrow('Value must be a string');
    expect(() => validateString(undefined)).toThrow('Value must be a string');
    expect(() => validateString(123)).toThrow('Value must be a string');
    expect(() => validateString({})).toThrow('Value must be a string');
  });

  it('should handle custom max lengths', () => {
    expect(validateString('hello', 10)).toBe('hello');
    expect(() => validateString('hello world', 5)).toThrow('String exceeds maximum length');
  });
});

describe('sanitizeHTML', () => {
  it('should escape < and >', () => {
    expect(sanitizeHTML('<script>')).toBe('&lt;script&gt;');
    expect(sanitizeHTML('<div>')).toBe('&lt;div&gt;');
  });

  it('should escape & symbol', () => {
    expect(sanitizeHTML('Tom & Jerry')).toBe('Tom &amp; Jerry');
    expect(sanitizeHTML('&')).toBe('&amp;');
  });

  it('should escape quotes', () => {
    expect(sanitizeHTML('"hello"')).toBe('&quot;hello&quot;');
    expect(sanitizeHTML("'world'")).toBe('&#x27;world&#x27;');
  });

  it('should escape forward slashes', () => {
    expect(sanitizeHTML('</script>')).toBe('&lt;&#x2F;script&gt;');
  });

  it('should handle mixed content', () => {
    expect(sanitizeHTML('<a href="javascript:alert(\'XSS\')">Click</a>')).toBe(
      '&lt;a href=&quot;javascript:alert(&#x27;XSS&#x27;)&quot;&gt;Click&lt;&#x2F;a&gt;'
    );
  });

  it('should handle empty string', () => {
    expect(sanitizeHTML('')).toBe('');
  });

  it('should handle strings without special characters', () => {
    expect(sanitizeHTML('Hello World')).toBe('Hello World');
    expect(sanitizeHTML('12345')).toBe('12345');
  });

  it('should handle all HTML entities together', () => {
    expect(sanitizeHTML('<>&"\'/')).toBe('&lt;&gt;&amp;&quot;&#x27;&#x2F;');
  });
});

describe('isWhitelistedHost', () => {
  it('should return true for current host', () => {
    expect(isWhitelistedHost('https://example.com/path', 'example.com')).toBe(true);
  });

  it('should return true for whitelisted Google hosts', () => {
    expect(isWhitelistedHost('https://mail.google.com/chat', 'other.com')).toBe(true);
    expect(isWhitelistedHost('https://accounts.google.com/signin', 'other.com')).toBe(true);
  });

  it('should return false for non-whitelisted hosts', () => {
    expect(isWhitelistedHost('https://evil.com', 'example.com')).toBe(false);
  });

  it('should return false for invalid URLs', () => {
    expect(isWhitelistedHost('not a url', 'example.com')).toBe(false);
    expect(isWhitelistedHost('', 'example.com')).toBe(false);
  });
});

describe('isSafeObject', () => {
  it('should return true for plain objects', () => {
    expect(isSafeObject({})).toBe(true);
    expect(isSafeObject({ key: 'value' })).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSafeObject(null)).toBe(false);
  });

  it('should return false for arrays', () => {
    expect(isSafeObject([])).toBe(false);
    expect(isSafeObject([1, 2, 3])).toBe(false);
  });

  it('should return false for non-objects', () => {
    expect(isSafeObject('string')).toBe(false);
    expect(isSafeObject(123)).toBe(false);
    expect(isSafeObject(true)).toBe(false);
    expect(isSafeObject(undefined)).toBe(false);
  });

  it('should return false for objects with custom prototypes', () => {
    class CustomClass {}
    expect(isSafeObject(new CustomClass())).toBe(false);
  });
});

describe('Security integration tests', () => {
  it('should reject Infinity in unread count', () => {
    expect(() => validateUnreadCount(Infinity)).toThrow();
    expect(() => validateUnreadCount(-Infinity)).toThrow();
  });

  it('should protect against XSS in unread count', () => {
    expect(() => validateUnreadCount('<script>alert(1)</script>')).toThrow();
  });

  it('should protect against javascript: URLs in favicon', () => {
    expect(() => validateFaviconURL('javascript:void(0)')).toThrow(
      'Favicon URL must use http, https, or data protocol'
    );
  });

  it('should protect against credential theft in external URLs', () => {
    const result = validateExternalURL('https://user:pass@evil.com');
    expect(result).not.toContain('user');
    expect(result).not.toContain('pass');
  });

  it('should prevent HTML injection via sanitizeHTML', () => {
    const malicious = '<img src=x onerror=alert(1)>';
    const escaped = sanitizeHTML(malicious);
    expect(escaped).not.toContain('<img');
    expect(escaped).toContain('&lt;img');
    // The word 'onerror' will still be present but safe (no angle brackets)
    expect(escaped).not.toContain('<');
    expect(escaped).not.toContain('>');
  });
});
