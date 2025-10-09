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
  validateMessageType,
  validateConversationType,
  validateTimestamp,
  validateMessageData,
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

/**
 * Message Logging Validators Tests
 */

describe('validateMessageType', () => {
  it('should accept valid message types', () => {
    expect(validateMessageType('text')).toBe('text');
    expect(validateMessageType('image')).toBe('image');
    expect(validateMessageType('file')).toBe('file');
    expect(validateMessageType('reaction')).toBe('reaction');
    expect(validateMessageType('system')).toBe('system');
    expect(validateMessageType('unknown')).toBe('unknown');
  });

  it('should reject invalid message types', () => {
    expect(() => validateMessageType('invalid')).toThrow('Invalid message type: invalid');
    expect(() => validateMessageType('video')).toThrow('Invalid message type: video');
    expect(() => validateMessageType('')).toThrow('Invalid message type: ');
  });

  it('should reject non-string inputs', () => {
    expect(() => validateMessageType(null)).toThrow('Message type must be a string');
    expect(() => validateMessageType(undefined)).toThrow('Message type must be a string');
    expect(() => validateMessageType(123)).toThrow('Message type must be a string');
    expect(() => validateMessageType({})).toThrow('Message type must be a string');
  });
});

describe('validateConversationType', () => {
  it('should accept valid conversation types', () => {
    expect(validateConversationType('direct')).toBe('direct');
    expect(validateConversationType('group')).toBe('group');
    expect(validateConversationType('space')).toBe('space');
  });

  it('should reject invalid conversation types', () => {
    expect(() => validateConversationType('invalid')).toThrow('Invalid conversation type: invalid');
    expect(() => validateConversationType('channel')).toThrow('Invalid conversation type: channel');
    expect(() => validateConversationType('')).toThrow('Invalid conversation type: ');
  });

  it('should reject non-string inputs', () => {
    expect(() => validateConversationType(null)).toThrow('Conversation type must be a string');
    expect(() => validateConversationType(undefined)).toThrow('Conversation type must be a string');
    expect(() => validateConversationType(42)).toThrow('Conversation type must be a string');
  });
});

describe('validateTimestamp', () => {
  it('should accept valid ISO 8601 timestamps', () => {
    const now = new Date().toISOString();
    expect(validateTimestamp(now)).toBe(now);

    const past = new Date('2024-01-01T00:00:00.000Z').toISOString();
    expect(validateTimestamp(past)).toBe(past);

    const future = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour from now
    expect(validateTimestamp(future)).toBe(future);
  });

  it('should accept timestamps with milliseconds', () => {
    const timestamp = '2024-12-25T12:30:45.123Z';
    expect(validateTimestamp(timestamp)).toBe(timestamp);
  });

  it('should reject timestamps too far in the future', () => {
    const farFuture = new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => validateTimestamp(farFuture)).toThrow('Timestamp is too far in the future');
  });

  it('should reject timestamps too far in the past', () => {
    const farPast = new Date(Date.now() - 11 * 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(() => validateTimestamp(farPast)).toThrow('Timestamp is too far in the past');
  });

  it('should reject invalid timestamp formats', () => {
    expect(() => validateTimestamp('invalid')).toThrow('Invalid timestamp format');
    expect(() => validateTimestamp('2024-13-45')).toThrow('Invalid timestamp format');
    expect(() => validateTimestamp('not-a-date')).toThrow('Invalid timestamp format');
  });

  it('should reject non-string inputs', () => {
    expect(() => validateTimestamp(null)).toThrow('Timestamp must be a string');
    expect(() => validateTimestamp(undefined)).toThrow('Timestamp must be a string');
    expect(() => validateTimestamp(1234567890)).toThrow('Timestamp must be a string');
  });

  it('should accept timestamps within 10 year range', () => {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000 - 1000).toISOString();

    expect(validateTimestamp(oneYearAgo)).toBe(oneYearAgo);
    expect(validateTimestamp(oneYearFromNow)).toBe(oneYearFromNow);
  });
});

