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
import { cleanupAll } from '../utils/lifecycle/featureRunner.js';
import { getSharedFeatureContext } from '../utils/lifecycle/featureContextStore.js';
import { getCleanupManager } from '../utils/lifecycle/resourceCleanup.js';
import { destroyAccountWindowManager } from '../utils/account/accountWindowManager.js';
import { destroyAllSingletons } from './singletonDestroyers.js';
import { logShutdownDiagnostics } from './shutdownDiagnostics.js';

async function runShutdownStage(name: string, cleanup: () => void | Promise<void>): Promise<void> {
  try {
    await cleanup();
  } catch (error: unknown) {
    log.error(`[Main] ${name} failed:`, error);
  }
}

/**
 * Register the application shutdown handler.
 *
 * Cleanup order:
 * 1. Feature cleanup via featureRunner (reverse init order)
 * 2. Global resource cleanup
 * 3. Account window manager destruction
 * 4. Comprehensive cache statistics logging
 * 5. Singleton destruction (performance monitor, deduplicator, rate limiter, icon cache)
 * 6. app.exit() to allow quit to proceed
 */
export function registerShutdownHandler(): void {
  let isShuttingDown = false;

  app.on('before-quit', (event) => {
    event.preventDefault(); // Prevent immediate quit until cleanup is done
    if (isShuttingDown) return;
    isShuttingDown = true;

    void (async () => {
      log.info('[Main] ========== Application Shutdown ==========');

      log.info('[Main] Cleaning up feature resources...');
      await runShutdownStage('Feature cleanup', () => cleanupAll(getSharedFeatureContext()));
      await runShutdownStage('Global resource cleanup', () =>
        getCleanupManager().cleanup({ includeGlobalResources: true, logDetails: true })
      );
      await runShutdownStage('Account window manager cleanup', destroyAccountWindowManager);
      await runShutdownStage('Shutdown diagnostics', logShutdownDiagnostics);
      await runShutdownStage('Singleton destruction', destroyAllSingletons);

      log.info('[Main] =====================================================');
    })().finally(() => app.exit());
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
