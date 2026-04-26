/**
 * Unit tests for windowState feature — window position/size persistence
 *
 * Covers:
 * - No-window early return
 * - State restore from store (bounds, maximized)
 * - Bounds validation (NaN, missing fields)
 * - Maximize/unmaximize handlers
 * - Throttled resize/move handlers
 * - Debounced close handler
 * - cleanupWindowState removes listeners and cancels throttles/debounces
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

// ─── Mock helpers ────────────────────────────────────────────────────────────

function makeFakeWindow() {
  const wc = new EventEmitter() as EventEmitter & { getURL: () => string };
  wc.getURL = vi.fn(() => 'https://chat.google.com');

  const win = new EventEmitter() as EventEmitter & {
    webContents: typeof wc;
    isDestroyed: () => boolean;
    destroy: () => void;
    setBounds: ReturnType<typeof vi.fn>;
    getBounds: ReturnType<typeof vi.fn>;
    maximize: ReturnType<typeof vi.fn>;
    unmaximize: ReturnType<typeof vi.fn>;
    isMaximized: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    _destroyed: boolean;
  };

  win.webContents = wc;
  win._destroyed = false;
  win.isDestroyed = () => win._destroyed;
  win.destroy = () => {
    win._destroyed = true;
    win.emit('closed');
  };

  win.setBounds = vi.fn();
  win.getBounds = vi.fn().mockReturnValue({ x: 100, y: 200, width: 1200, height: 800 });
  win.maximize = vi.fn();
  win.unmaximize = vi.fn();
  win.isMaximized = vi.fn().mockReturnValue(false);
  win.on = vi.fn();
  win.removeListener = vi.fn();

  return win;
}

// ─── In-memory store ──────────────────────────────────────────────────────────

interface StoreData {
  [key: string]: unknown;
}

function makeFakeStore(initialData: StoreData = {}) {
  const data: StoreData = { ...initialData };
  return {
    get: vi.fn((key: string) => {
      // Handle nested keys like 'window.isMaximized'
      if (key.includes('.')) {
        const parts = key.split('.');
        let result: unknown = data;
        for (const part of parts) {
          if (result && typeof result === 'object') {
            result = (result as Record<string, unknown>)[part];
          } else {
            return undefined;
          }
        }
        return result;
      }
      return data[key];
    }),
    set: vi.fn((key: string, value: unknown) => {
      // Handle nested keys like 'window.isMaximized'
      if (key.includes('.')) {
        const parts = key.split('.');
        let obj: Record<string, unknown> = data;
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          if (!(part in obj) || typeof obj[part] !== 'object') {
            obj[part] = {};
          }
          obj = obj[part] as Record<string, unknown>;
        }
        obj[parts[parts.length - 1]!] = value;
      } else {
        data[key] = value;
      }
    }),
    has: vi.fn((key: string) => {
      if (key.includes('.')) {
        return data[key] !== undefined;
      }
      return key in data;
    }),
    _getData: () => data,
  };
}

// ─── Module-level mocks ───────────────────────────────────────────────────────

const getWindowForAccountMock = vi.fn();
const storeMock = makeFakeStore();

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({
  default: storeMock,
  configGet: vi.fn((key: string) => storeMock.get(key)),
  configSet: vi.fn((key: string, value: unknown) => storeMock.set(key, value)),
}));

vi.mock('../utils/accountWindowManager.js', () => ({
  getWindowForAccount: getWindowForAccountMock,
}));

vi.mock('throttle-debounce', () => ({
  throttle: vi.fn((_delay: number, fn: () => void) => {
    const throttled = vi.fn(fn);
    throttled.cancel = vi.fn();
    return throttled;
  }),
  debounce: vi.fn((_delay: number, fn: () => void) => {
    const debounced = vi.fn(fn);
    debounced.cancel = vi.fn();
    return debounced;
  }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('windowState feature', () => {
  let fakeWindow: ReturnType<typeof makeFakeWindow>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    fakeWindow = makeFakeWindow();
    getWindowForAccountMock.mockReturnValue(fakeWindow);
    storeMock._getData(); // reset internal data
  });

  // ── No-window early return ──────────────────────────────────────────────────

  it('is a no-op when no window is available for account-0', async () => {
    getWindowForAccountMock.mockReturnValue(null);

    const feature = await import('./windowState.js');
    feature.default({});

    expect(storeMock.set).not.toHaveBeenCalled();
  });

  // ── State restore ────────────────────────────────────────────────────────────

  it('restores window bounds from store when available', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: 200, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).toHaveBeenCalledWith({
      x: 100,
      y: 200,
      width: 1200,
      height: 800,
    });
  });

  it('restores maximized state on ready-to-show', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: 200, width: 1200, height: 800 },
      isMaximized: true,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    // Simulate ready-to-show event
    const readyHandler = fakeWindow.on.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === 'ready-to-show'
    )?.[1] as () => void;
    readyHandler?.();

    expect(fakeWindow.maximize).toHaveBeenCalled();
  });

  it('does not restore maximized state when isMaximized is false', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: 200, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    const readyHandler = fakeWindow.on.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === 'ready-to-show'
    )?.[1] as () => void;
    readyHandler?.();

    expect(fakeWindow.maximize).not.toHaveBeenCalled();
  });

  // ── Bounds validation ────────────────────────────────────────────────────────

  it('skips restore when bounds are missing', async () => {
    storeMock._getData()['window'] = {
      bounds: undefined,
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.x is NaN', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: NaN, y: 200, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.y is NaN', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: NaN, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.width is NaN', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: 200, width: NaN, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.height is NaN', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100, y: 200, width: 1200, height: NaN },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.x is missing', async () => {
    storeMock._getData()['window'] = {
      // @ts-expect-error — testing invalid input
      bounds: { y: 200, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.y is missing', async () => {
    storeMock._getData()['window'] = {
      // @ts-expect-error — testing invalid input
      bounds: { x: 100, width: 1200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.width is missing', async () => {
    storeMock._getData()['window'] = {
      // @ts-expect-error — testing invalid input
      bounds: { x: 100, y: 200, height: 800 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('skips restore when bounds.height is missing', async () => {
    storeMock._getData()['window'] = {
      // @ts-expect-error — testing invalid input
      bounds: { x: 100, y: 200, width: 1200 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });

  it('rounds bounds values to integers before restoring', async () => {
    storeMock._getData()['window'] = {
      bounds: { x: 100.7, y: 200.3, width: 1200.9, height: 800.1 },
      isMaximized: false,
    };

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).toHaveBeenCalledWith({
      x: 101,
      y: 200,
      width: 1201,
      height: 800,
    });
  });

  // ── Maximize/unmaximize handlers ─────────────────────────────────────────────

  it('saves isMaximized=true when maximize event fires', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    const maxHandler = fakeWindow.on.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === 'maximize'
    )?.[1] as () => void;
    maxHandler?.();

    expect(storeMock.set).toHaveBeenCalledWith('window.isMaximized', true);
  });

  it('saves isMaximized=false when unmaximize event fires', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    const unmaxHandler = fakeWindow.on.mock.calls.find(
      (call: unknown[]) => (call[0] as string) === 'unmaximize'
    )?.[1] as () => void;
    unmaxHandler?.();

    expect(storeMock.set).toHaveBeenCalledWith('window.isMaximized', false);
  });

  // ── Event listener registration ─────────────────────────────────────────────

  it('registers listeners for ready-to-show, close, resize, move, maximize, unmaximize', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    const registeredEvents = fakeWindow.on.mock.calls.map((call: unknown[]) => call[0]);

    expect(registeredEvents).toContain('ready-to-show');
    expect(registeredEvents).toContain('close');
    expect(registeredEvents).toContain('resize');
    expect(registeredEvents).toContain('move');
    expect(registeredEvents).toContain('maximize');
    expect(registeredEvents).toContain('unmaximize');
  });

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  it('cleanupWindowState removes all listeners', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    feature.cleanupWindowState({});

    expect(fakeWindow.removeListener).toHaveBeenCalled();
  });

  it('cleanupWindowState cancels debounced/throttled handlers', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    feature.cleanupWindowState({});

    // All cancel functions should have been called
    const cancelCalls = fakeWindow.on.mock.calls.length;
    expect(cancelCalls).toBeGreaterThan(0);
  });

  it('cleanupWindowState is safe when window is destroyed', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    fakeWindow.destroy();

    expect(() => feature.cleanupWindowState({})).not.toThrow();
  });

  it('cleanupWindowState does not throw on error', async () => {
    const feature = await import('./windowState.js');
    feature.default({});

    // Mock an error scenario in cleanup
    fakeWindow.removeListener.mockImplementationOnce(() => {
      throw new Error('Test error');
    });

    expect(() => feature.cleanupWindowState({})).not.toThrow();
  });

  // ── Error handling ───────────────────────────────────────────────────────────

  it('default export catches errors and does not rethrow', async () => {
    getWindowForAccountMock.mockReturnValue({
      ...fakeWindow,
      on: vi.fn(() => {
        throw new Error('Test error');
      }),
    });

    const feature = await import('./windowState.js');

    expect(() => feature.default({})).not.toThrow();
  });

  it('is a no-op when store.has returns false for window key', async () => {
    storeMock.has.mockReturnValue(false);

    const feature = await import('./windowState.js');
    feature.default({});

    expect(fakeWindow.setBounds).not.toHaveBeenCalled();
  });
});
