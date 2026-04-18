/**
 * Unit tests for registerAppReady.ts — app.whenReady() lifecycle handler
 *
 * Covers:
 * - registerAppReady(): app.whenReady() registration and phase execution order
 * - Security → Critical → Store → Account Windows → UI phase sequencing
 * - Deferred phase in setImmediate
 * - Error handling: phase failures, store init failures, top-level catch
 * - warmCachesOnIdle: icon pre-loading and stats logging
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ──── Hoisted mocks (available inside vi.mock factories) ───────────────────
const {
  mockAppWhenReady,
  mockAppQuit,
  mockAppGetPath,
  mockAppIsPackaged,
  mockLog,
  mockPerfMonitor,
  mockInitializeErrorHandler,
  mockGetCleanupManager,
  mockInitializeStore,
  mockGetIconCache,
  mockGetAccountWindowManager,
  mockCreateAccountWindow,
  mockGetWindowForAccount,
  mockCreateTrackedTimeout,
  mockCompareStorePerformance,
} = vi.hoisted(() => ({
  mockAppWhenReady: vi.fn(),
  mockAppQuit: vi.fn(),
  mockAppGetPath: vi.fn().mockReturnValue('/tmp/user-data'),
  mockAppIsPackaged: true,
  mockLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  mockPerfMonitor: {
    mark: vi.fn(),
    logSummary: vi.fn(),
    exportToJSON: vi.fn(),
  },
  mockInitializeErrorHandler: vi.fn(),
  mockGetCleanupManager: vi.fn(),
  mockInitializeStore: vi.fn(),
  mockGetIconCache: vi.fn(),
  mockGetAccountWindowManager: vi.fn(),
  mockCreateAccountWindow: vi.fn(),
  mockGetWindowForAccount: vi.fn(),
  mockCreateTrackedTimeout: vi.fn(),
  mockCompareStorePerformance: vi.fn(),
}));

// ──── Module mocks ─────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    whenReady: mockAppWhenReady,
    quit: mockAppQuit,
    getPath: mockAppGetPath,
    isPackaged: mockAppIsPackaged,
  },
}));

vi.mock('electron-log', () => ({
  default: mockLog,
}));

vi.mock('../utils/performanceMonitor.js', () => ({
  perfMonitor: mockPerfMonitor,
}));

vi.mock('../utils/errorHandler.js', () => ({
  initializeErrorHandler: mockInitializeErrorHandler,
}));

vi.mock('../utils/resourceCleanup.js', () => ({
  getCleanupManager: mockGetCleanupManager,
  createTrackedTimeout: mockCreateTrackedTimeout,
}));

vi.mock('../config.js', () => ({
  initializeStore: mockInitializeStore,
}));

vi.mock('../utils/iconCache.js', () => ({
  getIconCache: mockGetIconCache,
}));

vi.mock('../utils/accountWindowManager.js', () => ({
  getAccountWindowManager: mockGetAccountWindowManager,
  createAccountWindow: mockCreateAccountWindow,
  getWindowForAccount: mockGetWindowForAccount,
}));


vi.mock('../utils/configProfiler.js', () => ({
  compareStorePerformance: mockCompareStorePerformance,
}));

vi.mock('../../environment.js', () => ({
  default: {
    appUrl: 'https://mail.google.com/chat/u/0',
    isDev: false,
  },
}));

// Mock dynamic imports used in registerBuiltInGlobalCleanups
vi.mock('../utils/rateLimiter.js', () => ({
  destroyRateLimiter: vi.fn(),
}));
vi.mock('../utils/ipcDeduplicator.js', () => ({
  destroyDeduplicator: vi.fn(),
}));
vi.mock('../utils/ipcHelper.js', () => ({
  cleanupGlobalHandlers: vi.fn(),
}));
vi.mock('../utils/configCache.js', () => ({
  clearConfigCache: vi.fn(),
}));

// ──── Import under test ────────────────────────────────────────────────────
import { registerAppReady } from './registerAppReady';
import type { FeatureManager } from '../utils/featureManager.js';
import type { BrowserWindow } from 'electron';
import type { WindowFactory } from '../../shared/types.js';

// ──── Helpers ──────────────────────────────────────────────────────────────

/** Track call order across async phases */
const callOrder: string[] = [];

