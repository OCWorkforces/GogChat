/**
 * Security phase feature specs.
 *
 * Pure data — consumed at build time by `scripts/featurePlanPlugin.js` to compute
 * dependency batches and at runtime by `featureRunner` to drive initialization.
 *
 * Initialized BEFORE BrowserWindow construction.
 */

import type { FeatureSpec } from '../utils/lifecycle/featureConfigTypes.js';

export const SECURITY_FEATURES = [
  {
    name: 'reportExceptions',
    phase: 'security',
    required: true,
    description: 'Unhandled exception reporting',
    init: async () => {
      const module = await import('../features/reportExceptions.js');
      module.default();
    },
  },
  {
    name: 'mediaPermissions',
    phase: 'security',
    description: 'Proactive camera/microphone TCC permission check at startup',
    init: async (context) => {
      const module = await import('../features/mediaPermissions.js');
      await module.default(context);
    },
  },
] as const satisfies readonly FeatureSpec[];
