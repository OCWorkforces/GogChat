import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMock = {
  app: {
    userAgentFallback: '',
  },
};

vi.mock('electron', () => electronMock);

describe('User Agent', () => {
  beforeEach(() => {
    electronMock.app.userAgentFallback = '';
    vi.resetModules();
  });

  it('builds a reduced Chromium user agent for macOS', async () => {
    const { buildUserAgentString } = await import('./userAgent');

    expect(buildUserAgentString('132.0.6834.210')).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.6834.210 Safari/537.36'
    );
  });

  it('falls back to a safe placeholder version when chrome version is blank', async () => {
    const { buildUserAgentString } = await import('./userAgent');

    expect(buildUserAgentString('')).toContain('Chrome/0.0.0.0');
  });

  it('sets the app-wide user agent fallback', async () => {
    const userAgent = await import('./userAgent');

    userAgent.default();

    expect(electronMock.app.userAgentFallback).toBe(userAgent.userAgentString);
    expect(electronMock.app.userAgentFallback).toContain('Chrome/');
    expect(electronMock.app.userAgentFallback).not.toContain('Firefox/');
    expect(electronMock.app.userAgentFallback).not.toContain('Electron/');
  });
});
