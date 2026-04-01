/**
 * Unit tests for registerDeferredSystemFeatures
 *
 * Verifies that all system-level deferred features are registered
 * with correct config (name, phase, dependencies, lazy) and that
 * their init functions invoke the underlying modules correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron (must be before any imports that use it)
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

// Mock all feature modules used by the registrar
const mockTrayIconDefault = vi.fn().mockReturnValue({ destroy: vi.fn() });
vi.mock('../features/trayIcon.js', () => ({
  default: mockTrayIconDefault,
}));

const mockBadgeIconDefault = vi.fn();
vi.mock('../features/badgeIcon.js', () => ({
  default: mockBadgeIconDefault,
}));

const mockWindowStateDefault = vi.fn();
vi.mock('../features/windowState.js', () => ({
  default: mockWindowStateDefault,
}));

const mockOpenAtLoginDefault = vi.fn();
vi.mock('../features/openAtLogin.js', () => ({
  default: mockOpenAtLoginDefault,
}));

const mockAppUpdatesDefault = vi.fn();
vi.mock('../features/appUpdates.js', () => ({
  default: mockAppUpdatesDefault,
}));

const mockFirstLaunchDefault = vi.fn();
vi.mock('../features/firstLaunch.js', () => ({
  default: mockFirstLaunchDefault,
}));

const mockEnforceMacOSAppLocation = vi.fn();
vi.mock('../utils/platform.js', () => ({
  enforceMacOSAppLocation: mockEnforceMacOSAppLocation,
}));

import { registerDeferredSystemFeatures } from './registerDeferredSystemFeatures';
import type { FeatureConfig } from '../utils/featureTypes';

describe('registerDeferredSystemFeatures', () => {
  let capturedFeatures: FeatureConfig[];
  let mockFeatureManager: {
    registerAll: ReturnType<typeof vi.fn>;
    updateContext: ReturnType<typeof vi.fn>;
  };
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
      updateContext: vi.fn(),
    };
    mockCallbacks = {
      setTrayIcon: vi.fn(),
      registerCleanupTask: vi.fn(),
    };
  });

  function register() {
    registerDeferredSystemFeatures(mockFeatureManager as never, mockCallbacks);
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

  it('registers all 7 system features', () => {
    register();
    expect(capturedFeatures).toHaveLength(7);
  });

  it('registers features in correct order', () => {
    register();
    const names = capturedFeatures.map((f) => f.name);
    expect(names).toEqual([
      'trayIcon',
      'badgeIcons',
      'windowState',
      'openAtLogin',
      'appUpdates',
      'firstLaunch',
      'enforceMacOSAppLocation',
    ]);
  });

  describe('trayIcon', () => {
    it('has correct config', () => {
      const f = getFeature('trayIcon');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('System tray icon');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls trayIcon module and sets tray icon when mainWindow present', async () => {
      const mockIcon = { destroy: vi.fn() };
      mockTrayIconDefault.mockReturnValue(mockIcon);

      const f = getFeature('trayIcon');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockTrayIconDefault).toHaveBeenCalledWith(mainWindow);
      expect(mockCallbacks.setTrayIcon).toHaveBeenCalledWith(mockIcon);
      expect(mockFeatureManager.updateContext).toHaveBeenCalledWith({ trayIcon: mockIcon });
    });

    it('init does nothing when mainWindow is null', async () => {
      const f = getFeature('trayIcon');
      await f.init({ mainWindow: null });

      expect(mockTrayIconDefault).not.toHaveBeenCalled();
      expect(mockCallbacks.setTrayIcon).not.toHaveBeenCalled();
    });

    it('init does nothing when mainWindow is undefined', async () => {
      const f = getFeature('trayIcon');
      await f.init({});

      expect(mockTrayIconDefault).not.toHaveBeenCalled();
    });
  });

  describe('badgeIcons', () => {
    it('has correct config with trayIcon dependency', () => {
      const f = getFeature('badgeIcons');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.dependencies).toEqual(['trayIcon']);
      expect(f.description).toBe('Badge/overlay icon for unread count');
    });

    it('init calls badgeIcon module when mainWindow and trayIcon present', async () => {
      const f = getFeature('badgeIcons');
      const mainWindow = { webContents: {} };
      const trayIcon = { destroy: vi.fn() };
      await f.init({ mainWindow, trayIcon } as never);

      expect(mockBadgeIconDefault).toHaveBeenCalledWith(mainWindow, trayIcon);
    });

    it('init does nothing when mainWindow is missing', async () => {
      const f = getFeature('badgeIcons');
      await f.init({ trayIcon: {} } as never);

      expect(mockBadgeIconDefault).not.toHaveBeenCalled();
    });

    it('init does nothing when trayIcon is missing', async () => {
      const f = getFeature('badgeIcons');
      await f.init({ mainWindow: {} } as never);

      expect(mockBadgeIconDefault).not.toHaveBeenCalled();
    });

    it('init does nothing when both are null', async () => {
      const f = getFeature('badgeIcons');
      await f.init({ mainWindow: null, trayIcon: undefined } as never);

      expect(mockBadgeIconDefault).not.toHaveBeenCalled();
    });
  });

  describe('windowState', () => {
    it('has correct config with 3 dependencies', () => {
      const f = getFeature('windowState');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.dependencies).toEqual(['singleInstance', 'deepLinkHandler', 'bootstrapPromotion']);
      expect(f.description).toBe('Window state persistence');
    });

    it('init calls windowState module with accountWindowManager', async () => {
      const f = getFeature('windowState');
      const accountWindowManager = { getWindow: vi.fn() };
      await f.init({ accountWindowManager } as never);

      expect(mockWindowStateDefault).toHaveBeenCalledWith({ accountWindowManager });
    });
  });

  describe('openAtLogin', () => {
    it('has correct config', () => {
      const f = getFeature('openAtLogin');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Auto-launch on system startup');
      expect(f.dependencies).toBeUndefined();
    });

    it('init resolves and calls the module default', async () => {
      const f = getFeature('openAtLogin');
      await f.init({});
      expect(mockOpenAtLoginDefault).toHaveBeenCalled();
    });
  });

  describe('appUpdates', () => {
    it('has correct config', () => {
      const f = getFeature('appUpdates');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Update notification system');
      expect(f.dependencies).toBeUndefined();
    });

    it('init resolves and calls the module default', async () => {
      const f = getFeature('appUpdates');
      await f.init({});
      expect(mockAppUpdatesDefault).toHaveBeenCalled();
    });
  });

  describe('firstLaunch', () => {
    it('has correct config', () => {
      const f = getFeature('firstLaunch');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('First launch logging');
      expect(f.dependencies).toBeUndefined();
    });

    it('init resolves and calls the module default', async () => {
      const f = getFeature('firstLaunch');
      await f.init({});
      expect(mockFirstLaunchDefault).toHaveBeenCalled();
    });
  });

  describe('enforceMacOSAppLocation', () => {
    it('has correct config', () => {
      const f = getFeature('enforceMacOSAppLocation');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('macOS app location enforcement');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls enforceMacOSAppLocation from platform utils', async () => {
      const f = getFeature('enforceMacOSAppLocation');
      await f.init({});
      expect(mockEnforceMacOSAppLocation).toHaveBeenCalled();
    });
  });

  it('all features have deferred priority and lazy flag', () => {
    register();
    for (const f of capturedFeatures) {
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
    }
  });
});
