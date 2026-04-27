/**
 * Unit tests for secureFlags helper — safeStorage-backed `disableCertPinning`.
 *
 * Covers:
 * - getDisableCertPinning() returns false when file missing
 * - getDisableCertPinning() returns false when safeStorage unavailable
 * - getDisableCertPinning() returns false when decrypt throws
 * - getDisableCertPinning() returns false when payload is malformed JSON
 * - getDisableCertPinning() returns the persisted boolean after a write
 * - setDisableCertPinning() throws when safeStorage unavailable
 * - setDisableCertPinning() round-trips correctly via the encrypted file
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFiles = new Map<string, Buffer>();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/fake/userData'),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace(/^enc:/, '')),
  },
}));

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => mockFiles.has(p)),
  readFileSync: vi.fn((p: string) => {
    const buf = mockFiles.get(p);
    if (!buf) throw new Error(`ENOENT: ${p}`);
    return buf;
  }),
  writeFileSync: vi.fn((p: string, data: Buffer) => {
    mockFiles.set(p, data);
  }),
}));

describe('secureFlags', () => {
  beforeEach(() => {
    vi.resetModules();
    mockFiles.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getDisableCertPinning', () => {
    it('returns false when the secure-flags file does not exist', async () => {
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns false when safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      // Pre-seed a file but mark safeStorage unavailable
      mockFiles.set(
        '/fake/userData/secure-flags.enc',
        Buffer.from('enc:{"disableCertPinning":true}')
      );
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns false when decryption throws', async () => {
      const { safeStorage } = await import('electron');
      mockFiles.set('/fake/userData/secure-flags.enc', Buffer.from('garbage'));
      vi.mocked(safeStorage.decryptString).mockImplementationOnce(() => {
        throw new Error('decrypt failed');
      });

      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns false when the decrypted payload is not valid JSON', async () => {
      mockFiles.set('/fake/userData/secure-flags.enc', Buffer.from('enc:not-json'));
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns false when the JSON payload is not an object', async () => {
      mockFiles.set('/fake/userData/secure-flags.enc', Buffer.from('enc:42'));
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns false when the flag is explicitly missing from the payload', async () => {
      mockFiles.set('/fake/userData/secure-flags.enc', Buffer.from('enc:{}'));
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });

    it('returns true only when the persisted flag is exactly boolean true', async () => {
      mockFiles.set(
        '/fake/userData/secure-flags.enc',
        Buffer.from('enc:{"disableCertPinning":true}')
      );
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(true);
    });

    it('returns false when the persisted flag is the string "true" (no coercion)', async () => {
      mockFiles.set(
        '/fake/userData/secure-flags.enc',
        Buffer.from('enc:{"disableCertPinning":"true"}')
      );
      const { getDisableCertPinning } = await import('./secureFlags.js');
      expect(getDisableCertPinning()).toBe(false);
    });
  });

  describe('setDisableCertPinning', () => {
    it('throws when safeStorage is unavailable', async () => {
      const { safeStorage } = await import('electron');
      vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false);

      const { setDisableCertPinning } = await import('./secureFlags.js');
      expect(() => setDisableCertPinning(true)).toThrow(/safeStorage unavailable/);
    });

    it('round-trips a true value through encrypted storage', async () => {
      const { setDisableCertPinning, getDisableCertPinning } = await import('./secureFlags.js');
      setDisableCertPinning(true);
      expect(getDisableCertPinning()).toBe(true);
    });

    it('round-trips a false value through encrypted storage', async () => {
      const { setDisableCertPinning, getDisableCertPinning } = await import('./secureFlags.js');
      setDisableCertPinning(true);
      setDisableCertPinning(false);
      expect(getDisableCertPinning()).toBe(false);
    });

    it('preserves other (future) flags when updating one key', async () => {
      // Pre-seed the file with an unrelated flag
      mockFiles.set(
        '/fake/userData/secure-flags.enc',
        Buffer.from('enc:{"futureFlag":"keep","disableCertPinning":false}')
      );

      const { setDisableCertPinning } = await import('./secureFlags.js');
      setDisableCertPinning(true);

      const stored = mockFiles.get('/fake/userData/secure-flags.enc');
      expect(stored).toBeDefined();
      const decoded = stored!.toString().replace(/^enc:/, '');
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      expect(parsed.futureFlag).toBe('keep');
      expect(parsed.disableCertPinning).toBe(true);
    });
  });
});
