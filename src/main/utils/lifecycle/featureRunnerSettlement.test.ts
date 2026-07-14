import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FeatureContext, FeaturePriority, FeatureSpec } from './featureConfigTypes.js';

const { featurePlan } = vi.hoisted(() => {
  const featurePlan: Record<FeaturePriority, FeatureSpec[][]> = {
    security: [],
    critical: [],
    ui: [],
    deferred: [],
  };

  return { featurePlan };
});

vi.mock('electron-log', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../generated/featurePlan.js', () => ({ FEATURE_PLAN: featurePlan }));

vi.mock('./performanceMonitor.js', () => ({
  perfMonitor: { mark: vi.fn() },
}));

vi.mock('../platform/platformDetection.js', () => ({
  platform: { name: 'darwin' },
}));

import { _getInitializedForTest, cleanupAll, runPhase } from './featureRunner.js';

const context: FeatureContext = {};

function resetFeaturePlan(): void {
  featurePlan.security = [];
  featurePlan.critical = [];
  featurePlan.ui = [];
  featurePlan.deferred = [];
}

afterEach(() => {
  resetFeaturePlan();
});

describe('featureRunner', () => {
  it('waits for concurrent sibling settlement before propagating a required failure', async () => {
    const trace: string[] = [];
    const requiredInit = Promise.withResolvers<void>();
    const siblingInit = Promise.withResolvers<void>();
    const requiredError = new Error('required init failed');
    const requiredFeature: FeatureSpec = {
      name: 'required',
      phase: 'security',
      required: true,
      init: () => {
        trace.push('required:start');
        return requiredInit.promise;
      },
    };
    const siblingFeature: FeatureSpec = {
      name: 'sibling',
      phase: 'security',
      init: () => {
        trace.push('sibling:start');
        return siblingInit.promise;
      },
    };
    featurePlan.security = [[requiredFeature, siblingFeature]];

    const phase = runPhase('security', context);
    let phaseSettled = false;
    void phase.catch(() => {
      phaseSettled = true;
    });

    expect(trace).toEqual(['required:start', 'sibling:start']);

    requiredInit.reject(requiredError);
    for (let microtask = 0; microtask < 8; microtask += 1) {
      await Promise.resolve();
    }

    expect(phaseSettled).toBe(false);
    expect(_getInitializedForTest()).toEqual([]);

    siblingInit.resolve();

    await expect(phase).rejects.toBe(requiredError);
    expect(_getInitializedForTest()).toEqual([siblingFeature]);

    await cleanupAll(context);
  });

  it('cleans up reverse completion order sequentially and continues after a failure', async () => {
    const cleanupTrace: string[] = [];
    const firstInit = Promise.withResolvers<void>();
    const secondInit = Promise.withResolvers<void>();
    const secondCleanup = Promise.withResolvers<void>();
    const firstCleanup = Promise.withResolvers<void>();
    const firstCleanupStarted = Promise.withResolvers<void>();
    const firstFeature: FeatureSpec = {
      name: 'first',
      phase: 'security',
      init: () => firstInit.promise,
      cleanup: () => {
        cleanupTrace.push('first:cleanup:start');
        firstCleanupStarted.resolve();
        return firstCleanup.promise;
      },
    };
    const secondFeature: FeatureSpec = {
      name: 'second',
      phase: 'security',
      init: () => secondInit.promise,
      cleanup: () => {
        cleanupTrace.push('second:cleanup:start');
        return secondCleanup.promise;
      },
    };
    featurePlan.security = [[firstFeature, secondFeature]];

    const phase = runPhase('security', context);
    firstInit.resolve();
    await Promise.resolve();
    secondInit.resolve();
    await phase;

    expect(_getInitializedForTest()).toEqual([firstFeature, secondFeature]);

    const cleanup = cleanupAll(context);

    expect(cleanupTrace).toEqual(['second:cleanup:start']);

    secondCleanup.reject(new Error('second cleanup failed'));
    await firstCleanupStarted.promise;

    expect(cleanupTrace).toEqual(['second:cleanup:start', 'first:cleanup:start']);

    firstCleanup.resolve();
    await cleanup;

    expect(_getInitializedForTest()).toEqual([]);
  });
});
