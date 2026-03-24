import { safeStorage, app } from 'electron';
import { createHash, randomBytes } from 'crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';

const ENCRYPTION_KEY_FILE = 'encryption-key.enc';

/**
 * Generate the legacy deterministic key (for backward compatibility)
 * This is used when SafeStorage is unavailable or during migration
 */
function getLegacyEncryptionKey(): string {
  const keyMaterial = `${app.getName()}-${app.getPath('userData')}`;
  return createHash('sha256').update(keyMaterial).digest('hex');
}

/**
 * Get or create an encryption key using safeStorage (macOS Keychain).
 *
 * - If SafeStorage is available and key file exists → decrypt and return stored key
 * - If SafeStorage is available, key file missing, but config exists → migration needed, return legacy key
 * - If SafeStorage is available, fresh install → generate random 256-bit key, encrypt with SafeStorage, store
 * - If SafeStorage is unavailable → return deterministic legacy key
 *
 * MUST be called AFTER app.whenReady() on macOS for correct Keychain entry naming.
 */
export function getOrCreateEncryptionKey(): string {
  // Try SafeStorage first (must be called after app.whenReady on macOS)
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return handleSafeStorageKey();
    } catch (error: unknown) {
      log.warn('[EncryptionKey] SafeStorage failed, falling back to deterministic key:', error);
    }
  } else {
    log.warn('[EncryptionKey] SafeStorage not available, using deterministic key');
  }

  // Fallback to deterministic key
  return getLegacyEncryptionKey();
}

/**
 * Handle SafeStorage key retrieval/generation
 * Assumes SafeStorage.isEncryptionAvailable() returned true
 */
function handleSafeStorageKey(): string {
  const keyFilePath = path.join(app.getPath('userData'), ENCRYPTION_KEY_FILE);

  // Check if encrypted key file exists
  if (fs.existsSync(keyFilePath)) {
    // Retrieve existing key
    const encrypted = fs.readFileSync(keyFilePath);
    const hexKey = safeStorage.decryptString(encrypted);
    log.info('[EncryptionKey] Retrieved encryption key from Keychain');
    return hexKey;
  }

  // No key file exists — check if we need to migrate from deterministic key
  // (config file exists but no encryption-key.enc means migration needed)
  const configPath = path.join(app.getPath('userData'), 'config.json');
  if (fs.existsSync(configPath)) {
    // Migration scenario: return legacy key, migration will be handled by completeMigration
    log.info('[EncryptionKey] Existing config detected, migration will be scheduled');
    return getLegacyEncryptionKey();
  }

  // Fresh install — generate new random key
  const newKey = randomBytes(32).toString('hex'); // 256-bit key as hex
  const encrypted = safeStorage.encryptString(newKey);
  fs.writeFileSync(keyFilePath, encrypted);
  log.info('[EncryptionKey] Generated new encryption key, stored in Keychain');
  return newKey;
}

/**
 * Check if migration from legacy deterministic key to SafeStorage is needed.
 * Returns true when:
 * - SafeStorage is available
 * - No key file exists
 * - Config file exists (indicating existing user data)
 */
export function needsMigration(): boolean {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }

  const keyFilePath = path.join(app.getPath('userData'), ENCRYPTION_KEY_FILE);
  return !fs.existsSync(keyFilePath);
}

/**
 * Complete migration from legacy deterministic key to SafeStorage-protected key.
 * This should be called AFTER opening the store with the legacy key and reading all data.
 * Returns the new encryption key, or null if migration cannot proceed.
 */
export function completeMigration(): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  const keyFilePath = path.join(app.getPath('userData'), ENCRYPTION_KEY_FILE);

  // If key file already exists, migration already done
  if (fs.existsSync(keyFilePath)) {
    return null;
  }

  // Generate new key and save using SafeStorage
  const newKey = randomBytes(32).toString('hex');
  const encrypted = safeStorage.encryptString(newKey);
  fs.writeFileSync(keyFilePath, encrypted);
  log.info('[EncryptionKey] Migration complete — new key stored in Keychain');
  return newKey;
}
