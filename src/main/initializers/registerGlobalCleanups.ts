/**
 * Global Cleanup Registration
 *
 * Registers built-in global cleanup callbacks with the cleanup manager.
 * Uses lazy dynamic imports (in parallel via Promise.all) to avoid coupling at module load time.
 *
 * Cleanup callbacks registered:
 * - rateLimiter: Destroys the IPC rate limiter
 * - deduplicator: Destroys the IPC deduplicator
 * - ipcHandlers: Cleans up global IPC handlers
 * - iconCache: Clears the icon cache
 * - configCache: Clears the config cache
 */

import { getCleanupManager } from '../utils/resourceCleanup.js';

/**
 * Register all built-in global cleanup callbacks.
 *
 * Must be called after app.ready (lazy-imports util modules).
 */
export async function registerGlobalCleanups(): Promise<void> {
  const manager = getCleanupManager();
  const [
    { destroyRateLimiter },
    { destroyDeduplicator },
    { cleanupGlobalHandlers },
    { getIconCache: getIconCacheLazy },
    { clearConfigCache },
  ] = await Promise.all([
    import('../utils/rateLimiter.js'),
    import('../utils/ipcDeduplicator.js'),
    import('../utils/ipcHelper.js'),
    import('../utils/iconCache.js'),
    import('../utils/configCache.js'),
  ]);
  manager.registerGlobalCleanupCallback('rateLimiter', destroyRateLimiter, 'Rate limiter');
  manager.registerGlobalCleanupCallback('deduplicator', destroyDeduplicator, 'Deduplicator');
  manager.registerGlobalCleanupCallback('ipcHandlers', cleanupGlobalHandlers, 'IPC handlers');
  manager.registerGlobalCleanupCallback(
    'iconCache',
    () => getIconCacheLazy().clear(),
    'Icon cache'
  );
  manager.registerGlobalCleanupCallback('configCache', clearConfigCache, 'Config cache');
}
