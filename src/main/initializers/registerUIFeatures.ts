/**
 * Critical + UI Phase Feature Registration
 *
 * Critical features must be initialized during app.whenReady() (sequential).
 * UI features are minimal — only the single-instance handler is synchronous.
 */

import { createFeature } from '../utils/featureManager.js';
import type { FeatureManager } from '../utils/featureManager.js';
import overrideUserAgent from '../features/userAgent.js';

export function registerUIFeatures(featureManager: FeatureManager): void {
  featureManager.registerAll([
    // ===== CRITICAL PHASE =====
    // Core features that must be initialized during app.whenReady (sequential)
    createFeature('userAgent', 'critical', () => overrideUserAgent(), {
      description: 'Custom User-Agent override',
    }),

    // ===== UI PHASE =====
    // Minimal UI - only single instance handler synchronous
    createFeature(
      'singleInstance',
      'ui',
      async ({ accountWindowManager }) => {
        const { restoreFirstInstance } = await import('../features/singleInstance.js');
        // Pass account window manager for dynamic window lookup on second-instance
        restoreFirstInstance(accountWindowManager ? { accountWindowManager } : {});
      },
      {
        description: 'Single instance restoration handler',
      }
    ),

    createFeature(
      'deepLinkHandler',
      'ui',
      async ({ accountWindowManager }) => {
        const module = await import('../features/deepLinkHandler.js');
        // Pass account window manager for dynamic window lookup
        module.default(accountWindowManager ? { accountWindowManager } : {});
      },
      {
        cleanup: async () => {
          const module = await import('../features/deepLinkHandler.js');
          module.cleanupDeepLinkHandler();
        },
        description: 'Custom protocol (gogchat://) handler',
      }
    ),
  ]);
}
