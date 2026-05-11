/**
 * Critical + UI phase feature specs.
 *
 * Critical features run sequentially during app.whenReady().
 * UI features run after the main window is created (still in the critical path).
 */

import overrideUserAgent from '../features/userAgent.js';
import type { FeatureSpec } from '../utils/lifecycle/featureConfigTypes.js';

export const UI_FEATURES = [
  {
    name: 'userAgent',
    phase: 'critical',
    description: 'Custom User-Agent override',
    init: () => overrideUserAgent(),
  },
  {
    name: 'singleInstance',
    phase: 'ui',
    description: 'Single instance restoration handler',
    init: async ({ accountWindowManager }) => {
      const { restoreFirstInstance } = await import('../features/singleInstance.js');
      restoreFirstInstance(accountWindowManager ? { accountWindowManager } : {});
    },
  },
  {
    name: 'deepLinkHandler',
    phase: 'ui',
    description: 'Custom protocol (gogchat://) handler',
    init: async ({ accountWindowManager }) => {
      const module = await import('../features/deepLinkHandler.js');
      module.default(accountWindowManager ? { accountWindowManager } : {});
    },
    cleanup: async () => {
      const module = await import('../features/deepLinkHandler.js');
      module.cleanupDeepLinkHandler();
    },
  },
] as const satisfies readonly FeatureSpec[];
