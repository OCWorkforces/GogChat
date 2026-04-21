/**
 * Tests for featureTypes — factory helpers and initialization wrapper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  FeatureConfig,
  FeatureContext,
  FeaturePriority,
  FeatureState,
} from './featureConfigTypes.js';
import { createFeature, createLazyFeature, initializeFeature } from './featureManager.js';

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({ BrowserWindow: {}, Tray: {} }));

vi.mock('./accountWindowManager.js', () => ({}));

const wrapAsyncMock = vi.fn(async (_ctx: unknown, fn: () => Promise<void>) => {
  await fn();
});

vi.mock('./errorHandler.js', () => ({
  getErrorHandler: vi.fn(() => ({
    wrapAsync: wrapAsyncMock,
  })),
}));

describe('createFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FeatureConfig with correct name, priority, and init', () => {
    const init = vi.fn();
    const feature = createFeature('my-feature', 'critical', init);

    expect(feature.name).toBe('my-feature');
    expect(feature.priority).toBe('critical');
    expect(feature.init).toBe(init);
  });

  it('preserves init function as-is (identity)', async () => {
    const init = vi.fn(async () => {});
    const feature = createFeature('f', 'ui', init);
    const ctx: FeatureContext = {};
    await feature.init(ctx);
    expect(init).toHaveBeenCalledWith(ctx);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('includes optional fields when provided', () => {
    const init = vi.fn();
    const cleanup = vi.fn();
    const feature = createFeature('feat', 'deferred', init, {
      dependencies: ['a', 'b'],
      cleanup,
      description: 'test feature',
      required: true,
    });

    expect(feature.dependencies).toEqual(['a', 'b']);
    expect(feature.cleanup).toBe(cleanup);
    expect(feature.description).toBe('test feature');
    expect(feature.required).toBe(true);
  });

  it('omits optional fields when not provided', () => {
    const feature = createFeature('feat', 'security', vi.fn());
    expect(feature.dependencies).toBeUndefined();
    expect(feature.cleanup).toBeUndefined();
    expect(feature.description).toBeUndefined();
    expect(feature.required).toBeUndefined();
  });

  it('does not set lazy to true for static features', () => {
    const feature = createFeature('feat', 'ui', vi.fn());
    expect(feature.lazy).toBeUndefined();
    expect(feature.lazy).not.toBe(true);
  });

  it('supports all FeaturePriority values', () => {
    const priorities: FeaturePriority[] = ['security', 'critical', 'ui', 'deferred'];
    for (const p of priorities) {
      const feat = createFeature(`f-${p}`, p, vi.fn());
      expect(feat.priority).toBe(p);
    }
  });
});

describe('createLazyFeature', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns FeatureConfig with lazy: true', () => {
    const importFn = vi.fn(async () => ({ default: vi.fn() }));
    const feature = createLazyFeature('lazy', 'deferred', importFn);
    expect(feature.lazy).toBe(true);
    expect(feature.name).toBe('lazy');
    expect(feature.priority).toBe('deferred');
  });

  it('init calls importFn and then module.default with context', async () => {
    const defaultFn = vi.fn(async () => {});
    const importFn = vi.fn(async () => ({ default: defaultFn }));
    const feature = createLazyFeature('lazy', 'ui', importFn);

    const ctx: FeatureContext = { mainWindow: null };
    await feature.init(ctx);

    expect(importFn).toHaveBeenCalledTimes(1);
    expect(defaultFn).toHaveBeenCalledWith(ctx);
    expect(defaultFn).toHaveBeenCalledTimes(1);
  });

  it('init properly awaits async importFn', async () => {
    let resolved = false;
    const importFn = vi.fn(
      () =>
        new Promise<{ default: (ctx: FeatureContext) => Promise<void> }>((res) => {
          setTimeout(() => {
            resolved = true;
            res({ default: async () => {} });
          }, 5);
        })
    );
    const feature = createLazyFeature('lazy', 'deferred', importFn);
    await feature.init({});
    expect(resolved).toBe(true);
  });

  it('includes optional fields when provided', () => {
    const feature = createLazyFeature('lazy', 'critical', async () => ({ default: vi.fn() }), {
      dependencies: ['x'],
      description: 'lazy feature',
      required: false,
    });
    expect(feature.dependencies).toEqual(['x']);
    expect(feature.description).toBe('lazy feature');
    expect(feature.required).toBe(false);
  });

  it('omits optional fields when not provided', () => {
    const feature = createLazyFeature('lazy', 'ui', async () => ({
      default: vi.fn(),
    }));
    expect(feature.dependencies).toBeUndefined();
    expect(feature.description).toBeUndefined();
    expect(feature.required).toBeUndefined();
  });

  it('propagates error if module.default throws', async () => {
    const boom = new Error('boom');
    const feature = createLazyFeature('lazy', 'ui', async () => ({
      default: async () => {
        throw boom;
      },
    }));
    await expect(feature.init({})).rejects.toBe(boom);
  });
});

describe('initializeFeature', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    wrapAsyncMock.mockImplementation(async (_ctx, fn: () => Promise<void>) => {
      await fn();
    });
  });

  it('calls getErrorHandler().wrapAsync with correct context', async () => {
    const { getErrorHandler } = await import('./errorHandler.js');
    const init = vi.fn(async () => {});

    await initializeFeature('my-feature', init, 'critical');

    expect(getErrorHandler).toHaveBeenCalled();
    expect(wrapAsyncMock).toHaveBeenCalledTimes(1);
    const [ctx, wrappedFn] = wrapAsyncMock.mock.calls[0]!;
    expect(ctx).toEqual({
      feature: 'my-feature',
      phase: 'critical',
      operation: 'initialization',
    });
    expect(typeof wrappedFn).toBe('function');
  });

  it('calls init function inside wrapAsync', async () => {
    const init = vi.fn(async () => {});
    await initializeFeature('f', init);
    expect(init).toHaveBeenCalledTimes(1);
  });

  it('logs debug on success', async () => {
    const logMod = await import('electron-log');
    const init = vi.fn(async () => {});
    await initializeFeature('success-feat', init, 'ui');
    expect(logMod.default.debug).toHaveBeenCalledWith(
      expect.stringContaining("Feature 'success-feat' initialized successfully")
    );
  });

  it('logs error and does NOT rethrow on failure', async () => {
    const logMod = await import('electron-log');
    const err = new Error('init failed');
    wrapAsyncMock.mockImplementationOnce(async () => {
      throw err;
    });

    await expect(initializeFeature('fail-feat', vi.fn(), 'deferred')).resolves.toBeUndefined();

    expect(logMod.default.error).toHaveBeenCalledWith(
      expect.stringContaining("Feature 'fail-feat' initialization failed:"),
      err
    );
  });

  it('does not log debug success when initialization fails', async () => {
    const logMod = await import('electron-log');
    vi.mocked(logMod.default.debug).mockClear();
    wrapAsyncMock.mockImplementationOnce(async () => {
      throw new Error('fail');
    });

    await initializeFeature('fail-feat', vi.fn());
    expect(logMod.default.debug).not.toHaveBeenCalled();
  });

  it('works with phase parameter for all priorities', async () => {
    const phases: FeaturePriority[] = ['security', 'critical', 'ui', 'deferred'];
    for (const phase of phases) {
      wrapAsyncMock.mockClear();
      await initializeFeature(`f-${phase}`, vi.fn(), phase);
      const [ctx] = wrapAsyncMock.mock.calls[0]!;
      expect((ctx as { phase: string }).phase).toBe(phase);
    }
  });

  it('works without phase parameter (undefined)', async () => {
    await initializeFeature('no-phase', vi.fn());
    const [ctx] = wrapAsyncMock.mock.calls[0]!;
    expect(ctx).toEqual({
      feature: 'no-phase',
      phase: undefined,
      operation: 'initialization',
    });
  });
});

describe('type shapes (compile-time)', () => {
  it('FeatureContext accepts documented shape', () => {
    const ctx: FeatureContext = {
      mainWindow: null,
      trayIcon: undefined,
      accountWindowManager: undefined,
    };
    expect(ctx).toBeDefined();

    const empty: FeatureContext = {};
    expect(empty).toEqual({});
  });

  it('FeatureConfig accepts documented shape', () => {
    const cfg: FeatureConfig = {
      name: 'n',
      priority: 'ui',
      dependencies: ['d'],
      init: () => {},
      cleanup: () => {},
      lazy: false,
      description: 'desc',
      required: true,
    };
    expect(cfg.name).toBe('n');
    expect(cfg.priority).toBe('ui');
  });

  it('FeatureState accepts all status values', () => {
    const statuses: FeatureState['status'][] = ['pending', 'initializing', 'initialized', 'failed'];
    for (const status of statuses) {
      const state: FeatureState = {
        name: 'f',
        status,
        error: status === 'failed' ? new Error('x') : undefined,
        initTime: 42,
      };
      expect(state.status).toBe(status);
    }
  });
});
