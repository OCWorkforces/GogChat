/**
 * Security-critical boolean flags persisted with authenticated encryption
 * via Electron `safeStorage` (macOS Keychain-backed).
 *
 * Why a dedicated helper?
 * -----------------------
 * The regular `electron-store` uses AES-CBC without a MAC. That is fine for
 * benign config (window bounds, feature toggles), but the
 * `disableCertPinning` flag is security-critical: if an attacker can flip it
 * to `true` by tampering with the encrypted config file on disk, certificate
 * pinning is silently disabled and MITM becomes possible.
 *
 * `safeStorage.encryptString()` provides authenticated encryption (the
 * payload is bound to the OS Keychain entry), so any tampering causes
 * decryption to fail and we fall back to the safest default (`false`).
 *
 * Storage location: `<userData>/secure-flags.enc` — a single encrypted JSON
 * blob. We intentionally do NOT mirror the value into electron-store after
 * reading, otherwise an attacker could simply edit the plaintext-MAC-less
 * mirror.
 *
 * Lifecycle: read/write are synchronous and may run before `app.ready` (the
 * cert-pinning kill switch is consulted in the `security` phase, before
 * `app.whenReady`). All filesystem operations are wrapped in try/catch and
 * default to `false` on any failure.
 */

import { safeStorage, app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';

const SECURE_FLAGS_FILE = 'secure-flags.enc';

interface SecureFlags {
  disableCertPinning?: boolean;
}

function getSecureFlagsPath(): string {
  return path.join(app.getPath('userData'), SECURE_FLAGS_FILE);
}

/**
 * Read and decrypt the secure flags blob.
 * Returns an empty object on any failure (missing file, decrypt failure,
 * malformed JSON, safeStorage unavailable).
 */
function readSecureFlags(): SecureFlags {
  try {
    const filePath = getSecureFlagsPath();
    if (!fs.existsSync(filePath)) {
      return {};
    }

    if (!safeStorage.isEncryptionAvailable()) {
      log.warn('[SecureFlags] safeStorage unavailable — refusing to read encrypted flags');
      return {};
    }

    const encrypted = fs.readFileSync(filePath);
    const plaintext = safeStorage.decryptString(encrypted);
    const parsed: unknown = JSON.parse(plaintext);

    if (parsed === null || typeof parsed !== 'object') {
      return {};
    }
    return parsed;
  } catch (error: unknown) {
    log.warn('[SecureFlags] Failed to read secure flags, defaulting to safe values:', error);
    return {};
  }
}

/**
 * Encrypt and persist the secure flags blob.
 * Throws if safeStorage is unavailable so callers learn that the value
 * could not be securely persisted.
 */
function writeSecureFlags(flags: SecureFlags): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('[SecureFlags] safeStorage unavailable — cannot persist secure flag');
  }

  const filePath = getSecureFlagsPath();
  const plaintext = JSON.stringify(flags);
  const encrypted = safeStorage.encryptString(plaintext);
  fs.writeFileSync(filePath, encrypted);
}

/**
 * Returns the persisted `disableCertPinning` flag.
 *
 * Defaults to `false` (the safe default — pinning enabled) on any error,
 * including missing file, decryption failure, or unavailable safeStorage.
 *
 * Safe to call before `app.whenReady` on macOS — `safeStorage` is queried
 * lazily and a missing file simply returns the default.
 */
export function getDisableCertPinning(): boolean {
  return readSecureFlags().disableCertPinning === true;
}

/**
 * Persist the `disableCertPinning` flag using authenticated encryption.
 * Throws if safeStorage is unavailable.
 */
export function setDisableCertPinning(value: boolean): void {
  const current = readSecureFlags();
  current.disableCertPinning = value;
  writeSecureFlags(current);
}
