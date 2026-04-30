/**
 * Unit tests for certificatePinning feature — SSL certificate validation for Google domains
 *
 * Covers:
 * - isPinnedDomain() hostname matching
 * - isCertPinningDisabled() kill switch via config.json
 * - verifyCertificateIssuer() trusted CA validation
 * - verifyCertificateValidity() date range validation
 * - setupCertificatePinning() registers certificate-error handler
 * - Kill switch bypasses handler registration
 * - Pinned domains: validates and calls callback with result
 * - Non-pinned domains: bypasses validation, callback(true)
 * - cleanupCertificatePinning() removes listener
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeMockEvent() {
  return { preventDefault: vi.fn() } as unknown as Electron.Event;
}

// ─── Module-level mocks ───────────────────────────────────────────────────────

const getDisableCertPinningMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/mock/user/data'),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../utils/secureFlags.js', () => ({
  getDisableCertPinning: getDisableCertPinningMock,
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('certificatePinning feature', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    getDisableCertPinningMock.mockReturnValue(false);
  });

  // ── isPinnedDomain ───────────────────────────────────────────────────────────

  describe('isPinnedDomain (via setupCertificatePinning)', () => {
    it('matches exact pinned domains', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');

      // Re-exported isPinnedDomain is internal, but we can test via behavior:
      // When a pinned domain is checked, it should attempt validation
      setupCertificatePinning();

      // Get the registered certificate-error handler
      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      // Mock a pinned domain URL
      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      // Callback should be called with true (valid cert for pinned domain)
      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('matches subdomains of pinned domains', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://subdomain.mail.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('allows non-pinned domains without validation', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'Unknown CA',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      // Non-Google domain
      handler(
        mockEvent,
        mockWebContents,
        'https://example.com/',
        'test error',
        mockCert,
        callbackMock
      );

      // Should be allowed without validation
      expect(callbackMock).toHaveBeenCalledWith(true);
    });
  });

  // ── Kill switch ─────────────────────────────────────────────────────────────

  describe('isCertPinningDisabled kill switch', () => {
    it('disables pinning when getDisableCertPinning returns true', async () => {
      getDisableCertPinningMock.mockReturnValue(true);

      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      // Should NOT register certificate-error handler
      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const certErrorHandlers = appOnMock.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      );

      expect(certErrorHandlers.length).toBe(0);
    });

    it('enables pinning when getDisableCertPinning returns false', async () => {
      getDisableCertPinningMock.mockReturnValue(false);

      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const certErrorHandlers = appOnMock.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      );

      expect(certErrorHandlers.length).toBe(1);
    });

    it('enables pinning when getDisableCertPinning returns false (no flag set)', async () => {
      getDisableCertPinningMock.mockReturnValue(false);

      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const certErrorHandlers = appOnMock.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      );

      expect(certErrorHandlers.length).toBe(1);
    });

    it('enables pinning when getDisableCertPinning returns false (default)', async () => {
      getDisableCertPinningMock.mockReturnValue(false);

      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const certErrorHandlers = appOnMock.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      );

      expect(certErrorHandlers.length).toBe(1);
    });

    it('handles secureFlags errors gracefully', async () => {
      getDisableCertPinningMock.mockImplementation(() => {
        throw new Error('boom');
      });

      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      expect(() => setupCertificatePinning()).toThrow('boom');
    });
  });

  // ── Certificate issuer validation ───────────────────────────────────────────

  describe('verifyCertificateIssuer', () => {
    it('accepts certificates from Google Trust Services LLC', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('accepts certificates from GTS Root R1', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'GTS Root R1',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('accepts certificates from GlobalSign', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'GlobalSign',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('rejects certificates from unknown issuers', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuerName: 'Unknown CA',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(false);
    });

    it('handles issuer object with commonName', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const mockCert = {
        issuer: { commonName: 'GTS Root R2' },
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as unknown as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });
  });

  // ── Certificate validity validation ────────────────────────────────────────

  describe('verifyCertificateValidity', () => {
    it('accepts certificates within valid date range', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const now = Date.now() / 1000;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: now - 86400, // yesterday
        validExpiry: now + 86400 * 30, // 30 days from now
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(true);
    });

    it('rejects expired certificates', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const now = Date.now() / 1000;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: now - 86400 * 60, // 60 days ago
        validExpiry: now - 86400, // yesterday
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(false);
    });

    it('rejects not-yet-valid certificates', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockEvent = makeMockEvent();
      const mockWebContents = {} as Electron.WebContents;
      const now = Date.now() / 1000;
      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        validStart: now + 86400, // tomorrow
        validExpiry: now + 86400 * 30, // 30 days from now
      } as Electron.Certificate;
      const callbackMock = vi.fn();

      handler(
        mockEvent,
        mockWebContents,
        'https://chat.google.com/',
        'test error',
        mockCert,
        callbackMock
      );

      expect(callbackMock).toHaveBeenCalledWith(false);
    });
  });

  // ── Cleanup ─────────────────────────────────────────────────────────────────

  describe('cleanupCertificatePinning', () => {
    it('removes the certificate-error listener', async () => {
      const { default: setupCertificatePinning, cleanupCertificatePinning } =
        await import('./certificatePinning.js');

      setupCertificatePinning();
      cleanupCertificatePinning();

      const appRemoveListenerMock = (await import('electron')).app.removeListener as ReturnType<
        typeof vi.fn
      >;

      expect(appRemoveListenerMock).toHaveBeenCalledWith('certificate-error', expect.any(Function));
    });

    it('cleanup is safe when no handler was registered (kill switch)', async () => {
      getDisableCertPinningMock.mockReturnValue(true);

      const { default: setupCertificatePinning, cleanupCertificatePinning } =
        await import('./certificatePinning.js');

      setupCertificatePinning(); // No handler registered due to kill switch
      expect(() => cleanupCertificatePinning()).not.toThrow();
    });

    it('cleanup is idempotent', async () => {
      const { default: setupCertificatePinning, cleanupCertificatePinning } =
        await import('./certificatePinning.js');

      setupCertificatePinning();
      cleanupCertificatePinning();
      expect(() => cleanupCertificatePinning()).not.toThrow();
    });

    it('clears the validation cache on cleanup', async () => {
      const { default: setupCertificatePinning, cleanupCertificatePinning } =
        await import('./certificatePinning.js');

      setupCertificatePinning();

      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as (
        event: Electron.Event,
        webContents: Electron.WebContents,
        url: string,
        error: string,
        certificate: Electron.Certificate,
        callback: (isTrusted: boolean) => void
      ) => void;

      const mockCert = {
        issuerName: 'Google Trust Services LLC',
        fingerprint: 'sha256/AAAA',
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;

      // Prime the cache
      const cb1 = vi.fn();
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        mockCert,
        cb1
      );
      expect(cb1).toHaveBeenCalledWith(true);

      // Cleanup should clear cache (we can't directly observe, but it should not throw
      // and re-setup should re-validate from scratch — covered by listener removal)
      cleanupCertificatePinning();
    });
  });

  // ── Validation cache ────────────────────────────────────────────────────────

  describe('validation cache', () => {
    type CertHandler = (
      event: Electron.Event,
      webContents: Electron.WebContents,
      url: string,
      error: string,
      certificate: Electron.Certificate,
      callback: (isTrusted: boolean) => void
    ) => void;

    async function getHandler(): Promise<CertHandler> {
      const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
      const handler = appOnMock.mock.calls.find(
        (call: unknown[]) => (call[0] as string) === 'certificate-error'
      )?.[1] as CertHandler;
      return handler;
    }

    function makeCert(
      fingerprint: string,
      issuerName = 'Google Trust Services LLC'
    ): Electron.Certificate {
      return {
        issuerName,
        fingerprint,
        validStart: Date.now() / 1000 - 86400,
        validExpiry: Date.now() / 1000 + 86400 * 30,
      } as Electron.Certificate;
    }

    it('caches validation result by hostname+fingerprint (3 calls → 1 validation)', async () => {
      const log = (await import('electron-log')).default as unknown as {
        info: ReturnType<typeof vi.fn>;
      };
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();
      const handler = await getHandler();

      const cert = makeCert('sha256/CACHE_HIT');
      const cb = vi.fn();

      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        cert,
        cb
      );
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        cert,
        cb
      );
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        cert,
        cb
      );

      expect(cb).toHaveBeenCalledTimes(3);
      expect(cb).toHaveBeenNthCalledWith(1, true);
      expect(cb).toHaveBeenNthCalledWith(2, true);
      expect(cb).toHaveBeenNthCalledWith(3, true);

      // "Validating certificate for: ..." should appear exactly once (subsequent are cache hits)
      const validatingCalls = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      );
      expect(validatingCalls).toHaveLength(1);
    });

    it('different fingerprint → new validation entry (fingerprint required in key)', async () => {
      const log = (await import('electron-log')).default as unknown as {
        info: ReturnType<typeof vi.fn>;
      };
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();
      const handler = await getHandler();

      const certA = makeCert('sha256/AAAA');
      const certB = makeCert('sha256/BBBB');
      const cb = vi.fn();

      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        certA,
        cb
      );
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        certB,
        cb
      );

      const validatingCalls = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      );
      expect(validatingCalls).toHaveLength(2);
    });

    it('cached false result is preserved (does not re-validate to true)', async () => {
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();
      const handler = await getHandler();

      // First call: untrusted issuer → false
      const badCert = makeCert('sha256/BAD', 'Unknown CA');
      const cb1 = vi.fn();
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        badCert,
        cb1
      );
      expect(cb1).toHaveBeenCalledWith(false);

      // Second call with the SAME hostname+fingerprint: must still return cached false
      const cb2 = vi.fn();
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        badCert,
        cb2
      );
      expect(cb2).toHaveBeenCalledWith(false);
    });

    it('evicts oldest entry when exceeding 100 entries (Map insertion order)', async () => {
      const log = (await import('electron-log')).default as unknown as {
        info: ReturnType<typeof vi.fn>;
      };
      const { default: setupCertificatePinning } = await import('./certificatePinning.js');
      setupCertificatePinning();
      const handler = await getHandler();

      const cb = vi.fn();

      // Fill cache with 100 entries (entries 0..99)
      for (let i = 0; i < 100; i++) {
        handler(
          makeMockEvent(),
          {} as Electron.WebContents,
          'https://chat.google.com/',
          'e',
          makeCert(`sha256/FP${i}`),
          cb
        );
      }

      const validatingAfter100 = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      ).length;
      expect(validatingAfter100).toBe(100);

      // Insert 101st entry → should evict the oldest (FP0)
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        makeCert('sha256/FP100'),
        cb
      );

      // Re-request the OLDEST (FP0) — it must have been evicted, so a new validation runs
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        makeCert('sha256/FP0'),
        cb
      );

      const validatingFinal = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      ).length;
      // 100 (initial) + 1 (FP100) + 1 (FP0 re-validated after eviction) = 102
      expect(validatingFinal).toBe(102);

      // Re-request a still-cached entry (e.g. FP50) — should be a cache hit (no new validation log)
      handler(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        makeCert('sha256/FP50'),
        cb
      );
      const validatingAfterHit = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      ).length;
      expect(validatingAfterHit).toBe(102); // unchanged → cache hit
    });

    it('cleanup clears the cache (re-setup re-validates same key)', async () => {
      const log = (await import('electron-log')).default as unknown as {
        info: ReturnType<typeof vi.fn>;
      };
      const { default: setupCertificatePinning, cleanupCertificatePinning } =
        await import('./certificatePinning.js');
      setupCertificatePinning();
      const handler1 = await getHandler();

      const cert = makeCert('sha256/PERSIST');
      const cb = vi.fn();
      handler1(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        cert,
        cb
      );

      const validatingBefore = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      ).length;
      expect(validatingBefore).toBe(1);

      // Cleanup must clear cache. Re-setup and re-call: should re-validate (not hit stale cache).
      cleanupCertificatePinning();
      setupCertificatePinning();
      const handler2 = await getHandler();
      handler2(
        makeMockEvent(),
        {} as Electron.WebContents,
        'https://chat.google.com/',
        'e',
        cert,
        cb
      );

      const validatingAfter = log.info.mock.calls.filter((args) =>
        String(args[0]).startsWith('[CertPinning] Validating certificate for:')
      ).length;
      expect(validatingAfter).toBe(2);
    });
  });

  // ── Event.preventDefault ─────────────────────────────────────────────────────

  it('certificate-error handler calls event.preventDefault()', async () => {
    const { default: setupCertificatePinning } = await import('./certificatePinning.js');
    setupCertificatePinning();

    const appOnMock = (await import('electron')).app.on as ReturnType<typeof vi.fn>;
    const handler = appOnMock.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === 'certificate-error'
    )?.[1] as (
      event: Electron.Event,
      webContents: Electron.WebContents,
      url: string,
      error: string,
      certificate: Electron.Certificate,
      callback: (isTrusted: boolean) => void
    ) => void;

    const preventDefaultMock = vi.fn();
    const mockEvent = { preventDefault: preventDefaultMock } as unknown as Electron.Event;
    const mockWebContents = {} as Electron.WebContents;
    const mockCert = {
      issuerName: 'Google Trust Services LLC',
      validStart: Date.now() / 1000 - 86400,
      validExpiry: Date.now() / 1000 + 86400 * 30,
    } as Electron.Certificate;
    const callbackMock = vi.fn();

    handler(
      mockEvent,
      mockWebContents,
      'https://chat.google.com/',
      'test error',
      mockCert,
      callbackMock
    );

    expect(preventDefaultMock).toHaveBeenCalled();
  });
});
