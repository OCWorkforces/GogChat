/**
 * Unit tests for trackedResources.ts — helper functions for creating
 * tracked intervals, timeouts, event listeners, and cleanup tasks.
 *
 * Covers: setupWindowCleanup, createTrackedInterval, createTrackedTimeout,
 * addTrackedListener, registerCleanupTask.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ========================================================================
// Mock electron — must come before any imports that use electron
// ========================================================================

const mockClearCache = vi.fn().mockResolvedValue(undefined);
const mockClearStorageData = vi.fn().mockResolvedValue(undefined);
const mockWindowOn = vi.fn().mockReturnThis();
const mockIsDestroyed = vi.fn().mockReturnValue(false);
const mockIpcMainRemoveAllListeners = vi.fn();

function createMockWindow() {
  return {
    id: 1,
    webContents: {
      send: vi.fn(),
      session: {
        clearCache: mockClearCache,
        clearStorageData: mockClearStorageData,
      },
    },
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: mockIsDestroyed,
    on: mockWindowOn,
    removeAllListeners: vi.fn(),
  } as unknown as import('electron').BrowserWindow;
}

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: {
    removeAllListeners: mockIpcMainRemoveAllListeners,
  },
  app: {
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
  },
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./logger.js', () => ({
  logger: {
    feature: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
    window: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    main: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

vi.mock('./errorUtils.js', () => ({
  toErrorMessage: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
  }),
}));

// ========================================================================
// Mock resourceCleanup — isolate trackedResources from the real manager
// ========================================================================

const mockTrackInterval = vi.fn();
const mockTrackTimeout = vi.fn();
const mockTrackListener = vi.fn();
const mockRegisterTask = vi.fn();
const mockRegisterTasks = vi.fn();
const mockCleanup = vi.fn().mockResolvedValue(undefined);
const mockReset = vi.fn();

vi.mock('./resourceCleanup.js', () => ({
  getCleanupManager: vi.fn(() => ({
    trackInterval: mockTrackInterval,
    trackTimeout: mockTrackTimeout,
    trackListener: mockTrackListener,
    registerTask: mockRegisterTask,
    registerTasks: mockRegisterTasks,
    cleanup: mockCleanup,
    reset: mockReset,
  })),
}));

// ========================================================================
// Tests
// ========================================================================

describe('trackedResources', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockIsDestroyed.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ======================================================================
  // setupWindowCleanup
  // ======================================================================

  describe('setupWindowCleanup', () => {
    it('should register cleanup tasks on the manager', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      expect(mockRegisterTasks).toHaveBeenCalledOnce();
      const tasks = mockRegisterTasks.mock.calls[0]![0] as Array<{
        name: string;
        cleanup: () => void | Promise<void>;
      }>;
      expect(tasks).toHaveLength(3);
      expect(tasks[0]!.name).toBe('Remove all IPC listeners');
      expect(tasks[1]!.name).toBe('Clear web contents session cache');
      expect(tasks[2]!.name).toBe('Clear web contents storage data');
    });

    it('should register close event handler on window', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      // window.on should be called with 'close' and 'closed'
      const onCalls = mockWindowOn.mock.calls as Array<[string, (...args: unknown[]) => void]>;
      const closeCall = onCalls.find(([event]) => event === 'close');
      const closedCall = onCalls.find(([event]) => event === 'closed');
      expect(closeCall).toBeDefined();
      expect(closedCall).toBeDefined();
    });

    it('close handler should trigger manager.cleanup', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      // Find the 'close' handler and invoke it
      const onCalls = mockWindowOn.mock.calls as Array<[string, (...args: unknown[]) => void]>;
      const closeHandler = onCalls.find(([event]) => event === 'close')![1];
      closeHandler({});

      // The async cleanup is fire-and-forget via void, flush microtasks
      await vi.advanceTimersByTimeAsync(0);

      expect(mockCleanup).toHaveBeenCalledWith(
        expect.objectContaining({
          window,
          includeGlobalResources: false,
        })
      );
    });

    it('close handler should catch cleanup errors', async () => {
      mockCleanup.mockRejectedValueOnce(new Error('cleanup boom'));

      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const onCalls = mockWindowOn.mock.calls as Array<[string, (...args: unknown[]) => void]>;
      const closeHandler = onCalls.find(([event]) => event === 'close')![1];

      // Should not throw even when cleanup fails
      expect(() => closeHandler({})).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
    });

    it('closed handler should reset the manager', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const onCalls = mockWindowOn.mock.calls as Array<[string, (...args: unknown[]) => void]>;
      const closedHandler = onCalls.find(([event]) => event === 'closed')![1];
      closedHandler();

      expect(mockReset).toHaveBeenCalledOnce();
    });

    it('IPC cleanup task should call ipcMain.removeAllListeners', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const tasks = mockRegisterTasks.mock.calls[0]![0] as Array<{
        name: string;
        cleanup: () => void | Promise<void>;
      }>;
      const ipcTask = tasks.find((t) => t.name === 'Remove all IPC listeners')!;
      ipcTask.cleanup();

      expect(mockIpcMainRemoveAllListeners).toHaveBeenCalledOnce();
    });

    it('cache cleanup task should clear session cache when window not destroyed', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const tasks = mockRegisterTasks.mock.calls[0]![0] as Array<{
        name: string;
        cleanup: () => void | Promise<void>;
      }>;
      const cacheTask = tasks.find((t) => t.name === 'Clear web contents session cache')!;
      await cacheTask.cleanup();

      expect(mockClearCache).toHaveBeenCalledOnce();
    });

    it('cache cleanup task should skip when window is destroyed', async () => {
      mockIsDestroyed.mockReturnValue(true);

      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const tasks = mockRegisterTasks.mock.calls[0]![0] as Array<{
        name: string;
        cleanup: () => void | Promise<void>;
      }>;
      const cacheTask = tasks.find((t) => t.name === 'Clear web contents session cache')!;
      await cacheTask.cleanup();

      expect(mockClearCache).not.toHaveBeenCalled();
    });

    it('storage cleanup task should clear storage data when window not destroyed', async () => {
      const { setupWindowCleanup } = await import('./trackedResources.js');
      const window = createMockWindow();

      setupWindowCleanup(window);

      const tasks = mockRegisterTasks.mock.calls[0]![0] as Array<{
        name: string;
        cleanup: () => void | Promise<void>;
      }>;
      const storageTask = tasks.find((t) => t.name === 'Clear web contents storage data')!;
      await storageTask.cleanup();

      expect(mockClearStorageData).toHaveBeenCalledWith({
        storages: ['cookies', 'localstorage'],
      });
    });
  });

  // ======================================================================
  // createTrackedInterval
  // ======================================================================

  describe('createTrackedInterval', () => {
    it('should create an interval and track it', async () => {
      const { createTrackedInterval } = await import('./trackedResources.js');
      const callback = vi.fn();

      const handle = createTrackedInterval(callback, 1000);

      expect(handle).toBeDefined();
      expect(mockTrackInterval).toHaveBeenCalledWith(handle);
    });

    it('should invoke callback at specified interval', async () => {
      const { createTrackedInterval } = await import('./trackedResources.js');
      const callback = vi.fn();

      createTrackedInterval(callback, 500);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should return a clearable handle', async () => {
      const { createTrackedInterval } = await import('./trackedResources.js');
      const callback = vi.fn();

      const handle = createTrackedInterval(callback, 100);
      clearInterval(handle);

      vi.advanceTimersByTime(500);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should log when name is provided', async () => {
      const { createTrackedInterval } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');

      createTrackedInterval(vi.fn(), 1000, 'test-interval');

      expect(logger.main.debug).toHaveBeenCalledWith(expect.stringContaining('test-interval'));
    });

    it('should not log when name is not provided', async () => {
      const { createTrackedInterval } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');

      createTrackedInterval(vi.fn(), 1000);

      expect(logger.main.debug).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // createTrackedTimeout
  // ======================================================================

  describe('createTrackedTimeout', () => {
    it('should create a timeout and track it', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const callback = vi.fn();

      const handle = createTrackedTimeout(callback, 1000);

      expect(handle).toBeDefined();
      expect(mockTrackTimeout).toHaveBeenCalledWith(handle);
    });

    it('should invoke callback after specified delay', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const callback = vi.fn();

      createTrackedTimeout(callback, 300);

      expect(callback).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should not invoke callback before delay', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const callback = vi.fn();

      createTrackedTimeout(callback, 1000);

      vi.advanceTimersByTime(999);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should return a clearable handle', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const callback = vi.fn();

      const handle = createTrackedTimeout(callback, 500);
      clearTimeout(handle);

      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should log when name is provided', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');

      createTrackedTimeout(vi.fn(), 1000, 'test-timeout');

      expect(logger.main.debug).toHaveBeenCalledWith(expect.stringContaining('test-timeout'));
    });

    it('should not log when name is not provided', async () => {
      const { createTrackedTimeout } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');

      createTrackedTimeout(vi.fn(), 1000);

      expect(logger.main.debug).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // addTrackedListener
  // ======================================================================

  describe('addTrackedListener', () => {
    it('should add listener via .on() and track it', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const handler = vi.fn();
      const target = { on: vi.fn(), removeListener: vi.fn() };

      addTrackedListener(target, 'test-event', handler);

      expect(target.on).toHaveBeenCalledWith('test-event', handler);
      expect(mockTrackListener).toHaveBeenCalledWith(target, 'test-event', handler);
    });

    it('should add listener via .addEventListener() when .on() is absent', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const handler = vi.fn();
      const target = { addEventListener: vi.fn() };

      addTrackedListener(target, 'click', handler);

      expect(target.addEventListener).toHaveBeenCalledWith('click', handler);
      expect(mockTrackListener).toHaveBeenCalledWith(target, 'click', handler);
    });

    it('should prefer .on() over .addEventListener()', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const handler = vi.fn();
      const target = { on: vi.fn(), addEventListener: vi.fn() };

      addTrackedListener(target, 'data', handler);

      expect(target.on).toHaveBeenCalledWith('data', handler);
      expect(target.addEventListener).not.toHaveBeenCalled();
    });

    it('should throw if target has no listener methods', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const handler = vi.fn();
      const target = {};

      expect(() => addTrackedListener(target, 'event', handler)).toThrow(
        'Target does not support event listeners: event'
      );
    });

    it('should log when name is provided', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');
      const target = { on: vi.fn() };

      addTrackedListener(target, 'msg', vi.fn(), 'my-listener');

      expect(logger.main.debug).toHaveBeenCalledWith(expect.stringContaining('my-listener'));
    });

    it('should not log when name is not provided', async () => {
      const { addTrackedListener } = await import('./trackedResources.js');
      const { logger } = await import('./logger.js');
      const target = { on: vi.fn() };

      addTrackedListener(target, 'msg', vi.fn());

      expect(logger.main.debug).not.toHaveBeenCalled();
    });
  });

  // ======================================================================
  // registerCleanupTask
  // ======================================================================

  describe('registerCleanupTask', () => {
    it('should register a cleanup task on the manager', async () => {
      const { registerCleanupTask } = await import('./trackedResources.js');
      const cleanup = vi.fn();

      registerCleanupTask('my-task', cleanup);

      expect(mockRegisterTask).toHaveBeenCalledWith({
        name: 'my-task',
        cleanup,
        critical: false,
      });
    });

    it('should register a critical cleanup task', async () => {
      const { registerCleanupTask } = await import('./trackedResources.js');
      const cleanup = vi.fn();

      registerCleanupTask('critical-task', cleanup, true);

      expect(mockRegisterTask).toHaveBeenCalledWith({
        name: 'critical-task',
        cleanup,
        critical: true,
      });
    });

    it('should register an async cleanup task', async () => {
      const { registerCleanupTask } = await import('./trackedResources.js');
      const cleanup = vi.fn().mockResolvedValue(undefined);

      registerCleanupTask('async-task', cleanup);

      expect(mockRegisterTask).toHaveBeenCalledWith({
        name: 'async-task',
        cleanup,
        critical: false,
      });
    });
  });
});
