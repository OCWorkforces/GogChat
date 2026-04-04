/**
 * Security Phase Feature Registration
 *
 * These features are initialized BEFORE app.whenReady() for security.
 * Certificate pinning must precede any HTTP requests.
 */

import { perfMonitor } from '../utils/performanceMonitor.js';
import { createFeature, createLazyFeature } from '../utils/featureTypes.js';
import type { FeatureManager } from '../utils/featureManager.js';
import setupCertificatePinning, {
  cleanupCertificatePinning,
} from '../features/certificatePinning.js';

export function registerSecurityFeatures(featureManager: FeatureManager): void {
  featureManager.registerAll([
    createFeature(
      'certificatePinning',
      'security',
      () => {
        setupCertificatePinning();
        perfMonitor.mark('cert-pinning-done', 'Certificate pinning setup completed');
      },
      {
        cleanup: () => {
          cleanupCertificatePinning();
        },
        description: 'SSL certificate validation for Google domains',
        required: true,
      }
    ),

    createLazyFeature(
      'reportExceptions',
      'security',
      () => import('../features/reportExceptions.js'),
      {
        description: 'Unhandled exception reporting',
        required: true,
      }
    ),

    createLazyFeature(
      'mediaPermissions',
      'security',
      () => import('../features/mediaPermissions.js'),
      {
        description: 'Proactive camera/microphone TCC permission check at startup',
      }
    ),
  ]);
}
