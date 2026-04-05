/**
 * Tracked Resource Helpers
 * Standalone helper functions for creating tracked intervals, timeouts,
 * event listeners, and cleanup tasks. All functions delegate to the
 * global ResourceCleanupManager via getCleanupManager().
 */

import { BrowserWindow, ipcMain } from 'electron';
import { getCleanupManager } from './resourceCleanup.js';
import { logger } from './logger.js';
import { toErrorMessage } from './errorUtils.js';

import type { EventHandler, EventTarget } from './cleanupTypes.js';

/**
 * Setup window cleanup handlers
 */
export function setupWindowCleanup(window: BrowserWindow): void {
  const manager = getCleanupManager();
  const log = logger.window;

  // Register window-specific cleanup tasks
  manager.registerTasks([
    {
      name: 'Remove all IPC listeners',
      cleanup: () => {
        ipcMain.removeAllListeners();
      },
    },
    {
      name: 'Clear web contents session cache',
      cleanup: async () => {
        if (!window.isDestroyed()) {
          await window.webContents.session.clearCache();
        }
      },
    },
    {
      name: 'Clear web contents storage data',
      cleanup: async () => {
        if (!window.isDestroyed()) {
          await window.webContents.session.clearStorageData({
            storages: ['cookies', 'localstorage'],
          });
        }
      },
    },
  ]);

  // Handle window close event
  window.on('close', (_event) => {
    // Don't prevent close, just clean up
    log.debug('Window closing, performing cleanup...');

    void (async () => {
      try {
        await manager.cleanup({
          window,
          includeGlobalResources: false,
          logDetails: process.env.NODE_ENV === 'development',
        });
      } catch (error: unknown) {
        log.error('Cleanup failed during window close:', toErrorMessage(error));
      }
    })();
  });

  // Handle window closed event (after close)
  window.on('closed', () => {
    log.debug('Window closed');

    // Clear window reference
    manager.reset();
  });
}

/**
 * Helper to create a tracked interval
 */
export function createTrackedInterval(
  callback: () => void,
  delay: number,
  name?: string
): NodeJS.Timeout {
  const interval = setInterval(callback, delay);
  getCleanupManager().trackInterval(interval);

  if (name) {
    logger.main.debug(`Created tracked interval: ${name}`);
  }

  return interval;
}

/**
 * Helper to create a tracked timeout
 */
export function createTrackedTimeout(
  callback: () => void,
  delay: number,
  name?: string
): NodeJS.Timeout {
  const timeout = setTimeout(callback, delay);
  getCleanupManager().trackTimeout(timeout);

  if (name) {
    logger.main.debug(`Created tracked timeout: ${name}`);
  }

  return timeout;
}

/**
 * Helper to add a tracked event listener
 */
export function addTrackedListener(
  target: EventTarget,
  event: string,
  handler: EventHandler,
  name?: string
): void {
  if (target && target.on) {
    target.on(event, handler);
  } else if (target && target.addEventListener) {
    target.addEventListener(event, handler);
  } else {
    throw new Error(`Target does not support event listeners: ${event}`);
  }

  getCleanupManager().trackListener(target, event, handler);

  if (name) {
    logger.main.debug(`Added tracked listener: ${name} for ${event}`);
  }
}

/**
 * Register a custom cleanup task
 */
export function registerCleanupTask(
  name: string,
  cleanup: () => void | Promise<void>,
  critical = false
): void {
  getCleanupManager().registerTask({ name, cleanup, critical });
}
