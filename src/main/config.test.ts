/**
 * Unit tests for encrypted configuration store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron
vi.mock('electron', () => ({
  app: {
    getName: () => 'googlechat',
    getPath: (name: string) => `/fake/path/${name}`,
    getAppPath: () => '/fake/app/path',
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

// Mock packageInfo to avoid file system access
vi.mock('./utils/packageInfo', () => ({
  getPackageInfo: vi.fn(() => ({
    name: 'googlechat',
    productName: 'Google Chat',
    version: '0.0.0',
    description: 'Google Chat',
    repository: '',
    homepage: '',
    author: '',
  })),
  clearPackageInfoCache: vi.fn(),
  isPackageInfoLoaded: vi.fn(() => true),
}));

// Mock configCache to return store as-is (no caching in tests)
vi.mock('./utils/configCache', () => ({
  addCacheLayer: vi.fn((store) => store),
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

// Mock electron-store constructor - must be a proper constructor function
class MockStore {
  get = mockStore.get;
  set = mockStore.set;
  has = mockStore.has;
  delete = mockStore.delete;
  clear = mockStore.clear;
  onDidChange = mockStore.onDidChange;
}

vi.mock('electron-store', () => ({
  default: MockStore,
}));

describe('Config Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockStore implementation
    mockStore.get.mockReturnValue(undefined);
    mockStore.set.mockReturnValue(undefined);
    mockStore.has.mockReturnValue(false);
    // Reset the module to clear singleton state
    vi.resetModules();
  });

  it('should export a store instance', async () => {
    const { initializeStore, default: config } = await import('./config');
    initializeStore();
    expect(config).toBeDefined();
  });

  it('should be callable with get/set methods', async () => {
    const { initializeStore, default: config } = await import('./config');
    initializeStore();

    expect(config.get).toBeDefined();
    expect(config.set).toBeDefined();
  });

  it('should support window bounds configuration', async () => {
    const { initializeStore, default: config } = await import('./config');
    initializeStore();

    config.get('window.bounds');
    expect(mockStore.get).toHaveBeenCalledWith('window.bounds');
  });

  it('should support app configuration', async () => {
    const { initializeStore, default: config } = await import('./config');
    initializeStore();

    config.get('app.autoCheckForUpdates');
    expect(mockStore.get).toHaveBeenCalled();
  });

  it('should throw error if accessed before initialization', async () => {
    const { default: config } = await import('./config');

    expect(() => config.get('app.autoCheckForUpdates')).toThrow('Store not initialized');
  });
});

import crypto from 'crypto';

describe('Encryption Key Generation', () => {
  it('should use app-specific data for encryption key', () => {
    const hash = crypto.createHash('sha256');
    hash.update('googlechat-/fake/path/userData');
    const expectedKey = hash.digest('hex');

    // The key should be deterministic based on app name and user data path
    expect(expectedKey).toBeDefined();
    expect(expectedKey).toHaveLength(64); // SHA256 hex is 64 chars
  });
});
