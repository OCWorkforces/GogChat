/**
 * Tests for Package Info Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'path';

// Mock Electron before importing packageInfo
vi.mock('electron', () => ({
  app: {
    getAppPath: () => path.join(__dirname, '../../..'),
    getName: () => 'gchat',
    getPath: (name: string) => `/fake/path/${name}`,
  },
}));

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getPackageInfo, clearPackageInfoCache, isPackageInfoLoaded } from './packageInfo';

describe('PackageInfo', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearPackageInfoCache();
  });

  describe('Lazy Loading', () => {
    it('should not be loaded initially', () => {
      clearPackageInfoCache();
      expect(isPackageInfoLoaded()).toBe(false);
    });

    it('should load on first access', () => {
      clearPackageInfoCache();
      getPackageInfo();
      expect(isPackageInfoLoaded()).toBe(true);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same object on multiple calls', () => {
      const pkg1 = getPackageInfo();
      const pkg2 = getPackageInfo();

      // Same reference (cached)
      expect(pkg1).toBe(pkg2);
    });

    it('should reload after cache clear', () => {
      const pkg1 = getPackageInfo();
      clearPackageInfoCache();
      const pkg2 = getPackageInfo();

      // Different reference after clear
      expect(pkg1).not.toBe(pkg2);
    });
  });

  describe('Package Data', () => {
    it('should have required fields', () => {
      const pkg = getPackageInfo();

      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('productName');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('description');
      expect(pkg).toHaveProperty('repository');
      expect(pkg).toHaveProperty('homepage');
      expect(pkg).toHaveProperty('author');
    });

    it('should have correct types', () => {
      const pkg = getPackageInfo();

      expect(typeof pkg.name).toBe('string');
      expect(typeof pkg.productName).toBe('string');
      expect(typeof pkg.version).toBe('string');
      expect(typeof pkg.description).toBe('string');
    });

    it('should load actual package.json data', () => {
      const pkg = getPackageInfo();

      // Verify it's loading real data, not fallback
      expect(pkg.name).toBe('gchat');
      expect(pkg.productName).toBe('Google Chat');
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/); // Semver format
    });
  });

  describe('Immutability', () => {
    it('should return frozen object', () => {
      const pkg = getPackageInfo();
      expect(Object.isFrozen(pkg)).toBe(true);
    });

    it('should prevent mutations', () => {
      const pkg = getPackageInfo();

      // Attempting to modify should not change the object
      expect(() => {
        // @ts-expect-error - Testing runtime immutability
        pkg.name = 'modified';
      }).toThrow();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache successfully', () => {
      getPackageInfo();
      expect(isPackageInfoLoaded()).toBe(true);

      clearPackageInfoCache();
      expect(isPackageInfoLoaded()).toBe(false);
    });
  });
});
