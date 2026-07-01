/**
 * Tests for deep link URL extraction utilities
 */

import { describe, it, expect } from 'vitest';
import { extractDeepLinkFromArgv } from './deepLinkUtils.js';

describe('extractDeepLinkFromArgv', () => {
  it('returns null for empty argv', () => {
    expect(extractDeepLinkFromArgv([])).toBeNull();
  });

  it('returns null when no deep link present', () => {
    expect(extractDeepLinkFromArgv(['/path/to/app', '--flag'])).toBeNull();
  });

  it('extracts gogchat:// protocol URL', () => {
    const url = 'gogchat://chat/room/123';
    expect(extractDeepLinkFromArgv(['/app', url])).toBe(url);
  });

  it('extracts gogchat:// URL from middle of argv', () => {
    const url = 'gogchat://dm/user';
    expect(extractDeepLinkFromArgv(['/app', '--enable', url, '--flag'])).toBe(url);
  });

  it('ignores https://chat.google.com URLs from argv because Windows only owns gogchat protocol argv', () => {
    const url = 'https://chat.google.com/room/abc';
    expect(extractDeepLinkFromArgv(['/app', url])).toBeNull();
  });

  it('extracts gogchat:// when https://chat.google.com is also present', () => {
    const gogchatUrl = 'gogchat://room/1';
    const httpsUrl = 'https://chat.google.com/room/1';
    expect(extractDeepLinkFromArgv(['/app', httpsUrl, gogchatUrl])).toBe(gogchatUrl);
  });

  it('returns null for https URL that is not chat.google.com', () => {
    expect(extractDeepLinkFromArgv(['/app', 'https://example.com'])).toBeNull();
  });

  it('returns null for gogchat: without // prefix', () => {
    // gogchat: without // does not match startsWith('gogchat://')
    expect(extractDeepLinkFromArgv(['/app', 'gogchat:something'])).toBeNull();
  });
});
