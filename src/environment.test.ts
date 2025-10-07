/**
 * Unit tests for environment configuration
 */

import { describe, it, expect, vi } from 'vitest';

// Mock electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}));

// Mock urls
vi.mock('./urls', () => ({
  default: {
    appUrl: 'https://mail.google.com/chat/u/0',
    logoutUrl: 'https://www.google.com/accounts/Logout?continue=https://mail.google.com/chat/u/0'
  }
}));

describe('Environment', () => {
  it('should export an object with isDev property', async () => {
    const environment = await import('./environment');
    expect(environment.default).toBeDefined();
    expect(environment.default).toHaveProperty('isDev');
  });

  it('should include URLs from urls module', async () => {
    const environment = await import('./environment');

    expect(environment.default.appUrl).toBe('https://mail.google.com/chat/u/0');
    expect(environment.default.logoutUrl).toBeDefined();
  });

  it('should be frozen (immutable)', async () => {
    const environment = await import('./environment');

    expect(Object.isFrozen(environment.default)).toBe(true);
  });

  it('should not allow modifications', async () => {
    const environment = await import('./environment');

    expect(() => {
      (environment.default as any).newProperty = 'value';
    }).toThrow();
  });

  it('should export all required properties', async () => {
    const environment = await import('./environment');

    expect(environment.default).toHaveProperty('isDev');
    expect(environment.default).toHaveProperty('appUrl');
    expect(environment.default).toHaveProperty('logoutUrl');
  });
});
