/**
 * Unit tests for registerSecurityFeatures — security phase feature registration
 *
 * Covers: registerSecurityFeatures() registers certificatePinning (with cleanup, required),
 * reportExceptions (lazy, required), and mediaPermissions (lazy) via featureManager.registerAll().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ──────────────────────

const { mockSetupCertificatePinning, mockCleanupCertificatePinning, mockPerfMark } = vi.hoisted(
  () => ({
    mockSetupCertificatePinning: vi.fn(),
    mockCleanupCertificatePinning: vi.fn(),
    mockPerfMark: vi.fn(),
  })
);

vi.mock('../features/certificatePinning.js', () => ({
  default: mockSetupCertificatePinning,
  cleanupCertificatePinning: mockCleanupCertificatePinning,
}));

vi.mock('../utils/performanceMonitor.js', () => ({
  perfMonitor: {
    mark: mockPerfMark,
  },
}));

vi.mock('electron-unhandled', () => ({ default: vi.fn() }));
vi.mock('electron-log', () => ({ default: { error: vi.fn() } }));
vi.mock('../utils/featureTypes.js', () => ({
  createFeature: vi.fn(
    (
      name: string,
      priority: string,
      init: (...args: unknown[]) => void,
      options?: Record<string, unknown>
    ) => ({
      name,
      priority,
      init,
      ...options,
    })
  ),
  createLazyFeature: vi.fn(
    (
      name: string,
      priority: string,
      importFn: () => Promise<unknown>,
      options?: Record<string, unknown>
    ) => ({
      name,
      priority,
      lazy: true,
      init: importFn,
      ...options,
    })
  ),
}));

import { registerSecurityFeatures } from './registerSecurityFeatures';
import { createFeature, createLazyFeature } from '../utils/featureTypes.js';
import type { FeatureManager } from '../utils/featureManager.js';

describe('registerSecurityFeatures', () => {
  const mockFeatureManager = {
    registerAll: vi.fn(),
    register: vi.fn(),
  } as unknown as FeatureManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call featureManager.registerAll with an array of 3 features', () => {
    registerSecurityFeatures(mockFeatureManager);

    expect(mockFeatureManager.registerAll).toHaveBeenCalledTimes(1);
    const features = vi.mocked(mockFeatureManager.registerAll).mock.calls[0]![0];
    expect(features).toHaveLength(3);
  });

  describe('certificatePinning feature', () => {
    it('should register with createFeature, security phase, and required=true', () => {
      registerSecurityFeatures(mockFeatureManager);

      expect(createFeature).toHaveBeenCalledWith(
        'certificatePinning',
        'security',
        expect.any(Function),
        expect.objectContaining({
          cleanup: expect.any(Function),
          description: 'SSL certificate validation for Google domains',
          required: true,
        })
      );
    });

    it('should call setupCertificatePinning and perfMonitor.mark on init', () => {
      registerSecurityFeatures(mockFeatureManager);

      // Extract the init function from the createFeature call
      const initFn = vi.mocked(createFeature).mock.calls[0]![2];
      initFn({});

      expect(mockSetupCertificatePinning).toHaveBeenCalledTimes(1);
      expect(mockPerfMark).toHaveBeenCalledWith(
        'cert-pinning-done',
        'Certificate pinning setup completed'
      );
    });

    it('should call cleanupCertificatePinning on cleanup', () => {
      registerSecurityFeatures(mockFeatureManager);

      // Extract the options (4th arg) and call cleanup
      const options = vi.mocked(createFeature).mock.calls[0]![3] as { cleanup: () => void };
      options.cleanup();

      expect(mockCleanupCertificatePinning).toHaveBeenCalledTimes(1);
    });
  });

  describe('reportExceptions feature', () => {
    it('should register with createLazyFeature, security phase, and required=true', () => {
      registerSecurityFeatures(mockFeatureManager);

      expect(createLazyFeature).toHaveBeenCalledWith(
        'reportExceptions',
        'security',
        expect.any(Function),
        expect.objectContaining({
          description: 'Unhandled exception reporting',
          required: true,
        })
      );
    });

    it('should use dynamic import for reportExceptions module', async () => {
      registerSecurityFeatures(mockFeatureManager);

      // The importFn is the 3rd argument to createLazyFeature
      const importFn = vi.mocked(createLazyFeature).mock.calls[0]![2];

      // Calling it should return a promise (dynamic import)
      const result = importFn();
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('mediaPermissions feature', () => {
    it('should register with createLazyFeature, security phase, without required flag', () => {
      registerSecurityFeatures(mockFeatureManager);

      expect(createLazyFeature).toHaveBeenCalledWith(
        'mediaPermissions',
        'security',
        expect.any(Function),
        expect.objectContaining({
          description: 'Proactive camera/microphone TCC permission check at startup',
        })
      );
    });

    it('should pass a dynamic import function for mediaPermissions module', () => {
      registerSecurityFeatures(mockFeatureManager);

      // The importFn is the 3rd argument to createLazyFeature for mediaPermissions (2nd call)
      const importFn = vi.mocked(createLazyFeature).mock.calls[1]![2];

      // importFn should be a function (dynamic import)
      expect(importFn).toBeInstanceOf(Function);
    });
  });

  it('should register features in correct order', () => {
    registerSecurityFeatures(mockFeatureManager);

    const features = vi.mocked(mockFeatureManager.registerAll).mock.calls[0]![0] as Array<{
      name: string;
    }>;
    expect(features[0]!.name).toBe('certificatePinning');
    expect(features[1]!.name).toBe('reportExceptions');
    expect(features[2]!.name).toBe('mediaPermissions');
  });
});
