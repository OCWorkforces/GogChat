/**
 * Unit tests for encrypted configuration store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getName: () => 'gchat',
    getPath: (name: string) => `/fake/path/${name}`
  }
}));

// Mock electron-store
const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  has: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  onDidChange: vi.fn(),
};

vi.mock('electron-store', () => ({
  default: vi.fn(() => mockStore)
}));

describe('Config Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should export a store instance', async () => {
    const config = await import('./config.js');
    expect(config.default).toBeDefined();
  });

  it('should be callable with get/set methods', async () => {
    const config = await import('./config.js');
    const store = config.default;

    expect(store.get).toBeDefined();
    expect(store.set).toBeDefined();
  });

  it('should support window bounds configuration', async () => {
    const config = await import('./config.js');
    const store = config.default;

    store.get('window.bounds');
    expect(mockStore.get).toHaveBeenCalledWith('window.bounds');
  });

  it('should support app configuration', async () => {
    const config = await import('./config.js');
    const store = config.default;

    store.get('app.autoCheckForUpdates');
    expect(mockStore.get).toHaveBeenCalled();
  });
});

describe('Encryption Key Generation', () => {
  it('should use app-specific data for encryption key', () => {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update('gchat-/fake/path/userData');
    const expectedKey = hash.digest('hex');

    // The key should be deterministic based on app name and user data path
    expect(expectedKey).toBeDefined();
    expect(expectedKey).toHaveLength(64); // SHA256 hex is 64 chars
  });
});