function createMockFeatureManager(
  overrides: Partial<{
    initializePhase: (phase: string) => Promise<void>;
    updateContext: (ctx: Record<string, unknown>) => void;
  }> = {}
): FeatureManager {
  return {
    initializePhase:
      overrides.initializePhase ??
      vi.fn().mockImplementation(async (phase: string) => {
        callOrder.push(`initializePhase:${phase}`);
      }),
    updateContext:
      overrides.updateContext ??
      vi.fn().mockImplementation((ctx: Record<string, unknown>) => {
        callOrder.push('updateContext');
        void ctx; // consume
      }),
  } as unknown as FeatureManager;
}

function createMockMainWindow(): BrowserWindow {
  return {
    webContents: { getURL: vi.fn() },
    isDestroyed: vi.fn().mockReturnValue(false),
  } as unknown as BrowserWindow;
}

function createMockWindowFactory(): WindowFactory {
  return {
    createWindow: vi.fn(),
  };
}

/** Set up mockAppWhenReady to resolve immediately and capture the async callback */
function setupWhenReady(): { getReadyCallback: () => () => Promise<void> } {
  let readyCallback: (() => Promise<void>) | undefined;

  mockAppWhenReady.mockReturnValue({
    then(onFulfilled: () => Promise<void>) {
      readyCallback = onFulfilled;
      return {
        catch: vi.fn(),
      };
    },
  });

  return {
    getReadyCallback: () => {
      if (!readyCallback) throw new Error('whenReady callback not captured');
      return readyCallback;
    },
  };
}

/**
 * Set up mockAppWhenReady as a real-ish promise so .then().catch() both work.
 * Returns a function that triggers the ready callback and waits for completion.
 */
function setupWhenReadyAsPromise(): { fireReady: () => Promise<void> } {
  let _resolveFn: (() => void) | undefined;
  let thenCallback: ((value: void) => Promise<void>) | undefined;
  let catchCallback: ((error: unknown) => void) | undefined;

  mockAppWhenReady.mockReturnValue({
    then(onFulfilled: (value: void) => Promise<void>) {
      thenCallback = onFulfilled;
      return {
        catch(onRejected: (error: unknown) => void) {
          catchCallback = onRejected;
          return { finally: vi.fn() };
        },
      };
    },
  });

  return {
    fireReady: async () => {
      if (!thenCallback) throw new Error('whenReady .then not captured');
      try {
        await thenCallback();
      } catch (error: unknown) {
        if (catchCallback) {
          catchCallback(error);
        } else {
          throw error;
        }
      }
    },
  };
}

function setupDefaults(): void {
  const mockCleanupManager = {
    registerGlobalCleanupCallback: vi.fn(),
  };
  mockGetCleanupManager.mockReturnValue(mockCleanupManager);
  mockInitializeStore.mockResolvedValue({});

  const mockAccountWindowManager = {
    markAsBootstrap: vi.fn(),
  };
  mockGetAccountWindowManager.mockReturnValue(mockAccountWindowManager);

  const mockMainWindow = createMockMainWindow();
  mockGetWindowForAccount.mockReturnValue(mockMainWindow);

  const mockIconCacheInstance = {
    warmCache: vi.fn(),
    getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
    getStats: vi.fn().mockReturnValue({
      size: 5,
      maxSize: 50,
      totalAccesses: 100,
      mostAccessed: 'icons/tray.png',
    }),
  };
  mockGetIconCache.mockReturnValue(mockIconCacheInstance);
}

// ──── Tests ────────────────────────────────────────────────────────────────

