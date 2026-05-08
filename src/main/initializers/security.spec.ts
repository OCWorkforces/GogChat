/**
 * Security phase feature specs.
 *
 * Pure data — consumed at build time by `scripts/featurePlanPlugin.js` to compute
 * dependency batches and at runtime by `featureRunner` to drive initialization.
 *
 * Initialized BEFORE BrowserWindow construction. Certificate pinning must precede
 * any HTTP request.
 */

import { perfMonitor } from '../utils/performanceMonitor.js';
import setupCertificatePinning, {
  cleanupCertificatePinning,
} from '../features/certificatePinning.js';
import type { FeatureSpec } from '../utils/featureConfigTypes.js';

export const SECURITY_FEATURES = [
  {
    name: 'certificatePinning',
    phase: 'security',
    required: true,
    description: 'SSL certificate validation for Google domains',
    init: () => {
      setupCertificatePinning();
      perfMonitor.mark('cert-pinning-done', 'Certificate pinning setup completed');
    },
    cleanup: () => {
      cleanupCertificatePinning();
    },
  },
  {
    name: 'reportExceptions',
    phase: 'security',
    required: true,
    description: 'Unhandled exception reporting',
    init: async () => {
      const module = await import('../features/reportExceptions.js');
      await module.default();
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
