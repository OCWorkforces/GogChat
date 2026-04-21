/**
 * Unit tests for registerDeferredWindowFeatures
 *
 * Verifies that all window-bound deferred features are registered
 * with correct config (name, phase, dependencies, lazy) and that
 * their init functions invoke the underlying modules correctly.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron (must be before any imports that use it)
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

// Mock all feature modules used by the registrar
const mockAppMenuDefault = vi.fn();
vi.mock('../features/appMenu.js', () => ({
  default: mockAppMenuDefault,
}));

const mockPasskeySupportDefault = vi.fn();
vi.mock('../features/passkeySupport.js', () => ({
  default: mockPasskeySupportDefault,
}));

const mockHandleNotificationDefault = vi.fn();
vi.mock('../features/handleNotification.js', () => ({
  default: mockHandleNotificationDefault,
}));

const mockExternalLinksDefault = vi.fn();
vi.mock('../features/externalLinks.js', () => ({
  default: mockExternalLinksDefault,
}));

const mockCloseToTrayDefault = vi.fn();
vi.mock('../features/closeToTray.js', () => ({
  default: mockCloseToTrayDefault,
}));

const mockContextMenuDefault = vi.fn();
vi.mock('../features/contextMenu.js', () => ({
  default: mockContextMenuDefault,
}));

import { registerDeferredWindowFeatures } from './registerDeferredWindowFeatures';
import type { FeatureConfig } from '../utils/featureManager';

describe('registerDeferredWindowFeatures', () => {
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
    registerDeferredWindowFeatures(mockFeatureManager as never, mockCallbacks);
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

  it('registers all 6 window features', () => {
    register();
    expect(capturedFeatures).toHaveLength(6);
  });

  it('registers features in correct order', () => {
    register();
    const names = capturedFeatures.map((f) => f.name);
    expect(names).toEqual([
      'appMenu',
      'passkeySupport',
      'handleNotification',
      'externalLinks',
      'closeToTray',
      'contextMenu',
    ]);
  });

  describe('appMenu', () => {
    it('has correct config with dependencies on openAtLogin and externalLinks', () => {
      const f = getFeature('appMenu');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.dependencies).toEqual(['openAtLogin', 'externalLinks']);
      expect(f.description).toBe('Application menu');
    });

    it('init calls appMenu module when mainWindow present', async () => {
      const f = getFeature('appMenu');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockAppMenuDefault).toHaveBeenCalledWith(mainWindow);
    });

    it('init does not call appMenu module when mainWindow is null', async () => {
      const f = getFeature('appMenu');
      await f.init({ mainWindow: null });

      expect(mockAppMenuDefault).not.toHaveBeenCalled();
    });

    it('init does not call appMenu module when mainWindow is undefined', async () => {
      const f = getFeature('appMenu');
      await f.init({});

      expect(mockAppMenuDefault).not.toHaveBeenCalled();
    });
  });

  describe('passkeySupport', () => {
    it('has correct config with no dependencies', () => {
      const f = getFeature('passkeySupport');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Passkey/WebAuthn support');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls passkeySupport module when mainWindow present', async () => {
      const f = getFeature('passkeySupport');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockPasskeySupportDefault).toHaveBeenCalledWith(mainWindow);
    });

    it('init does not call when mainWindow is null', async () => {
      const f = getFeature('passkeySupport');
      await f.init({ mainWindow: null });

      expect(mockPasskeySupportDefault).not.toHaveBeenCalled();
    });
  });

  describe('handleNotification', () => {
    it('has correct config with no dependencies', () => {
      const f = getFeature('handleNotification');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Native notification handler');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls handleNotification module when mainWindow present', async () => {
      const f = getFeature('handleNotification');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockHandleNotificationDefault).toHaveBeenCalledWith(mainWindow);
    });

    it('init does not call when mainWindow is null', async () => {
      const f = getFeature('handleNotification');
      await f.init({ mainWindow: null });

      expect(mockHandleNotificationDefault).not.toHaveBeenCalled();
    });
  });

  describe('externalLinks', () => {
    it('has correct config with bootstrapPromotion dependency', () => {
      const f = getFeature('externalLinks');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.dependencies).toEqual(['bootstrapPromotion']);
      expect(f.description).toBe('External links handler');
    });

    it('init calls externalLinks module when mainWindow present', async () => {
      const f = getFeature('externalLinks');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockExternalLinksDefault).toHaveBeenCalledWith(mainWindow);
    });

    it('init does not call when mainWindow is undefined', async () => {
      const f = getFeature('externalLinks');
      await f.init({});

      expect(mockExternalLinksDefault).not.toHaveBeenCalled();
    });
  });

  describe('closeToTray', () => {
    it('has correct config with trayIcon dependency', () => {
      const f = getFeature('closeToTray');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.dependencies).toEqual(['trayIcon']);
      expect(f.description).toBe('Close to tray behavior');
    });

    it('init calls closeToTray module when mainWindow present', async () => {
      const f = getFeature('closeToTray');
      const mainWindow = { webContents: {} };
      await f.init({ mainWindow } as never);

      expect(mockCloseToTrayDefault).toHaveBeenCalledWith(mainWindow);
    });

    it('init does not call when mainWindow is null', async () => {
      const f = getFeature('closeToTray');
      await f.init({ mainWindow: null });

      expect(mockCloseToTrayDefault).not.toHaveBeenCalled();
    });
  });

  describe('contextMenu', () => {
    it('has correct config with no dependencies', () => {
      const f = getFeature('contextMenu');
      expect(f.priority).toBe('deferred');
      expect(f.lazy).toBe(true);
      expect(f.description).toBe('Right-click context menu');
      expect(f.dependencies).toBeUndefined();
    });

    it('init calls contextMenu module and registers cleanup when function returned', async () => {
      const cleanupFn = vi.fn();
      mockContextMenuDefault.mockReturnValue(cleanupFn);

      const f = getFeature('contextMenu');
      await f.init({});

      expect(mockContextMenuDefault).toHaveBeenCalled();
      expect(mockCallbacks.registerCleanupTask).toHaveBeenCalledWith('contextMenu', cleanupFn);
    });

    it('init does not register cleanup when module returns non-function', async () => {
      mockContextMenuDefault.mockReturnValue(undefined);

      const f = getFeature('contextMenu');
      await f.init({});

      expect(mockContextMenuDefault).toHaveBeenCalled();
      expect(mockCallbacks.registerCleanupTask).not.toHaveBeenCalled();
    });

    it('init does not register cleanup when module returns null', async () => {
      mockContextMenuDefault.mockReturnValue(null);

      const f = getFeature('contextMenu');
      await f.init({});

      expect(mockContextMenuDefault).toHaveBeenCalled();
      expect(mockCallbacks.registerCleanupTask).not.toHaveBeenCalled();
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
