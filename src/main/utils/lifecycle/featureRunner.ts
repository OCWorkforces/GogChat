/**
 * Feature Runner
 *
 * Walks the build-time `FEATURE_PLAN` (precomputed phase → dependency-batched
 * spec arrays) and drives feature lifecycle. Replaces the previous 485-line
 * `FeatureManager` class — the topological sort now runs at build time inside
 * `scripts/featurePlanPlugin.js`.
 *
 * @module featureRunner
 */

import log from 'electron-log';
import { FEATURE_PLAN } from '../../generated/featurePlan.js';
import type { FeatureContext, FeaturePriority, FeatureSpec } from './featureConfigTypes.js';
import { asType } from '../../../shared/typeUtils.js';

const PHASES: readonly FeaturePriority[] = ['security', 'critical', 'ui', 'deferred'];

/** Features that have been initialized, in init order, for reverse-order cleanup. */
const initialized: FeatureSpec[] = [];

/** Initialize every feature in a single phase. Batches run sequentially; specs within a batch run in parallel. */
export async function runPhase(phase: FeaturePriority, context: FeatureContext): Promise<void> {
  const batches = FEATURE_PLAN[phase];
  if (!batches.length) {
    log.debug(`[FeatureRunner] No features in phase: ${phase}`);
    return;
  }

  const phaseStart = Date.now();
  const total = batches.reduce((n, b) => n + b.length, 0);
  log.info(`[FeatureRunner] Phase '${phase}': ${total} feature(s) in ${batches.length} batch(es)`);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    log.debug(
      `[FeatureRunner] Batch ${i + 1}/${batches.length}: ${batch.map((s) => s.name).join(', ')}`
    );
    await Promise.all(batch.map((spec) => runFeature(spec, context)));
  }

  log.info(`[FeatureRunner] Phase '${phase}' completed in ${Date.now() - phaseStart}ms`);
}

/** Run every phase in order. */
export async function runAllPhases(context: FeatureContext): Promise<void> {
  for (const phase of PHASES) await runPhase(phase, context);
}

/** Run every spec's optional cleanup in reverse-init order, grouped per phase. */
export async function cleanupAll(context: FeatureContext): Promise<void> {
  log.info('[FeatureRunner] Starting feature cleanup');
  const reversed = [...initialized].reverse();
  const results = await Promise.allSettled(
    reversed
      .filter((s) => typeof s.cleanup === 'function')
      .map(async (s) => {
        await s.cleanup!(context);
        log.debug(`[FeatureRunner] ✓ cleaned up ${s.name}`);
      })
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    if (r.status === 'rejected') {
      log.error(`[FeatureRunner] ✗ cleanup failed:`, r.reason);
    }
  }
  initialized.length = 0;
  log.info('[FeatureRunner] Feature cleanup completed');
}

async function runFeature(spec: FeatureSpec, context: FeatureContext): Promise<void> {
  const start = Date.now();
  try {
    await spec.init(context);
    initialized.push(spec);
    log.info(
      `[FeatureRunner] ✓ ${spec.name} (${Date.now() - start}ms)${spec.description ? ` — ${spec.description}` : ''}`
    );
  } catch (error) {
    if (spec.required) {
      log.error(`[FeatureRunner] ✗ REQUIRED feature '${spec.name}' failed:`, error);
      throw error;
    }
    log.warn(`[FeatureRunner] ✗ optional feature '${spec.name}' failed:`, error);
  }
}

/** Test/diagnostic accessor. */
export function _getInitializedForTest(): readonly FeatureSpec[] {
  return [...initialized];
}

/** Diagnostic summary of feature plan + runtime state. */
export function getSummary(): {
  total: number;
  initialized: number;
  byPhase: Record<FeaturePriority, number>;
} {
  const byPhase = asType<Record<FeaturePriority, number>>({});
  let total = 0;
  for (const phase of PHASES) {
    const count = FEATURE_PLAN[phase].reduce((n, b) => n + b.length, 0);
    byPhase[phase] = count;
    total += count;
  }
  return { total, initialized: initialized.length, byPhase };
}
