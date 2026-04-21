/**
 * Global Cleanup Registration
 *
 * Registers built-in global cleanup callbacks with the cleanup manager.
 * Uses lazy dynamic imports to avoid coupling at module load time.
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
  const { destroyRateLimiter } = await import('../utils/rateLimiter.js');
  manager.registerGlobalCleanupCallback('rateLimiter', destroyRateLimiter, 'Rate limiter');
  const { destroyDeduplicator } = await import('../utils/ipcDeduplicator.js');
  manager.registerGlobalCleanupCallback('deduplicator', destroyDeduplicator, 'Deduplicator');
  const { cleanupGlobalHandlers } = await import('../utils/ipcHelper.js');
  manager.registerGlobalCleanupCallback('ipcHandlers', cleanupGlobalHandlers, 'IPC handlers');
  const { getIconCache: getIconCacheLazy } = await import('../utils/iconCache.js');
  manager.registerGlobalCleanupCallback(
    'iconCache',
    () => getIconCacheLazy().clear(),
    'Icon cache'
  );
  const { clearConfigCache } = await import('../utils/configCache.js');
  manager.registerGlobalCleanupCallback('configCache', clearConfigCache, 'Config cache');
}
