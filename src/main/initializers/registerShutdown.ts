/**
 * Shutdown Handler Initializer
 *
 * Extracts the before-quit handler from index.ts.
 * Handles graceful shutdown with async cleanup. Diagnostics logging is
 * delegated to `shutdownDiagnostics.ts` and singleton destruction to
 * `singletonDestroyers.ts`.
 */

import { app } from 'electron';
import log from 'electron-log';
import type { FeatureManager } from '../utils/featureManager.js';
import { destroyAccountWindowManager } from '../utils/accountWindowManager.js';
import { destroyAllSingletons } from './singletonDestroyers.js';
import { logShutdownDiagnostics } from './shutdownDiagnostics.js';

/**
 * Register the application shutdown handler.
 *
 * Cleanup order:
 * 1. FeatureManager cleanup (reverse init order)
 * 2. Account window manager destruction
 * 3. Singleton destruction (performance monitor, deduplicator, rate limiter, icon cache)
 * 4. Comprehensive cache statistics logging
 * 5. app.exit() to allow quit to proceed
 */
export function registerShutdownHandler(deps: { featureManager: FeatureManager }): void {
  const { featureManager } = deps;

  app.on('before-quit', (event) => {
    event.preventDefault(); // Prevent immediate quit until cleanup is done

    void (async () => {
      try {
        log.info('[Main] ========== Application Shutdown ==========');

        // FeatureManager handles cleanup in reverse initialization order
        log.info('[Main] Cleaning up feature resources...');
        await featureManager.cleanup();
        log.info('[Main] Feature cleanup completed');

        // Cleanup account window manager AFTER feature cleanup
        try {
          destroyAccountWindowManager();
          log.info('[Main] Account window manager cleaned up');
        } catch (error: unknown) {
          log.error('[Main] Account window manager cleanup failed:', error);
        }

        // Destroy singleton instances that have destroyXxx() but aren't called in normal shutdown
        try {
          destroyAllSingletons();
          log.info('[Main] Singleton instances destroyed');
        } catch (error: unknown) {
          log.error('[Main] Singleton destruction failed:', error);
        }

        // Log comprehensive cache statistics
        logShutdownDiagnostics(featureManager);

        log.info('[Main] =====================================================');
      } catch (error: unknown) {
        log.error('[Main] Error during shutdown cleanup:', error);
      } finally {
        app.exit(); // Allow quit to proceed
      }
    })();
  });
}
