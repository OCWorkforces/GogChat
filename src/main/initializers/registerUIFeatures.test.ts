/**
 * Unit tests for registerUIFeatures — critical + UI phase feature registration
 *
 * Covers: registerUIFeatures() registers userAgent (critical), singleInstance (ui),
 * deepLinkHandler (ui, with cleanup), and bootstrapPromotion (ui, with cleanup)
 * via featureManager.registerAll().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (available inside vi.mock factories) ──────────────────────

const { mockOverrideUserAgent, mockRestoreFirstInstance } = vi.hoisted(() => ({
  mockOverrideUserAgent: vi.fn(),
  mockRestoreFirstInstance: vi.fn(),
}));

vi.mock('../features/userAgent.js', () => ({
  default: mockOverrideUserAgent,
}));

vi.mock('../features/singleInstance.js', () => ({
  restoreFirstInstance: mockRestoreFirstInstance,
}));

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
}));

import { registerUIFeatures } from './registerUIFeatures';
import { createFeature } from '../utils/featureTypes.js';
import type { FeatureManager } from '../utils/featureManager.js';

describe('registerUIFeatures', () => {
  const mockFeatureManager = {
    registerAll: vi.fn(),
    register: vi.fn(),
  } as unknown as FeatureManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call featureManager.registerAll with an array of 4 features', () => {
    registerUIFeatures(mockFeatureManager);

    expect(mockFeatureManager.registerAll).toHaveBeenCalledTimes(1);
    const features = vi.mocked(mockFeatureManager.registerAll).mock.calls[0]![0];
    expect(features).toHaveLength(4);
  });

  describe('userAgent feature (critical phase)', () => {
    it('should register with createFeature, critical phase, and correct description', () => {
      registerUIFeatures(mockFeatureManager);

      expect(createFeature).toHaveBeenCalledWith(
        'userAgent',
        'critical',
        expect.any(Function),
        expect.objectContaining({
          description: 'Custom User-Agent override',
        })
      );
    });

    it('should call overrideUserAgent on init', () => {
      registerUIFeatures(mockFeatureManager);

      // Find the userAgent createFeature call
      const calls = vi.mocked(createFeature).mock.calls;
      const userAgentCall = calls.find((c) => c[0] === 'userAgent');
      const initFn = userAgentCall![2];
      initFn({});

      expect(mockOverrideUserAgent).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleInstance feature (ui phase)', () => {
    it('should register with createFeature, ui phase, and correct description', () => {
      registerUIFeatures(mockFeatureManager);

      expect(createFeature).toHaveBeenCalledWith(
        'singleInstance',
        'ui',
        expect.any(Function),
        expect.objectContaining({
          description: 'Single instance restoration handler',
        })
      );
    });

    it('should call restoreFirstInstance with accountWindowManager on init', async () => {
      const mockRestoreLocal = vi.fn();
      vi.doMock('../features/singleInstance.js', () => ({
        restoreFirstInstance: mockRestoreLocal,
      }));

      registerUIFeatures(mockFeatureManager);

      const calls = vi.mocked(createFeature).mock.calls;
      const singleInstanceCall = calls.find((c) => c[0] === 'singleInstance');
      const initFn = singleInstanceCall![2];

      const mockAccountWindowManager = { getWindow: vi.fn() };
      await initFn({ accountWindowManager: mockAccountWindowManager });

      expect(mockRestoreLocal).toHaveBeenCalledWith({
        accountWindowManager: mockAccountWindowManager,
      });

      vi.doUnmock('../features/singleInstance.js');
    });
  });

  describe('deepLinkHandler feature (ui phase)', () => {
    it('should register with createFeature, ui phase, cleanup, and correct description', () => {
      registerUIFeatures(mockFeatureManager);

      expect(createFeature).toHaveBeenCalledWith(
        'deepLinkHandler',
        'ui',
        expect.any(Function),
        expect.objectContaining({
          cleanup: expect.any(Function),
          description: 'Custom protocol (gogchat://) handler',
        })
      );
    });

    it('should dynamically import deepLinkHandler and call default with accountWindowManager on init', async () => {
      const mockDeepLinkDefault = vi.fn();
      vi.doMock('../features/deepLinkHandler.js', () => ({
        default: mockDeepLinkDefault,
        cleanupDeepLinkHandler: vi.fn(),
      }));

      registerUIFeatures(mockFeatureManager);

      const calls = vi.mocked(createFeature).mock.calls;
      const deepLinkCall = calls.find((c) => c[0] === 'deepLinkHandler');
      const initFn = deepLinkCall![2];

      const mockAccountWindowManager = { getWindow: vi.fn() };
      await initFn({ accountWindowManager: mockAccountWindowManager });

      expect(mockDeepLinkDefault).toHaveBeenCalledWith({
        accountWindowManager: mockAccountWindowManager,
      });

      vi.doUnmock('../features/deepLinkHandler.js');
    });

    it('should dynamically import deepLinkHandler and call cleanupDeepLinkHandler on cleanup', async () => {
      const mockCleanupDeepLink = vi.fn();
      vi.doMock('../features/deepLinkHandler.js', () => ({
        default: vi.fn(),
        cleanupDeepLinkHandler: mockCleanupDeepLink,
      }));

      registerUIFeatures(mockFeatureManager);

      const calls = vi.mocked(createFeature).mock.calls;
      const deepLinkCall = calls.find((c) => c[0] === 'deepLinkHandler');
      const options = deepLinkCall![3] as { cleanup: () => Promise<void> };
      await options.cleanup();

      expect(mockCleanupDeepLink).toHaveBeenCalledTimes(1);

      vi.doUnmock('../features/deepLinkHandler.js');
    });
  });

  describe('bootstrapPromotion feature (ui phase)', () => {
    it('should register with createFeature, ui phase, cleanup, and correct description', () => {
      registerUIFeatures(mockFeatureManager);

      expect(createFeature).toHaveBeenCalledWith(
        'bootstrapPromotion',
        'ui',
        expect.any(Function),
        expect.objectContaining({
          cleanup: expect.any(Function),
          description: 'Bootstrap window promotion after first login',
        })
      );
    });

    it('should dynamically import bootstrapPromotion and call default on init', async () => {
      const mockBootstrapDefault = vi.fn();
      vi.doMock('../features/bootstrapPromotion.js', () => ({
        default: mockBootstrapDefault,
        cleanupBootstrapPromotion: vi.fn(),
      }));

      registerUIFeatures(mockFeatureManager);

      const calls = vi.mocked(createFeature).mock.calls;
      const bootstrapCall = calls.find((c) => c[0] === 'bootstrapPromotion');
      const initFn = bootstrapCall![2];
      await initFn({});

      expect(mockBootstrapDefault).toHaveBeenCalledTimes(1);

      vi.doUnmock('../features/bootstrapPromotion.js');
    });

    it('should dynamically import bootstrapPromotion and call cleanupBootstrapPromotion on cleanup', async () => {
      const mockCleanupBootstrap = vi.fn();
      vi.doMock('../features/bootstrapPromotion.js', () => ({
        default: vi.fn(),
        cleanupBootstrapPromotion: mockCleanupBootstrap,
      }));

      registerUIFeatures(mockFeatureManager);

      const calls = vi.mocked(createFeature).mock.calls;
      const bootstrapCall = calls.find((c) => c[0] === 'bootstrapPromotion');
      const options = bootstrapCall![3] as { cleanup: () => Promise<void> };
      await options.cleanup();

      expect(mockCleanupBootstrap).toHaveBeenCalledTimes(1);

      vi.doUnmock('../features/bootstrapPromotion.js');
    });
  });

  it('should register features in correct order: userAgent, singleInstance, deepLinkHandler, bootstrapPromotion', () => {
    registerUIFeatures(mockFeatureManager);

    const features = vi.mocked(mockFeatureManager.registerAll).mock.calls[0]![0] as Array<{
      name: string;
    }>;
    expect(features.map((f) => f.name)).toEqual([
      'userAgent',
      'singleInstance',
      'deepLinkHandler',
      'bootstrapPromotion',
    ]);
  });

  it('should assign correct phases to each feature', () => {
    registerUIFeatures(mockFeatureManager);

    const features = vi.mocked(mockFeatureManager.registerAll).mock.calls[0]![0] as Array<{
      name: string;
      priority: string;
    }>;
    expect(features[0]).toEqual(
      expect.objectContaining({ name: 'userAgent', priority: 'critical' })
    );
    expect(features[1]).toEqual(
      expect.objectContaining({ name: 'singleInstance', priority: 'ui' })
    );
    expect(features[2]).toEqual(
      expect.objectContaining({ name: 'deepLinkHandler', priority: 'ui' })
    );
    expect(features[3]).toEqual(
      expect.objectContaining({ name: 'bootstrapPromotion', priority: 'ui' })
    );
  });
});
