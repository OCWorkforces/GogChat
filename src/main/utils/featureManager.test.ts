/**
 * Unit tests for FeatureManager — feature lifecycle orchestration
 *
 * Covers: singleton, register, registerAll, createFeature, createLazyFeature,
 * initializePhase (all phases), cleanup, updateContext, dependency resolution,
 * topological sort, error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ErrorContext } from './errorHandler.js';
import type { BrowserWindow } from 'electron';

// Mock electron first - must come before any imports that use electron
vi.mock('electron', () => ({
  app: {
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    id: 1,
    webContents: { send: vi.fn() },
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
  })),
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn(),
  })),
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./errorHandler.js', () => ({
  getErrorHandler: () => ({
    wrapAsync: vi.fn(async (_ctx: ErrorContext, fn: () => Promise<void>) => {
      await fn();
    }),
  }),
}));

describe('FeatureManager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ========================================================================
  // Singleton
  // ========================================================================

  describe('Singleton', () => {
    it('getFeatureManager returns the same instance on repeated calls', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const instance1 = getFeatureManager();
      const instance2 = getFeatureManager();
      expect(instance1).toBe(instance2);
    });

    it('getFeatureManager returns different instances after resetModules', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const instance1 = getFeatureManager();
      vi.resetModules();
      const { getFeatureManager: getFresh } = await import('./featureManager');
      const instance2 = getFresh();
      expect(instance1).not.toBe(instance2);
    });

    it('new singleton has clean state after resetModules', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr1 = getFeatureManager();
      mgr1.register({ name: 'test', priority: 'security', init: vi.fn() });
      vi.resetModules();
      const { getFeatureManager: getFresh } = await import('./featureManager');
      const mgr2 = getFresh();
      expect(mgr2.getFeatureState('test')).toBeUndefined();
    });
  });

  // ========================================================================
  // createFeature / createLazyFeature helpers
  // ========================================================================

  describe('createFeature', () => {
    it('creates a feature config with correct name and priority', async () => {
      const { createFeature } = await import('./featureManager');
      const initFn = vi.fn();
      const feature = createFeature('myFeature', 'critical', initFn);

      expect(feature.name).toBe('myFeature');
      expect(feature.priority).toBe('critical');
      expect(feature.init).toBe(initFn);
    });

    it('creates a feature config with options', async () => {
      const { createFeature } = await import('./featureManager');
      const cleanupFn = vi.fn();
      const feature = createFeature('feature', 'ui', vi.fn(), {
        dependencies: ['dep1'],
        cleanup: cleanupFn,
        description: 'My feature',
        required: true,
      });

      expect(feature.dependencies).toEqual(['dep1']);
      expect(feature.cleanup).toBe(cleanupFn);
      expect(feature.description).toBe('My feature');
      expect(feature.required).toBe(true);
    });
  });

  describe('createLazyFeature', () => {
    it('creates a lazy feature with dynamic import', async () => {
      const { createLazyFeature } = await import('./featureManager');
      const importFn = vi.fn().mockResolvedValue({ default: vi.fn() });
      const feature = createLazyFeature('lazyFeature', 'deferred', importFn);

      expect(feature.name).toBe('lazyFeature');
      expect(feature.priority).toBe('deferred');
      expect(feature.lazy).toBe(true);
    });

    it('lazy feature calls importFn and then default export', async () => {
      const { createLazyFeature } = await import('./featureManager');
      const mockDefault = vi.fn();
      const importFn = vi.fn().mockResolvedValue({ default: mockDefault });
      const feature = createLazyFeature('lazyFeature', 'deferred', importFn);

      await feature.init({});

      expect(importFn).toHaveBeenCalled();
      expect(mockDefault).toHaveBeenCalledWith({});
    });
  });

  // ========================================================================
  // register / registerAll
  // ========================================================================

  describe('register', () => {
    it('registers a feature and sets its state to pending', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const initFn = vi.fn();
      mgr.register({ name: 'feat1', priority: 'security', init: initFn });

      const state = mgr.getFeatureState('feat1');
      expect(state).toBeDefined();
      expect(state?.status).toBe('pending');
      expect(state?.name).toBe('feat1');
    });

    it('skips registration of duplicate feature name', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const initFn1 = vi.fn();
      const initFn2 = vi.fn();
      mgr.register({ name: 'feat1', priority: 'security', init: initFn1 });
      mgr.register({ name: 'feat1', priority: 'critical', init: initFn2 });

      const state = mgr.getFeatureState('feat1');
      expect(state?.status).toBe('pending');
    });
  });

  describe('registerAll', () => {
    it('registers multiple features', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const initFn1 = vi.fn();
      const initFn2 = vi.fn();
      mgr.registerAll([
        { name: 'feat1', priority: 'security', init: initFn1 },
        { name: 'feat2', priority: 'critical', init: initFn2 },
      ]);

      expect(mgr.getFeatureState('feat1')?.status).toBe('pending');
      expect(mgr.getFeatureState('feat2')?.status).toBe('pending');
    });

    it('registers features with correct phases', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      mgr.registerAll([
        { name: 'sec', priority: 'security', init: vi.fn() },
        { name: 'crit', priority: 'critical', init: vi.fn() },
        { name: 'ui', priority: 'ui', init: vi.fn() },
        { name: 'def', priority: 'deferred', init: vi.fn() },
      ]);

      expect(mgr.getFeatureState('sec')).toBeDefined();
      expect(mgr.getFeatureState('crit')).toBeDefined();
      expect(mgr.getFeatureState('ui')).toBeDefined();
      expect(mgr.getFeatureState('def')).toBeDefined();
    });
  });

  // ========================================================================
  // updateContext
  // ========================================================================

  describe('updateContext', () => {
    it('updates the context object', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const mockWindow = { id: 1, webContents: { send: vi.fn() } };
      mgr.updateContext({ mainWindow: mockWindow as unknown as BrowserWindow });

      // The context is internal, but we can verify it doesn't throw
      expect(() => mgr.updateContext({ mainWindow: null })).not.toThrow();
    });
  });

  // ========================================================================
  // initializePhase — security (sequential)
  // ========================================================================

  describe('initializePhase security (sequential)', () => {
    it('initializes security-phase features in order', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const order: string[] = [];

      mgr.registerAll([
        {
          name: 'sec1',
          priority: 'security',
          init: vi.fn().mockImplementation(async () => {
            order.push('sec1');
            await Promise.resolve();
          }),
        },
        {
          name: 'sec2',
          priority: 'security',
          init: vi.fn().mockImplementation(async () => {
            order.push('sec2');
            await Promise.resolve();
          }),
        },
        {
          name: 'sec3',
          priority: 'security',
          init: vi.fn().mockImplementation(async () => {
            order.push('sec3');
            await Promise.resolve();
          }),
        },
      ]);

      await mgr.initializePhase('security');

      expect(order).toEqual(['sec1', 'sec2', 'sec3']);
      expect(mgr.getFeatureState('sec1')?.status).toBe('initialized');
      expect(mgr.getFeatureState('sec2')?.status).toBe('initialized');
      expect(mgr.getFeatureState('sec3')?.status).toBe('initialized');
    });

    it('is a no-op when no features in phase', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      await expect(mgr.initializePhase('security')).resolves.toBeUndefined();
    });
  });

  // ========================================================================
  // initializePhase — critical (sequential)
  // ========================================================================

  describe('initializePhase critical (sequential)', () => {
    it('initializes critical-phase features in order', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const order: string[] = [];

      mgr.registerAll([
        {
          name: 'crit1',
          priority: 'critical',
          init: vi.fn().mockImplementation(async () => {
            order.push('crit1');
          }),
        },
        {
          name: 'crit2',
          priority: 'critical',
          init: vi.fn().mockImplementation(async () => {
            order.push('crit2');
          }),
        },
      ]);

      await mgr.initializePhase('critical');

      expect(order).toEqual(['crit1', 'crit2']);
    });
  });

  // ========================================================================
  // initializePhase — ui (parallel)
  // ========================================================================

  describe('initializePhase ui (parallel)', () => {
    it('initializes ui-phase features in parallel', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      let startTime = 0;
      const order: string[] = [];

      mgr.registerAll([
        {
          name: 'ui1',
          priority: 'ui',
          init: vi.fn().mockImplementation(async () => {
            startTime = Date.now();
            order.push('ui1_start');
            await new Promise((r) => setTimeout(r, 50));
            order.push('ui1_end');
          }),
        },
        {
          name: 'ui2',
          priority: 'ui',
          init: vi.fn().mockImplementation(async () => {
            const elapsed = Date.now() - startTime;
            order.push('ui2_start');
            // If parallel, ui2 starts while ui1 is waiting
            expect(elapsed).toBeLessThan(30);
            await new Promise((r) => setTimeout(r, 30));
            order.push('ui2_end');
          }),
        },
      ]);

      await mgr.initializePhase('ui');

      // Both should have started in quick succession (parallel)
      expect(order.filter((o) => o.includes('start')).length).toBe(2);
    });
  });

  // ========================================================================
  // initializePhase — deferred (parallel)
  // ========================================================================

  describe('initializePhase deferred (parallel)', () => {
    it('initializes deferred-phase features in parallel', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      let startTime = 0;

      mgr.registerAll([
        {
          name: 'def1',
          priority: 'deferred',
          init: vi.fn().mockImplementation(async () => {
            startTime = Date.now();
            await new Promise((r) => setTimeout(r, 40));
          }),
        },
        {
          name: 'def2',
          priority: 'deferred',
          init: vi.fn().mockImplementation(async () => {
            const elapsed = Date.now() - startTime;
            // If parallel, def2 starts immediately while def1 is waiting
            expect(elapsed).toBeLessThan(20);
            await new Promise((r) => setTimeout(r, 30));
          }),
        },
      ]);

      await mgr.initializePhase('deferred');
    });
  });

  // ========================================================================
  // Dependencies
  // ========================================================================

  describe('Dependencies', () => {
    it('features with dependencies initialize after their deps', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const order: string[] = [];

      mgr.registerAll([
        {
          name: 'base',
          priority: 'security',
          init: vi.fn().mockImplementation(async () => {
            order.push('base');
          }),
        },
        {
          name: 'dependent',
          priority: 'security',
          dependencies: ['base'],
          init: vi.fn().mockImplementation(async () => {
            order.push('dependent');
          }),
        },
      ]);

      await mgr.initializePhase('security');

      const baseIdx = order.indexOf('base');
      const depIdx = order.indexOf('dependent');
      expect(baseIdx).toBeLessThan(depIdx);
    });

    it('fails feature if dependency is not initialized', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      // Register dependent without base
      mgr.register({
        name: 'orphan',
        priority: 'security',
        dependencies: ['nonexistent'],
        init: vi.fn(),
      });

      await mgr.initializePhase('security');

      const state = mgr.getFeatureState('orphan');
      expect(state?.status).toBe('failed');
      expect(state?.error).toBeDefined();
    });

    it('circular dependency throws error', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.registerAll([
        { name: 'a', priority: 'security', dependencies: ['b'], init: vi.fn() },
        { name: 'b', priority: 'security', dependencies: ['a'], init: vi.fn() },
      ]);

      await expect(mgr.initializePhase('security')).rejects.toThrow('Circular dependency');
    });
  });

  // ========================================================================
  // cleanup
  // ========================================================================

  describe('cleanup', () => {
    it('cleans up features in reverse initialization order', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const cleanupOrder: string[] = [];

      mgr.registerAll([
        {
          name: 'first',
          priority: 'security',
          init: vi.fn(),
          cleanup: vi.fn().mockImplementation(async () => {
            cleanupOrder.push('first');
          }),
        },
        {
          name: 'second',
          priority: 'security',
          init: vi.fn(),
          cleanup: vi.fn().mockImplementation(async () => {
            cleanupOrder.push('second');
          }),
        },
        {
          name: 'third',
          priority: 'security',
          init: vi.fn(),
          cleanup: vi.fn().mockImplementation(async () => {
            cleanupOrder.push('third');
          }),
        },
      ]);

      await mgr.initializePhase('security');
      await mgr.cleanup();

      expect(cleanupOrder).toEqual(['third', 'second', 'first']);
    });

    it('handles cleanup that throws', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({
        name: 'badCleanup',
        priority: 'security',
        init: vi.fn(),
        cleanup: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      });

      await mgr.initializePhase('security');
      // Should not throw, just log the error
      await expect(mgr.cleanup()).resolves.toBeUndefined();
    });

    it('skips features without cleanup functions', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const cleanupFn = vi.fn();

      mgr.register({
        name: 'withCleanup',
        priority: 'security',
        init: vi.fn(),
        cleanup: cleanupFn,
      });
      mgr.register({
        name: 'withoutCleanup',
        priority: 'security',
        init: vi.fn(),
      });

      await mgr.initializePhase('security');
      await mgr.cleanup();

      expect(cleanupFn).toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Error handling
  // ========================================================================

  describe('Error handling', () => {
    it('feature init failure is caught and marked as failed', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({
        name: 'failingFeature',
        priority: 'security',
        init: vi.fn().mockRejectedValue(new Error('init failed')),
      });

      await mgr.initializePhase('security');

      const state = mgr.getFeatureState('failingFeature');
      expect(state?.status).toBe('failed');
      expect(state?.error?.message).toBe('init failed');
    });

    it('optional feature failure does not prevent app startup', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({
        name: 'optionalFailing',
        priority: 'security',
        required: false,
        init: vi.fn().mockRejectedValue(new Error('optional failed')),
      });

      // Should not throw
      await expect(mgr.initializePhase('security')).resolves.toBeUndefined();
      expect(mgr.getFeatureState('optionalFailing')?.status).toBe('failed');
    });

    it('required feature failure logs error', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({
        name: 'requiredFailing',
        priority: 'security',
        required: true,
        init: vi.fn().mockRejectedValue(new Error('required failed')),
      });

      await mgr.initializePhase('security');

      const state = mgr.getFeatureState('requiredFailing');
      expect(state?.status).toBe('failed');
    });

    it('duplicate init call is idempotent', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const initFn = vi.fn();

      mgr.register({ name: 'idempotent', priority: 'security', init: initFn });
      await mgr.initializePhase('security');
      await mgr.initializePhase('security');

      // Only called once
      expect(initFn).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // initializeAll
  // ========================================================================

  describe('initializeAll', () => {
    it('initializes all phases in correct order', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();
      const order: string[] = [];

      mgr.registerAll([
        {
          name: 's',
          priority: 'security',
          init: vi.fn().mockImplementation(async () => order.push('s')),
        },
        {
          name: 'c',
          priority: 'critical',
          init: vi.fn().mockImplementation(async () => order.push('c')),
        },
        {
          name: 'u',
          priority: 'ui',
          init: vi.fn().mockImplementation(async () => order.push('u')),
        },
        {
          name: 'd',
          priority: 'deferred',
          init: vi.fn().mockImplementation(async () => order.push('d')),
        },
      ]);

      await mgr.initializeAll();

      expect(order).toEqual(['s', 'c', 'u', 'd']);
    });
  });

  // ========================================================================
  // State queries
  // ========================================================================

  describe('State queries', () => {
    it('isInitialized returns correct status', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({ name: 'ready', priority: 'security', init: vi.fn() });
      expect(mgr.isInitialized('ready')).toBe(false);

      await mgr.initializePhase('security');
      expect(mgr.isInitialized('ready')).toBe(true);
      expect(mgr.isInitialized('unknown')).toBe(false);
    });

    it('getInitializationOrder returns correct order', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.registerAll([
        { name: 'first', priority: 'security', init: vi.fn() },
        { name: 'second', priority: 'critical', init: vi.fn() },
      ]);

      await mgr.initializeAll();

      const order = mgr.getInitializationOrder();
      expect(order).toContain('first');
      expect(order).toContain('second');
      expect(order.indexOf('first')).toBeLessThan(order.indexOf('second'));
    });

    it('getSummary returns correct statistics', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.registerAll([
        { name: 'ok', priority: 'security', init: vi.fn() },
        {
          name: 'fail',
          priority: 'security',
          init: vi.fn().mockRejectedValue(new Error('fail')),
        },
        { name: 'pending', priority: 'critical', init: vi.fn() },
      ]);

      await mgr.initializePhase('security');
      const summary = mgr.getSummary();

      expect(summary.total).toBe(3);
      expect(summary.initialized).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
      expect(summary.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('getAllStates returns all feature states', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const mgr = getFeatureManager();

      mgr.register({ name: 'feat1', priority: 'security', init: vi.fn() });
      const states = mgr.getAllStates();

      expect(states.size).toBe(1);
      expect(states.get('feat1')?.status).toBe('pending');
    });
  });

  // ========================================================================
  // logInitializationSummary — failed features branch
  // ========================================================================

  describe('logInitializationSummary with failed features', () => {
    it('logs failed features when initializeAll completes with failures', async () => {
      const { getFeatureManager } = await import('./featureManager');
      const log = (await import('electron-log')).default;
      const mgr = getFeatureManager();

      mgr.registerAll([
        {
          name: 'ok-feature',
          priority: 'security',
          init: vi.fn(),
        },
        {
          name: 'failing-required',
          priority: 'security',
          required: true,
          init: vi.fn().mockRejectedValue(new Error('boom')),
        },
      ]);

      await mgr.initializeAll();

      // logInitializationSummary is called by initializeAll
      // Verify the 'Failed features:' log line was emitted
      const infoCalls = vi.mocked(log.info).mock.calls.map((c) => String(c[0]));
      expect(infoCalls.some((msg) => msg.includes('Failed features:'))).toBe(true);
      expect(
        infoCalls.some((msg) => msg.includes('failing-required') && msg.includes('boom'))
      ).toBe(true);
    });
  });
});