describe('registerAppReady', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    callOrder.length = 0;
    setupDefaults();
  });

  // ─── Registration ──────────────────────────────────────────────────────

  it('should call app.whenReady()', () => {
    setupWhenReady();
    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    expect(mockAppWhenReady).toHaveBeenCalledTimes(1);
  });

  // ─── Phase ordering ───────────────────────────────────────────────────

  it('should call initializePhase(security) before initializePhase(critical)', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    const securityIdx = callOrder.indexOf('initializePhase:security');
    const criticalIdx = callOrder.indexOf('initializePhase:critical');
    expect(securityIdx).toBeGreaterThanOrEqual(0);
    expect(criticalIdx).toBeGreaterThanOrEqual(0);
    expect(securityIdx).toBeLessThan(criticalIdx);
  });

  it('should call initializeStore() after security and critical phases', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const initStoreCallOrder: string[] = [];
    mockInitializeStore.mockImplementation(async () => {
      initStoreCallOrder.push('initializeStore');
      return {};
    });

    const fm = createMockFeatureManager({
      initializePhase: vi.fn().mockImplementation(async (phase: string) => {
        initStoreCallOrder.push(`initializePhase:${phase}`);
      }),
    });

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    const criticalIdx = initStoreCallOrder.indexOf('initializePhase:critical');
    const storeIdx = initStoreCallOrder.indexOf('initializeStore');
    expect(criticalIdx).toBeGreaterThanOrEqual(0);
    expect(storeIdx).toBeGreaterThanOrEqual(0);
    expect(criticalIdx).toBeLessThan(storeIdx);
  });

  // ─── Account window creation ──────────────────────────────────────────

  it('should create account window via accountWindowManager', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockWindowFactory = createMockWindowFactory();
    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: mockWindowFactory,
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockGetAccountWindowManager).toHaveBeenCalledWith(mockWindowFactory);
    expect(mockCreateAccountWindow).toHaveBeenCalledWith('https://mail.google.com/chat/u/0', 0);
  });

  it('should mark account-0 as bootstrap', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockAccountWindowManager = {
      markAsBootstrap: vi.fn(),
    };
    mockGetAccountWindowManager.mockReturnValue(mockAccountWindowManager);

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockAccountWindowManager.markAsBootstrap).toHaveBeenCalledWith(0);
  });

  it('should call setMainWindow with the created window', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockMainWindow = createMockMainWindow();
    mockGetWindowForAccount.mockReturnValue(mockMainWindow);
    const setMainWindow = vi.fn();

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow,
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockGetWindowForAccount).toHaveBeenCalledWith(0);
    expect(setMainWindow).toHaveBeenCalledWith(mockMainWindow);
  });

  // ─── Feature context update ───────────────────────────────────────────

  it('should call featureManager.updateContext() with mainWindow and accountWindowManager', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockMainWindow = createMockMainWindow();
    mockGetWindowForAccount.mockReturnValue(mockMainWindow);
    const mockAccountWindowManager = {
      markAsBootstrap: vi.fn(),
    };
    mockGetAccountWindowManager.mockReturnValue(mockAccountWindowManager);

    const updateContextSpy = vi.fn();
    const fm = createMockFeatureManager({
      updateContext: updateContextSpy,
    });

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(updateContextSpy).toHaveBeenCalledWith({
      mainWindow: mockMainWindow,
      accountWindowManager: mockAccountWindowManager,
    });
  });

  // ─── Icon cache warming ───────────────────────────────────────────────

  it('should call iconCache.warmCache() before UI phase', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const warmCacheOrder: string[] = [];

    const mockIconCacheInstance = {
      warmCache: vi.fn().mockImplementation(() => {
        warmCacheOrder.push('warmCache');
      }),
      getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
      getStats: vi.fn().mockReturnValue({
        size: 0,
        maxSize: 50,
        totalAccesses: 0,
        mostAccessed: null,
      }),
    };
    mockGetIconCache.mockReturnValue(mockIconCacheInstance);

    const fm = createMockFeatureManager({
      initializePhase: vi.fn().mockImplementation(async (phase: string) => {
        warmCacheOrder.push(`initializePhase:${phase}`);
      }),
    });

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    const warmIdx = warmCacheOrder.indexOf('warmCache');
    const uiIdx = warmCacheOrder.indexOf('initializePhase:ui');
    expect(warmIdx).toBeGreaterThanOrEqual(0);
    expect(uiIdx).toBeGreaterThanOrEqual(0);
    expect(warmIdx).toBeLessThan(uiIdx);
  });

  // ─── UI phase last (in blocking sequence) ─────────────────────────────

  it('should call initializePhase(ui) after security, critical, and icon warming', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const fm = createMockFeatureManager();

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    const uiIdx = callOrder.indexOf('initializePhase:ui');
    const criticalIdx = callOrder.indexOf('initializePhase:critical');
    expect(uiIdx).toBeGreaterThan(criticalIdx);
  });

  // ─── Error handler initialization ─────────────────────────────────────

  it('should call initializeErrorHandler on ready', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const fm = createMockFeatureManager();

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockInitializeErrorHandler).toHaveBeenCalledWith({ gracefulShutdown: true });
  });

  it('should log error and continue if initializeErrorHandler throws', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    mockInitializeErrorHandler.mockImplementation(() => {
      throw new Error('error handler boom');
    });

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Failed to initialize error handler:',
      expect.any(Error)
    );
    // Should still continue with security phase
    expect(fm.initializePhase as ReturnType<typeof vi.fn>).toHaveBeenCalled();
  });

  // ─── Global cleanup registration ─────────────────────────────────────

  it('should register global cleanup callbacks on ready', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockManager = {
      registerGlobalCleanupCallback: vi.fn(),
    };
    mockGetCleanupManager.mockReturnValue(mockManager);

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockManager.registerGlobalCleanupCallback).toHaveBeenCalledWith(
      'rateLimiter',
      expect.any(Function),
      'Rate limiter'
    );
    expect(mockManager.registerGlobalCleanupCallback).toHaveBeenCalledWith(
      'deduplicator',
      expect.any(Function),
      'Deduplicator'
    );
    expect(mockManager.registerGlobalCleanupCallback).toHaveBeenCalledWith(
      'ipcHandlers',
      expect.any(Function),
      'IPC handlers'
    );
    expect(mockManager.registerGlobalCleanupCallback).toHaveBeenCalledWith(
      'iconCache',
      expect.any(Function),
      'Icon cache'
    );
    expect(mockManager.registerGlobalCleanupCallback).toHaveBeenCalledWith(
      'configCache',
      expect.any(Function),
      'Config cache'
    );
  });

  // ─── Store init error ─────────────────────────────────────────────────

  it('should throw and hit catch handler when initializeStore fails', async () => {
    const storeError = new Error('store init failed');
    mockInitializeStore.mockRejectedValue(storeError);

    let catchCalled = false;
    let capturedCatchFn: ((error: unknown) => void) | undefined;

    mockAppWhenReady.mockReturnValue({
      then(onFulfilled: (value: void) => Promise<void>) {
        return {
          catch(onRejected: (error: unknown) => void) {
            capturedCatchFn = onRejected;
            // Run the then callback which will throw
            void onFulfilled().catch((err: unknown) => {
              catchCalled = true;
              onRejected(err);
            });
            return { finally: vi.fn() };
          },
        };
      },
    });

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    // Wait for async to settle
    await vi.waitFor(() => {
      expect(catchCalled).toBe(true);
    });

    expect(capturedCatchFn).toBeDefined();
    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Failed to initialize store after app.ready:',
      storeError
    );
  });

  // ─── Top-level catch handler ──────────────────────────────────────────

  it('should log error and quit app when top-level promise rejects', () => {
    let catchHandler: ((error: unknown) => void) | undefined;

    mockAppWhenReady.mockReturnValue({
      then() {
        return {
          catch(onRejected: (error: unknown) => void) {
            catchHandler = onRejected;
            return { finally: vi.fn() };
          },
        };
      },
    });

    const fm = createMockFeatureManager();
    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    expect(catchHandler).toBeDefined();
    const appError = new Error('app init failed');
    catchHandler!(appError);

    expect(mockLog.error).toHaveBeenCalledWith(
      '[Main] Failed to initialize application:',
      appError
    );
    expect(mockAppQuit).toHaveBeenCalledTimes(1);
  });

  // ─── Performance monitor marks ────────────────────────────────────────

  it('should set performance marks during initialization', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const fm = createMockFeatureManager();

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(mockPerfMonitor.mark).toHaveBeenCalledWith('app-ready', 'Electron app ready');
    expect(mockPerfMonitor.mark).toHaveBeenCalledWith(
      'account-manager-init',
      'Account window manager initialized'
    );
    expect(mockPerfMonitor.mark).toHaveBeenCalledWith('window-created', 'Main window created');
    expect(mockPerfMonitor.mark).toHaveBeenCalledWith('account-0-ready', 'Account-0 window ready');
    expect(mockPerfMonitor.mark).toHaveBeenCalledWith('icons-cached', 'Icons pre-loaded');
    expect(mockPerfMonitor.mark).toHaveBeenCalledWith(
      'features-loaded',
      'Critical features initialized'
    );
  });

  // ─── Deferred phase ───────────────────────────────────────────────────

  describe('deferred phase (setImmediate)', () => {
    it('should call initializePhase(deferred) inside setImmediate', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const initPhaseSpy = vi.fn().mockResolvedValue(undefined);
      const fm = createMockFeatureManager({
        initializePhase: initPhaseSpy,
      });

      const mockMainWindow = createMockMainWindow();
      const getMainWindow = vi.fn().mockReturnValue(mockMainWindow);

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow,
      });

      await fireReady();

      // setImmediate fires in Vitest, wait for it
      await vi.waitFor(() => {
        expect(initPhaseSpy).toHaveBeenCalledWith('deferred');
      });
    });

    it('should log error if main window not available for deferred features', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const initPhaseSpy = vi.fn().mockResolvedValue(undefined);
      const fm = createMockFeatureManager({
        initializePhase: initPhaseSpy,
      });

      const getMainWindow = vi.fn().mockReturnValue(null);

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow,
      });

      await fireReady();

      await vi.waitFor(() => {
        expect(mockLog.error).toHaveBeenCalledWith(
          '[Main] Main window not available for deferred features'
        );
      });
    });

    it('should schedule warmCachesOnIdle via createTrackedTimeout', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const fm = createMockFeatureManager();
      const mockMainWindow = createMockMainWindow();

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      });

      await fireReady();

      await vi.waitFor(() => {
        expect(mockCreateTrackedTimeout).toHaveBeenCalledWith(
          expect.any(Function),
          5000,
          'idle-cache-warming'
        );
      });
    });

    it('should log performance summary after deferred features', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const fm = createMockFeatureManager();
      const mockMainWindow = createMockMainWindow();

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      });

      await fireReady();

      await vi.waitFor(() => {
        expect(mockPerfMonitor.logSummary).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ─── warmCachesOnIdle (triggered via tracked timeout callback) ────────

  describe('warmCachesOnIdle', () => {
    it('should warm additional icons and log stats when timer fires', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const fm = createMockFeatureManager();
      const mockMainWindow = createMockMainWindow();
      const mockIconCacheInstance = {
        warmCache: vi.fn(),
        getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
        getStats: vi.fn().mockReturnValue({
          size: 10,
          maxSize: 50,
          totalAccesses: 200,
          mostAccessed: 'icons/tray.png',
        }),
      };
      mockGetIconCache.mockReturnValue(mockIconCacheInstance);

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      });

      await fireReady();

      // Wait for setImmediate to fire
      await vi.waitFor(() => {
        expect(mockCreateTrackedTimeout).toHaveBeenCalled();
      });

      // Extract and invoke the timeout callback
      const timeoutCallback = mockCreateTrackedTimeout.mock.calls[0]![0] as () => void;
      timeoutCallback();

      // Should have called getIcon for each additional icon path
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/normal/32.png');
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/normal/64.png');
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/normal/256.png');
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/offline/32.png');
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/offline/64.png');
      expect(mockIconCacheInstance.getIcon).toHaveBeenCalledWith('resources/icons/badge/32.png');

      expect(mockLog.info).toHaveBeenCalledWith(
        '[Main] Cache warming complete - 6/6 additional icons loaded'
      );
      expect(mockIconCacheInstance.getStats).toHaveBeenCalled();
    });

    it('should handle errors in warmCachesOnIdle gracefully', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const fm = createMockFeatureManager();
      const mockMainWindow = createMockMainWindow();

      // Return a cache instance whose getIcon method throws
      const throwingIconCache = {
        warmCache: vi.fn(),
        getIcon: vi.fn().mockImplementation(() => {
          throw new Error('icon cache boom');
        }),
        getStats: vi.fn().mockReturnValue({
          size: 0,
          maxSize: 50,
          totalAccesses: 0,
          mostAccessed: null,
        }),
      };
      // First return normal cache for warm phase, then throw for warmCachesOnIdle
      const normalIconCache = {
        warmCache: vi.fn(),
        getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
        getStats: vi.fn().mockReturnValue({
          size: 0,
          maxSize: 50,
          totalAccesses: 0,
          mostAccessed: null,
        }),
      };
      mockGetIconCache
        .mockReturnValueOnce(normalIconCache) // warmCache() call during ready
        .mockReturnValue(throwingIconCache); // warmCachesOnIdle call

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      });

      await fireReady();

      await vi.waitFor(() => {
        expect(mockCreateTrackedTimeout).toHaveBeenCalled();
      });

      const timeoutCallback = mockCreateTrackedTimeout.mock.calls[0]![0] as () => void;
      timeoutCallback();

      expect(mockLog.error).toHaveBeenCalledWith(
        '[Main] Failed to warm caches:',
        expect.any(Error)
      );
    });
    it('should count only non-empty icons during warming', async () => {
      const { fireReady } = setupWhenReadyAsPromise();
      const fm = createMockFeatureManager();
      const mockMainWindow = createMockMainWindow();

      let iconCallCount = 0;
      const mockIconCacheInstance = {
        warmCache: vi.fn(),
        getIcon: vi.fn().mockImplementation(() => {
          iconCallCount++;
          // Alternate between empty and non-empty
          return { isEmpty: vi.fn().mockReturnValue(iconCallCount % 2 === 0) };
        }),
        getStats: vi.fn().mockReturnValue({
          size: 3,
          maxSize: 50,
          totalAccesses: 50,
          mostAccessed: 'icons/tray.png',
        }),
      };
      mockGetIconCache.mockReturnValue(mockIconCacheInstance);

      registerAppReady({
        featureManager: fm,
        windowFactory: createMockWindowFactory(),
        setMainWindow: vi.fn(),
        getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
      });

      await fireReady();

      await vi.waitFor(() => {
        expect(mockCreateTrackedTimeout).toHaveBeenCalled();
      });

      // Reset the counter for the warmCachesOnIdle call
      iconCallCount = 0;
      const timeoutCallback = mockCreateTrackedTimeout.mock.calls[0]![0] as () => void;
      timeoutCallback();

      // 3 out of 6 icons should be non-empty (odd call numbers)
      expect(mockLog.info).toHaveBeenCalledWith(
        '[Main] Cache warming complete - 3/6 additional icons loaded'
      );
    });
  });

  // ─── Full integration sequence ────────────────────────────────────────

  it('should return mainWindow via setMainWindow after successful init', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const mockMainWindow = createMockMainWindow();
    mockGetWindowForAccount.mockReturnValue(mockMainWindow);

    const setMainWindow = vi.fn();
    const fm = createMockFeatureManager();

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow,
      getMainWindow: vi.fn(),
    });

    await fireReady();

    expect(setMainWindow).toHaveBeenCalledTimes(1);
    expect(setMainWindow).toHaveBeenCalledWith(mockMainWindow);
  });

  it('should execute full init sequence in correct order', async () => {
    const { fireReady } = setupWhenReadyAsPromise();
    const sequence: string[] = [];

    mockInitializeErrorHandler.mockImplementation(() => {
      sequence.push('errorHandler');
    });

    const mockManager = {
      registerGlobalCleanupCallback: vi.fn().mockImplementation(() => {
        if (!sequence.includes('globalCleanups')) {
          sequence.push('globalCleanups');
        }
      }),
    };
    mockGetCleanupManager.mockReturnValue(mockManager);

    mockInitializeStore.mockImplementation(async () => {
      sequence.push('initializeStore');
      return {};
    });

    const mockAccountWindowManager = { markAsBootstrap: vi.fn() };
    mockGetAccountWindowManager.mockImplementation(() => {
      sequence.push('getAccountWindowManager');
      return mockAccountWindowManager;
    });

    mockCreateAccountWindow.mockImplementation(() => {
      sequence.push('createAccountWindow');
    });

    const mockMainWindow = createMockMainWindow();
    mockGetWindowForAccount.mockReturnValue(mockMainWindow);

    const mockIconCacheInstance = {
      warmCache: vi.fn().mockImplementation(() => {
        sequence.push('warmCache');
      }),
      getIcon: vi.fn().mockReturnValue({ isEmpty: vi.fn().mockReturnValue(false) }),
      getStats: vi.fn().mockReturnValue({
        size: 0,
        maxSize: 50,
        totalAccesses: 0,
        mostAccessed: null,
      }),
    };
    mockGetIconCache.mockReturnValue(mockIconCacheInstance);

    const fm = createMockFeatureManager({
      initializePhase: vi.fn().mockImplementation(async (phase: string) => {
        sequence.push(`phase:${phase}`);
      }),
      updateContext: vi.fn().mockImplementation(() => {
        sequence.push('updateContext');
      }),
    });

    registerAppReady({
      featureManager: fm,
      windowFactory: createMockWindowFactory(),
      setMainWindow: vi.fn(),
      getMainWindow: vi.fn().mockReturnValue(mockMainWindow),
    });

    await fireReady();

    // Verify order of blocking init
    expect(sequence).toEqual([
      'errorHandler',
      'globalCleanups',
      'phase:security',
      'phase:critical',
      'initializeStore',
      'getAccountWindowManager',
      'createAccountWindow',
      'updateContext',
      'warmCache',
      'phase:ui',
    ]);
  });
});
