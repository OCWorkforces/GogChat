/**
 * Unit tests for cspHeaderHandler — COEP/COOP/CSP header stripping.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getHostname, BENIGN_CSP_BLOCKED_HOSTS, installHeaderFix } from './cspHeaderHandler';

describe('cspHeaderHandler', () => {
  describe('getHostname', () => {
    it('extracts hostname from valid HTTPS URL', () => {
      expect(getHostname('https://accounts.google.com/path?q=1')).toBe('accounts.google.com');
    });

    it('extracts hostname from HTTP URL', () => {
      expect(getHostname('http://ogs.google.com')).toBe('ogs.google.com');
    });

    it('returns null for malformed URL', () => {
      expect(getHostname('not-a-url')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getHostname('')).toBeNull();
    });
  });

  describe('BENIGN_CSP_BLOCKED_HOSTS', () => {
    it('contains accounts.google.com', () => {
      expect(BENIGN_CSP_BLOCKED_HOSTS.has('accounts.google.com')).toBe(true);
    });

    it('contains ogs.google.com', () => {
      expect(BENIGN_CSP_BLOCKED_HOSTS.has('ogs.google.com')).toBe(true);
    });

    it('does not contain arbitrary hosts', () => {
      expect(BENIGN_CSP_BLOCKED_HOSTS.has('evil.com')).toBe(false);
    });
  });

  describe('installHeaderFix', () => {
    let mockCallback: Mock;
    let onHeadersReceived: Mock;
    let fakeWindow: { webContents: { session: { webRequest: { onHeadersReceived: Mock } } } };

    beforeEach(() => {
      mockCallback = vi.fn();
      onHeadersReceived = vi.fn();
      fakeWindow = {
        webContents: {
          session: {
            webRequest: { onHeadersReceived },
          },
        },
      };
    });

    function callHandler(details: { url: string; responseHeaders: Record<string, string[]> }) {
      // installHeaderFix registers the handler; invoke it
      installHeaderFix(fakeWindow as never);
      expect(onHeadersReceived).toHaveBeenCalledTimes(1);
      const handler = onHeadersReceived.mock.calls[0][1] as (
        details: unknown,
        callback: Mock
      ) => void;
      handler(details, mockCallback);
    }

    it('strips COEP/COOP headers (both cases) for any Google URL', () => {
      callHandler({
        url: 'https://mail.google.com/chat',
        responseHeaders: {
          'cross-origin-embedder-policy': ['require-corp'],
          'cross-origin-opener-policy': ['same-origin'],
          'Cross-Origin-Embedder-Policy': ['require-corp'],
          'Cross-Origin-Opener-Policy': ['same-origin'],
          'content-type': ['text/html'],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      expect(result).not.toHaveProperty('cross-origin-embedder-policy');
      expect(result).not.toHaveProperty('cross-origin-opener-policy');
      expect(result).not.toHaveProperty('Cross-Origin-Embedder-Policy');
      expect(result).not.toHaveProperty('Cross-Origin-Opener-Policy');
      expect(result).toHaveProperty('content-type');
    });

    it('strips frame-ancestors from CSP for benign host (accounts.google.com)', () => {
      callHandler({
        url: 'https://accounts.google.com/embedded',
        responseHeaders: {
          'content-security-policy': [
            "default-src 'self'; frame-ancestors https://studio.workspace.google.com; script-src 'self'",
          ],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      const csp = result['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp[0]).not.toContain('frame-ancestors');
      expect(csp[0]).toContain("default-src 'self'");
    });

    it('removes CSP header entirely when only frame-ancestors directive present', () => {
      callHandler({
        url: 'https://ogs.google.com/widget',
        responseHeaders: {
          'content-security-policy': ['frame-ancestors https://studio.workspace.google.com;'],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      expect(result).not.toHaveProperty('content-security-policy');
    });

    it('strips X-Frame-Options for benign hosts', () => {
      callHandler({
        url: 'https://accounts.google.com/embedded',
        responseHeaders: {
          'x-frame-options': ['DENY'],
          'X-Frame-Options': ['SAMEORIGIN'],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      expect(result).not.toHaveProperty('x-frame-options');
      expect(result).not.toHaveProperty('X-Frame-Options');
    });

    it('does NOT strip frame-ancestors for non-benign hosts', () => {
      callHandler({
        url: 'https://mail.google.com/chat',
        responseHeaders: {
          'content-security-policy': [
            "default-src 'self'; frame-ancestors 'none'; script-src 'self'",
          ],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      const csp = result['content-security-policy'];
      expect(csp[0]).toContain('frame-ancestors');
    });

    it('handles multiple CSP directives in array', () => {
      callHandler({
        url: 'https://accounts.google.com/embedded',
        responseHeaders: {
          'content-security-policy': [
            'frame-ancestors https://studio.workspace.google.com;',
            "default-src 'self'; frame-ancestors 'none'; img-src *",
          ],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      // First policy was only frame-ancestors, should be filtered out.
      // Second policy should have frame-ancestors stripped but rest kept.
      const csp = result['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toHaveLength(1);
      expect(csp[0]).toContain("default-src 'self'");
      expect(csp[0]).not.toContain('frame-ancestors');
    });

    it('handles headers with no CSP at all', () => {
      callHandler({
        url: 'https://accounts.google.com/path',
        responseHeaders: {
          'content-type': ['text/html'],
        },
      });

      const result = mockCallback.mock.calls[0][0].responseHeaders;
      expect(result).toHaveProperty('content-type');
    });

    it('handles malformed URL in details gracefully', () => {
      callHandler({
        url: 'not-a-valid-url',
        responseHeaders: {
          'content-security-policy': ["frame-ancestors 'self';"],
        },
      });

      // Should not strip CSP since hostname extraction fails (non-benign)
      const result = mockCallback.mock.calls[0][0].responseHeaders;
      expect(result['content-security-policy'][0]).toContain('frame-ancestors');
    });
  });
});
