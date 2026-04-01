/**
 * Unit tests for encryption key management using SafeStorage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'node:path';

// Track file system mock state
let mockFiles: Map<string, Buffer> = new Map();
let mockFilePaths: Set<string> = new Set();

// Mock electron
vi.mock('electron', () => ({
  app: {
    getName: () => 'gogchat',
    getPath: (name: string) => {
      if (name === 'userData') return '/fake/path/userData';
      return `/fake/path/${name}`;
    },
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((str: string) => Buffer.from(`encrypted:${str}`)),
    decryptString: vi.fn((buffer: Buffer) => buffer.toString().replace('encrypted:', '')),
  },
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fs/promises module
vi.mock('node:fs/promises', () => ({
  access: vi.fn((filePath: string) => {
    if (mockFilePaths.has(filePath)) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(`ENOENT: no such file or directory, access '${filePath}'`));
  }),
  readFile: vi.fn((filePath: string) => {
    if (mockFiles.has(filePath)) {
      return Promise.resolve(mockFiles.get(filePath));
    }
    return Promise.reject(new Error(`File not found: ${filePath}`));
  }),
  writeFile: vi.fn((filePath: string, data: Buffer) => {
    mockFiles.set(filePath, data);
    mockFilePaths.add(filePath);
    return Promise.resolve();
  }),
}));

describe('Encryption Key Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
    mockFilePaths.clear();
  });

  describe('getOrCreateEncryptionKey', () => {
    it('should return legacy key when safeStorage is unavailable', async () => {
      const { getOrCreateEncryptionKey } = await import('./encryptionKey');

      const key = await getOrCreateEncryptionKey();

      // Should compute the legacy key: SHA256('gogchat-/fake/path/userData')
      expect(key).toBeDefined();
      expect(key).toHaveLength(64); // SHA256 hex is 64 chars
    });

    it('should return SafeStorage key when available and key file exists', async () => {
      // Setup: safeStorage is available
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const keyFilePath = path.join('/fake/path/userData', 'encryption-key.enc');
      const encryptedKey = Buffer.from('encrypted:supersecretkey123456789012345678901234567890');
      mockFiles.set(keyFilePath, encryptedKey);
      mockFilePaths.add(keyFilePath);

      const { getOrCreateEncryptionKey } = await import('./encryptionKey');

      const key = await getOrCreateEncryptionKey();

      // Should decrypt the stored key
      expect(key).toBe('supersecretkey123456789012345678901234567890');
    });

    it('should generate new key on fresh install when SafeStorage available', async () => {
      // Setup: safeStorage is available but no key file
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const { getOrCreateEncryptionKey } = await import('./encryptionKey');

      const key = await getOrCreateEncryptionKey();

      // Should generate a new 64-char hex key (256-bit)
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
      expect(safeStorage.encryptString).toHaveBeenCalledWith(key);
    });

    it('should return legacy key when config exists but no key file (migration scenario)', async () => {
      // Setup: safeStorage is available, config exists, but no key file
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const configPath = path.join('/fake/path/userData', 'config.json');
      mockFiles.set(configPath, Buffer.from('{}'));
      mockFilePaths.add(configPath);

      const { getOrCreateEncryptionKey } = await import('./encryptionKey');

      const key = await getOrCreateEncryptionKey();

      // Should return legacy key for migration
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
      // Should NOT have generated a new key yet
      expect(safeStorage.encryptString).not.toHaveBeenCalled();
    });
  });

  describe('needsMigration', () => {
    it('should return false when safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      const { needsMigration } = await import('./encryptionKey');

      expect(await needsMigration()).toBe(false);
    });

    it('should return false when key file exists', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const keyFilePath = path.join('/fake/path/userData', 'encryption-key.enc');
      mockFiles.set(keyFilePath, Buffer.from('encrypted:key'));
      mockFilePaths.add(keyFilePath);

      const { needsMigration } = await import('./encryptionKey');

      expect(await needsMigration()).toBe(false);
    });

    it('should return true when safeStorage available but no key file and config exists', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const configPath = path.join('/fake/path/userData', 'config.json');
      mockFiles.set(configPath, Buffer.from('{}'));
      mockFilePaths.add(configPath);

      const { needsMigration } = await import('./encryptionKey');

      expect(await needsMigration()).toBe(true);
    });
  });

  describe('completeMigration', () => {
    it('should return null when safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);

      const { completeMigration } = await import('./encryptionKey');

      const result = await completeMigration();
      expect(result).toBeNull();
    });

    it('should return null when key file already exists', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const keyFilePath = path.join('/fake/path/userData', 'encryption-key.enc');
      mockFiles.set(keyFilePath, Buffer.from('encrypted:existing'));
      mockFilePaths.add(keyFilePath);

      const { completeMigration } = await import('./encryptionKey');

      const result = await completeMigration();
      expect(result).toBeNull();
    });

    it('should generate and store new key when migration is needed', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);

      const { completeMigration } = await import('./encryptionKey');

      const result = await completeMigration();

      expect(result).toBeDefined();
      expect(result).toHaveLength(64); // New 256-bit key as hex
      expect(safeStorage.encryptString).toHaveBeenCalledWith(result);
    });
  });

  describe('Error handling', () => {
    it('should fall back to legacy key when SafeStorage decrypt fails', async () => {
      // Setup: safeStorage is available, key file exists, but decrypt fails
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true);
      vi.mocked(safeStorage.decryptString).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const keyFilePath = path.join('/fake/path/userData', 'encryption-key.enc');
      mockFiles.set(keyFilePath, Buffer.from('corrupted'));
      mockFilePaths.add(keyFilePath);

      const { getOrCreateEncryptionKey } = await import('./encryptionKey');

      const key = await getOrCreateEncryptionKey();

      // Should fall back to legacy key
      expect(key).toBeDefined();
      expect(key).toHaveLength(64);
    });
  });
});
