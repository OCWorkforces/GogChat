/**
 * Resource Cleanup Utility
 * Manages cleanup of resources when window closes or app quits
 * Prevents memory leaks and ensures graceful shutdown
 */

import { BrowserWindow, ipcMain } from 'electron';
import { logger } from './logger.js';
import { destroyRateLimiter } from './rateLimiter.js';
import { destroyDeduplicator } from './ipcDeduplicator.js';
import { cleanupGlobalHandlers } from './ipcHelper.js';
import { getIconCache } from './iconCache.js';
import { clearConfigCache } from './configCache.js';
import { toErrorMessage } from './errorHandler.js';

/**
 * Type for event handler functions
 */
type EventHandler = (...args: unknown[]) => void;

/**
 * Type for event target with listener methods
 */
interface EventTarget {
  on?: (event: string, handler: EventHandler) => void;
  addEventListener?: (event: string, handler: EventHandler) => void;
  removeListener?: (event: string, handler: EventHandler) => void;
  off?: (event: string, handler: EventHandler) => void;
}

/**
 * Resource cleanup configuration
 */
export interface CleanupConfig {
  window?: BrowserWindow;
  includeGlobalResources?: boolean;
  logDetails?: boolean;
}

/**
 * Cleanup task
 */
interface CleanupTask {
  name: string;
  cleanup: () => void | Promise<void>;
  critical?: boolean; // Whether failure should be logged as error
}

/**
 * Resource Cleanup Manager
 * Centralizes cleanup of various resources
 */
export class ResourceCleanupManager {
  private tasks: CleanupTask[] = [];
  private intervals = new Set<NodeJS.Timeout>();
  private timeouts = new Set<NodeJS.Timeout>();
  private listeners: Array<{
    target: EventTarget;
    event: string;
    handler: EventHandler;
  }> = [];
  private readonly log = logger.feature('ResourceCleanup');
  private isCleaningUp = false;
  private cleanupPromise: Promise<void> | null = null;

  /**
   * Register a cleanup task
   */
  registerTask(task: CleanupTask): void {
    this.tasks.push(task);
    this.log.debug(`Registered cleanup task: ${task.name}`);
  }

  /**
   * Register multiple cleanup tasks
   */
  registerTasks(tasks: CleanupTask[]): void {
    tasks.forEach((task) => this.registerTask(task));
  }

  /**
   * Track an interval for cleanup
   */
  trackInterval(interval: NodeJS.Timeout): void {
    this.intervals.add(interval);
  }

  /**
   * Track a timeout for cleanup
   */
  trackTimeout(timeout: NodeJS.Timeout): void {
    this.timeouts.add(timeout);
  }

  /**
   * Track an event listener for cleanup
   */
  trackListener(target: EventTarget, event: string, handler: EventHandler): void {
    this.listeners.push({ target, event, handler });
  }

  /**
   * Clean up all tracked intervals
   */
  private cleanupIntervals(): void {
    this.log.debug(`Cleaning up ${this.intervals.size} intervals`);
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }

  /**
   * Clean up all tracked timeouts
   */
  private cleanupTimeouts(): void {
    this.log.debug(`Cleaning up ${this.timeouts.size} timeouts`);
    for (const timeout of this.timeouts) {
      clearTimeout(timeout);
    }
    this.timeouts.clear();
  }

  /**
   * Clean up all tracked event listeners
   */
  private cleanupListeners(): void {
    this.log.debug(`Cleaning up ${this.listeners.length} event listeners`);
    for (const { target, event, handler } of this.listeners) {
      try {
        if (target && target.removeListener) {
          target.removeListener(event, handler);
        } else if (target && target.off) {
          target.off(event, handler);
        }
      } catch (error: unknown) {
        this.log.debug(`Failed to remove listener for ${event}:`, toErrorMessage(error));
      }
    }
    this.listeners = [];
  }

  /**
   * Execute all cleanup tasks
   */
  async cleanup(config: CleanupConfig = {}): Promise<void> {
    // Prevent multiple concurrent cleanups
    if (this.isCleaningUp) {
      if (this.cleanupPromise) {
        return this.cleanupPromise;
      }
      return;
    }

    this.isCleaningUp = true;
    this.cleanupPromise = this.performCleanup(config);

    try {
      await this.cleanupPromise;
    } finally {
      this.isCleaningUp = false;
      this.cleanupPromise = null;
    }
  }

  /**
   * Perform the actual cleanup
   */
  private async performCleanup(config: CleanupConfig): Promise<void> {
    const startTime = Date.now();
    this.log.info('Starting resource cleanup...');

    // Clean up basic tracked resources
    this.cleanupIntervals();
    this.cleanupTimeouts();
    this.cleanupListeners();

    // Execute registered cleanup tasks
    for (const task of this.tasks) {
      try {
        if (config.logDetails) {
          this.log.debug(`Running cleanup task: ${task.name}`);
        }
        await task.cleanup();
      } catch (error: unknown) {
        if (task.critical) {
          this.log.error(`Critical cleanup task failed: ${task.name}`, toErrorMessage(error));
        } else {
          this.log.debug(`Cleanup task failed: ${task.name}`, toErrorMessage(error));
        }
      }
    }

    // Clean up global resources if requested
    if (config.includeGlobalResources) {
      this.cleanupGlobalResources();
    }

    const elapsed = Date.now() - startTime;
    this.log.info(`Resource cleanup completed in ${elapsed}ms`);
  }

  /**
   * Clean up global application resources
   */
  private cleanupGlobalResources(): void {
    this.log.debug('Cleaning up global resources...');

    try {
      // Clean up IPC handlers
      cleanupGlobalHandlers();
      this.log.debug('IPC handlers cleaned up');
    } catch (error: unknown) {
      this.log.debug('Failed to cleanup IPC handlers:', toErrorMessage(error));
    }

    try {
      // Clean up rate limiter
      destroyRateLimiter();
      this.log.debug('Rate limiter cleaned up');
    } catch (error: unknown) {
      this.log.debug('Failed to cleanup rate limiter:', toErrorMessage(error));
    }

    try {
      // Clean up deduplicator
      destroyDeduplicator();
      this.log.debug('Deduplicator cleaned up');
    } catch (error: unknown) {
      this.log.debug('Failed to cleanup deduplicator:', toErrorMessage(error));
    }

    try {
      // Clear icon cache
      const iconCache = getIconCache();
      iconCache.clear();
      this.log.debug('Icon cache cleared');
    } catch (error: unknown) {
      this.log.debug('Failed to clear icon cache:', toErrorMessage(error));
    }

    try {
      // Clear config cache
      clearConfigCache();
      this.log.debug('Config cache cleared');
    } catch (error: unknown) {
      this.log.debug('Failed to clear config cache:', toErrorMessage(error));
    }
  }

  /**
   * Reset the manager
   */
  reset(): void {
    this.tasks = [];
    this.intervals.clear();
    this.timeouts.clear();
    this.listeners = [];
    this.isCleaningUp = false;
    this.cleanupPromise = null;
  }
}

/**
 * Global cleanup manager instance
 */
let globalManager: ResourceCleanupManager | null = null;

/**
 * Get or create the global cleanup manager
 */
export function getCleanupManager(): ResourceCleanupManager {
  if (!globalManager) {
    globalManager = new ResourceCleanupManager();
  }
  return globalManager;
}

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
    if (globalManager) {
      globalManager.reset();
    }
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
