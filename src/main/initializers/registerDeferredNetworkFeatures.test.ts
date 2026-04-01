/**
 * Unit tests for registerDeferredNetworkFeatures
 *
 * Verifies that the inOnline connectivity monitoring feature is registered
 * with correct config and that its init function invokes the underlying
 * module correctly with mainWindow and delayed connectivity check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron (must be before any imports that use it)
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

// Mock trackedResources
const mockCreateTrackedTimeout = vi.fn();
vi.mock('../utils/trackedResources.js', () => ({
  createTrackedTimeout: (...args: unknown[]) => mockCreateTrackedTimeout(...args),
}));

// Mock inOnline feature module
const mockInOnlineDefault = vi.fn();
const mockCheckForInternet = vi.fn().mockResolvedValue(undefined);
vi.mock('../features/inOnline.js', () => ({
  default: mockInOnlineDefault,
  checkForInternet: mockCheckForInternet,
}));

import { registerDeferredNetworkFeatures } from './registerDeferredNetworkFeatures';
import type { FeatureConfig } from '../utils/featureTypes';

describe('registerDeferredNetworkFeatures', () => {
  let capturedFeatures: FeatureConfig[];
  let mockFeatureManager: { registerAll: ReturnType<typeof vi.fn> };
  let mockCallbacks: {
    setTrayIcon: ReturnType<typeof vi.fn>;
    registerCleanupTask: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    capturedFeatures = [];
    mockFeatureManager = {
      registerAll: vi.fn((configs: FeatureConfig[]) => {
        capturedFeatures = configs;
      }),
    };
    mockCallbacks = {
      setTrayIcon: vi.fn(),
      registerCleanupTask: vi.fn(),
    };
  });

  function register() {
    registerDeferredNetworkFeatures(mockFeatureManager as never, mockCallbacks);
  }

  function getFeature(name: string): FeatureConfig {
    register();
    const feature = capturedFeatures.find((f) => f.name === name);
    if (!feature) throw new Error(`Feature '${name}' not found`);
    return feature;
  }

  it('calls featureManager.registerAll with an array of feature configs', () => {
    register();
    expect(mockFeatureManager.registerAll).toHaveBeenCalledOnce();
    expect(mockFeatureManager.registerAll).toHaveBeenCalledWith(expect.any(Array));
  });

  it('registers exactly 1 network feature', () => {
    register();
    expect(capturedFeatures).toHaveLength(1);
  });

  describe('inOnline', () => {
    it('has correct config with deferred phase and no dependencies', () => {
      const f = getFeature('inOnline');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Internet connectivity monitoring');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls inOnline module and sets up connectivity check when mainWindow present', async () => {
      const f = getFeature('inOnline');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockInOnlineDefault).toHaveBeenCalledWith(mainWindow);
      expect(mockCreateTrackedTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        3000,
        'initial-connectivity-check'
      );
    });

    it('delayed connectivity check callback calls checkForInternet', async () => {
      const f = getFeature('inOnline');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      // Get the callback passed to createTrackedTimeout and invoke it
      const timeoutCallback = mockCreateTrackedTimeout.mock.calls[0][0] as () => void;
      timeoutCallback();

      expect(mockCheckForInternet).toHaveBeenCalledWith(mainWindow);
    });

    it('init does nothing when mainWindow is null', async () => {
      const f = getFeature('inOnline');
      await f.init({ mainWindow: null });

      expect(mockInOnlineDefault).not.toHaveBeenCalled();
      expect(mockCreateTrackedTimeout).not.toHaveBeenCalled();
    });

    it('init does nothing when mainWindow is undefined', async () => {
      const f = getFeature('inOnline');
      await f.init({});

      expect(mockInOnlineDefault).not.toHaveBeenCalled();
      expect(mockCreateTrackedTimeout).not.toHaveBeenCalled();
    });

    it('uses 3000ms delay for initial connectivity check', async () => {
      const f = getFeature('inOnline');
      await f.init({ mainWindow: { webContents: {} } } as never);

      const delay = mockCreateTrackedTimeout.mock.calls[0][1];
      expect(delay).toBe(3000);
    });

    it('uses correct label for tracked timeout', async () => {
      const f = getFeature('inOnline');
      await f.init({ mainWindow: { webContents: {} } } as never);

      const label = mockCreateTrackedTimeout.mock.calls[0][2];
      expect(label).toBe('initial-connectivity-check');
    });
  });

  describe('callbacks parameter', () => {
    it('accepts callbacks but does not use them (prefixed with _)', () => {
      register();
      expect(mockCallbacks.setTrayIcon).not.toHaveBeenCalled();
      expect(mockCallbacks.registerCleanupTask).not.toHaveBeenCalled();
    });
  });
});
