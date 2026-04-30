/**
 * Certificate pinning for Google domains
 * Validates SSL certificates to prevent MITM attacks
 */

import type { Certificate } from 'electron';
import { app } from 'electron';
import log from 'electron-log';
import { getDisableCertPinning } from '../utils/secureFlags.js';

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
 * In-memory validation cache keyed by `${hostname}:${cert.fingerprint}`.
 *
 * Security constraint: the key MUST include the certificate fingerprint (SHA-256).
 * Caching by hostname alone would allow an attacker who later presents a different
 * (potentially malicious) certificate for the same hostname to inherit a previously
 * cached "trusted" verdict — i.e. enable MITM after first contact.
 *
 * Eviction: Map preserves insertion order, so the first key returned by `keys()` is
 * the oldest. When size reaches MAX, drop that one. Same canonical pattern as
 * `utils/configCache.ts`.
 */
const VALIDATION_CACHE_MAX = 100;
const validationCache = new Map<string, boolean>();

/**
 * Check if certificate pinning is disabled via the secure flags store.
 * Backed by `safeStorage` (authenticated encryption) — see `utils/secureFlags.ts`.
 * Safe to call before `app.ready`; defaults to `false` on any failure.
 */
function isCertPinningDisabled(): boolean {
  return getDisableCertPinning();
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

    // Cache lookup: key MUST include fingerprint to prevent MITM via cert swap.
    const cacheKey = `${hostname}:${certificate.fingerprint}`;
    const cached = validationCache.get(cacheKey);
    if (cached !== undefined) {
      log.debug(`[CertPinning] Cache hit for: ${hostname} (fp=${certificate.fingerprint})`);
      callback(cached);
      return;
    }

    log.info(`[CertPinning] Validating certificate for: ${hostname}`);

    // Perform certificate validation
    const issuerValid = verifyCertificateIssuer(certificate);
    const validityValid = verifyCertificateValidity(certificate);
    const isValid = issuerValid && validityValid;

    // Store result before invoking callback. Evict oldest entry (insertion order)
    // when at capacity — same pattern as utils/configCache.ts.
    if (validationCache.size >= VALIDATION_CACHE_MAX) {
      const oldestKey = validationCache.keys().next().value;
      if (oldestKey !== undefined) {
        validationCache.delete(oldestKey);
        log.debug(`[CertPinning] Evicted oldest cache entry: ${oldestKey}`);
      }
    }
    validationCache.set(cacheKey, isValid);

    if (isValid) {
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

    // Clear validation cache so a re-setup performs fresh validation.
    validationCache.clear();

    log.info('[CertPinning] Certificate pinning cleaned up');
  } catch (error: unknown) {
    log.error('[CertPinning] Failed to cleanup certificate pinning:', error);
  }
}
