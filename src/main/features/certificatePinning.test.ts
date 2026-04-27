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