describe('validateMessageData', () => {
  const validMessageData = {
    messageId: 'msg-123',
    content: 'Hello, world!',
    sender: 'John Doe',
    timestamp: new Date().toISOString(),
    conversationId: 'conv-456',
    conversationName: 'Team Chat',
    conversationType: 'group' as const,
    messageType: 'text' as const,
    isOutgoing: false,
  };

  it('should accept valid message data', () => {
    const result = validateMessageData(validMessageData);
    expect(result.messageId).toBe('msg-123');
    expect(result.sender).toBe('John Doe');
    expect(result.messageType).toBe('text');
    expect(result.conversationType).toBe('group');
    expect(result.isOutgoing).toBe(false);
  });

  it('should sanitize HTML in content', () => {
    const data = {
      ...validMessageData,
      content: '<script>alert("XSS")</script>',
    };
    const result = validateMessageData(data);
    expect(result.content).not.toContain('<script>');
    expect(result.content).toContain('&lt;script&gt;');
  });

  it('should sanitize HTML in sender name', () => {
    const data = {
      ...validMessageData,
      sender: '<b>Evil User</b>',
    };
    const result = validateMessageData(data);
    expect(result.sender).not.toContain('<b>');
    expect(result.sender).toContain('&lt;b&gt;');
  });

  it('should sanitize HTML in conversation name', () => {
    const data = {
      ...validMessageData,
      conversationName: '<img src=x onerror=alert(1)>',
    };
    const result = validateMessageData(data);
    expect(result.conversationName).not.toContain('<img');
    expect(result.conversationName).toContain('&lt;img');
  });

  it('should reject message data that is not an object', () => {
    expect(() => validateMessageData(null)).toThrow('Message data must be a plain object');
    expect(() => validateMessageData([])).toThrow('Message data must be a plain object');
    expect(() => validateMessageData('string')).toThrow('Message data must be a plain object');
  });

  it('should reject missing required fields', () => {
    const incomplete = { messageId: 'msg-123' };
    expect(() => validateMessageData(incomplete)).toThrow();
  });

  it('should enforce content size limit', () => {
    const data = {
      ...validMessageData,
      content: 'x'.repeat(60000), // Exceeds 50KB limit
    };
    expect(() => validateMessageData(data)).toThrow('String exceeds maximum length');
  });

  it('should accept content at size limit', () => {
    const data = {
      ...validMessageData,
      content: 'x'.repeat(49999), // Just under 50KB limit
    };
    const result = validateMessageData(data);
    expect(result.content.length).toBe(49999);
  });

  it('should handle optional fields', () => {
    const dataWithOptional = {
      ...validMessageData,
      receiverName: 'Jane Doe',
      participants: ['John', 'Jane', 'Bob'],
      attachmentUrl: 'https://example.com/file.pdf',
      attachmentName: 'document.pdf',
      reactionType: '👍',
    };

    const result = validateMessageData(dataWithOptional);
    expect(result.receiverName).toBe('Jane Doe');
    expect(result.participants).toEqual(['John', 'Jane', 'Bob']);
    expect(result.attachmentUrl).toBe('https://example.com/file.pdf');
    expect(result.attachmentName).toBe('document.pdf');
    expect(result.reactionType).toBe('👍');
  });

  it('should sanitize participant names', () => {
    const data = {
      ...validMessageData,
      participants: ['<script>alert(1)</script>', 'Normal User'],
    };
    const result = validateMessageData(data);
    expect(result.participants?.[0]).toContain('&lt;script&gt;');
    expect(result.participants?.[1]).toBe('Normal User');
  });

  it('should validate attachment URLs', () => {
    const data = {
      ...validMessageData,
      attachmentUrl: 'javascript:alert(1)',
    };
    expect(() => validateMessageData(data)).toThrow('Unsafe protocol');
  });

  it('should reject invalid participants array', () => {
    const data = {
      ...validMessageData,
      participants: 'not an array',
    };
    expect(() => validateMessageData(data)).toThrow('Participants must be an array');
  });

  it('should reject invalid message type in data', () => {
    const data = {
      ...validMessageData,
      messageType: 'invalid',
    };
    expect(() => validateMessageData(data)).toThrow('Invalid message type');
  });

  it('should reject invalid conversation type in data', () => {
    const data = {
      ...validMessageData,
      conversationType: 'invalid',
    };
    expect(() => validateMessageData(data)).toThrow('Invalid conversation type');
  });

  it('should reject invalid timestamp in data', () => {
    const data = {
      ...validMessageData,
      timestamp: 'not-a-timestamp',
    };
    expect(() => validateMessageData(data)).toThrow('Invalid timestamp format');
  });

  it('should handle all message types', () => {
    const types: Array<'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown'> = [
      'text',
      'image',
      'file',
      'reaction',
      'system',
      'unknown',
    ];

    types.forEach((type) => {
      const data = {
        ...validMessageData,
        messageType: type,
      };
      const result = validateMessageData(data);
      expect(result.messageType).toBe(type);
    });
  });

  it('should handle all conversation types', () => {
    const types: Array<'direct' | 'group' | 'space'> = ['direct', 'group', 'space'];

    types.forEach((type) => {
      const data = {
        ...validMessageData,
        conversationType: type,
      };
      const result = validateMessageData(data);
      expect(result.conversationType).toBe(type);
    });
  });

  it('should handle isOutgoing boolean conversion', () => {
    const data1 = { ...validMessageData, isOutgoing: true };
    expect(validateMessageData(data1).isOutgoing).toBe(true);

    const data2 = { ...validMessageData, isOutgoing: false };
    expect(validateMessageData(data2).isOutgoing).toBe(false);

    const data3 = { ...validMessageData, isOutgoing: 1 as unknown as boolean };
    expect(validateMessageData(data3).isOutgoing).toBe(true);

    const data4 = { ...validMessageData, isOutgoing: 0 as unknown as boolean };
    expect(validateMessageData(data4).isOutgoing).toBe(false);
  });
});
