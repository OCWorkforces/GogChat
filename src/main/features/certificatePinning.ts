/**
 * Certificate pinning for Google domains
 * Validates SSL certificates to prevent MITM attacks
 */

import type { Certificate } from 'electron';
import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';

/**
 * Google root certificate issuers we trust
 * These are the common certificate authorities used by Google
 */
const TRUSTED_GOOGLE_ISSUERS = [
  'Google Trust Services LLC',
  'GTS Root R1',
  'GTS Root R2',
  'GTS Root R3',
  'GTS Root R4',
  'GTS CA 1C3',
  'GTS CA 1D4',
  'GTS CA 1O1',
  'GlobalSign',
];

/**
 * Domains that should be pinned
 */
const PINNED_DOMAINS = [
  'google.com',
  'mail.google.com',
  'chat.google.com',
  'accounts.google.com',
  'googleapis.com',
  'gstatic.com',
  'googleusercontent.com',
];

/**
 * Check if hostname matches pinned domains
 */
function isPinnedDomain(hostname: string): boolean {
  return PINNED_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

/**
 * Verify certificate issuer for Google domains
 */
function verifyCertificateIssuer(cert: Certificate): boolean {
  const issuerName = cert.issuerName || cert.issuer;

  // Convert to string for comparison
  const issuerString = typeof issuerName === 'string' ? issuerName : issuerName.commonName || '';

  // Check if issuer matches any trusted Google CA
  const isTrusted = TRUSTED_GOOGLE_ISSUERS.some((trustedIssuer) =>
    issuerString.includes(trustedIssuer)
  );

  if (!isTrusted) {
    log.warn('[CertPinning] Certificate issuer not in trusted list:', issuerString);
  }

  return isTrusted;
}

/**
 * Verify certificate validity period
 */
function verifyCertificateValidity(cert: Certificate): boolean {
  const now = Date.now() / 1000; // Convert to seconds
  const validFrom = cert.validStart;
  const validTo = cert.validExpiry;

  if (now < validFrom) {
    log.warn('[CertPinning] Certificate not yet valid');
    return false;
  }

  if (now > validTo) {
    log.warn('[CertPinning] Certificate expired');
    return false;
  }

  return true;
}

// Store handler for cleanup
let certificateErrorHandler:
  | ((
      event: Electron.Event,
      webContents: Electron.WebContents,
      url: string,
      error: string,
      certificate: Electron.Certificate,
      callback: (isTrusted: boolean) => void
    ) => void)
  | null = null;

/**
 * Check if certificate pinning is disabled via config file
 * Uses direct file read since store may not be initialized yet (runs before app.ready)
 */
function isCertPinningDisabled(): boolean {
  try {
    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
      if ((raw?.app as Record<string, unknown>)?.disableCertPinning === true) {
        return true;
      }
    }
  } catch {
    // Can't read config, continue with pinning
  }
  return false;
}

/**
 * Initialize certificate pinning
 * Prevents MITM attacks on Google domains
 */
export default function setupCertificatePinning(): void {
  // Kill switch: check config before registering handler
  if (isCertPinningDisabled()) {
    log.warn(
      '[CertPinning] Certificate pinning is DISABLED via config — all Google domain certificates will be allowed'
    );
    return;
  }

  certificateErrorHandler = (event, _webContents, url, error, certificate, callback) => {
    // Prevent default behavior
    event.preventDefault();

    const hostname = new URL(url).hostname;

    // Only apply pinning to Google domains
    if (!isPinnedDomain(hostname)) {
      log.debug(`[CertPinning] Non-pinned domain, allowing: ${hostname}`);
      callback(true);
      return;
    }

    log.info(`[CertPinning] Validating certificate for: ${hostname}`);

    // Perform certificate validation
    const issuerValid = verifyCertificateIssuer(certificate);
    const validityValid = verifyCertificateValidity(certificate);

    if (issuerValid && validityValid) {
      log.info(`[CertPinning] Certificate valid for: ${hostname}`);
      callback(true);
    } else {
      log.error(`[CertPinning] Certificate validation failed for: ${hostname}`, {
        issuerValid,
        validityValid,
        issuer: certificate.issuerName || certificate.issuer,
        error,
      });
      callback(false);
    }
  };

  app.on('certificate-error', certificateErrorHandler);

  log.info('[CertPinning] Certificate pinning initialized for Google domains');
}

/**
 * Cleanup function for certificate pinning
 */
export function cleanupCertificatePinning(): void {
  try {
    log.debug('[CertPinning] Cleaning up certificate pinning handler');

    if (certificateErrorHandler) {
      app.removeListener('certificate-error', certificateErrorHandler);
      certificateErrorHandler = null;
    }

    log.info('[CertPinning] Certificate pinning cleaned up');
  } catch (error: unknown) {
    log.error('[CertPinning] Failed to cleanup certificate pinning:', error);
  }
}
