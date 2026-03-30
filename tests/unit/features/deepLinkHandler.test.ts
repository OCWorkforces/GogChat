/**
 * Deep Link Handler Feature Unit Tests
 * Tests deep link extraction and cleanup with mocked Electron APIs
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { electronMock } from '../../mocks/electron';

// Mock Electron module
vi.mock('electron', () => electronMock);

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { extractDeepLinkFromArgv } from '../../../src/main/utils/deepLinkUtils';
import { cleanupDeepLinkHandler } from '../../../src/main/features/deepLinkHandler';

describe('extractDeepLinkFromArgv', () => {
  it('should extract gogchat:// URL from argv', () => {
    const argv = ['/path/to/electron', '--some-flag', 'gogchat://room/AAAA9BixgjY/EypiKwiqrS0?cls=10'];
    const result = extractDeepLinkFromArgv(argv);
    expect(result).toBe('gogchat://room/AAAA9BixgjY/EypiKwiqrS0?cls=10');
  });

  it('should return null when no deep link is present', () => {
    const argv = ['/path/to/electron', '--some-flag', '/path/to/app'];
    const result = extractDeepLinkFromArgv(argv);
    expect(result).toBeNull();
  });

  it('should return null for empty argv', () => {
    const result = extractDeepLinkFromArgv([]);
    expect(result).toBeNull();
  });

  it('should return the first gogchat:// URL if multiple exist', () => {
    const argv = [
      '/path/to/electron',
      'gogchat://room/first',
      'gogchat://room/second',
    ];
    const result = extractDeepLinkFromArgv(argv);
    expect(result).toBe('gogchat://room/first');
  });
});

describe('cleanupDeepLinkHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete without error', () => {
    expect(() => cleanupDeepLinkHandler()).not.toThrow();
  });
});
