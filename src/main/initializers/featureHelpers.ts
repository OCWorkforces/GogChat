/**
 * Feature Registration Helpers
 *
 * Reduces boilerplate for common deferred feature registration patterns.
 */

import { BrowserWindow } from 'electron';
import { createLazyFeature } from '../utils/featureTypes.js';
import type { FeatureConfig } from '../utils/featureTypes.js';

/**
 * Creates a deferred feature that imports a module and calls its default export
 * with the main window (if available).
 *
 * This eliminates the repeated pattern:
 * ```
 * createLazyFeature('name', 'deferred', async () => {
 *   const module = await import('../features/name.js');
 *   return {
 *     default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
 *       if (mainWindow) { module.default(mainWindow); }
 *     },
 *   };
 * }, { description: '...' })
 * ```
 */
export function createMainWindowFeature(
  name: string,
  importFn: () => Promise<{ default: (window: BrowserWindow) => void }>,
  opts?: { dependencies?: string[]; description?: string }
): FeatureConfig {
  return createLazyFeature(
    name,
    'deferred',
    async () => {
      const module = await importFn();
      return {
        default: ({ mainWindow }: { mainWindow?: BrowserWindow | null }) => {
          if (mainWindow) {
            module.default(mainWindow);
          }
        },
      };
    },
    opts
  );
}
