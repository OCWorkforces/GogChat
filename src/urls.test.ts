/**
 * Unit tests for URL constants
 */

import { describe, it, expect } from 'vitest';
import urls from './urls';

describe('URLs', () => {
  it('should export appUrl', () => {
    expect(urls.appUrl).toBe('https://mail.google.com/chat/u/0');
  });

  it('should export logoutUrl with correct format', () => {
    expect(urls.logoutUrl).toContain('https://www.google.com/accounts/Logout');
    expect(urls.logoutUrl).toContain('continue=');
    expect(urls.logoutUrl).toContain(urls.appUrl);
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(urls)).toBe(true);
  });

  it('should not allow modifications', () => {
    expect(() => {
      (urls as any).appUrl = 'https://evil.com';
    }).toThrow();
  });

  it('should have valid HTTPS URLs', () => {
    expect(urls.appUrl).toMatch(/^https:\/\//);
    expect(urls.logoutUrl).toMatch(/^https:\/\//);
  });
});
