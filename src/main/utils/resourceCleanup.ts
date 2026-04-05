/**
 * Resource Cleanup Utility
 * Manages cleanup of resources when window closes or app quits
 * Prevents memory leaks and ensures graceful shutdown
 */

import { logger } from './logger.js';
import { toErrorMessage } from './errorUtils.js';
import type { EventHandler, EventTarget, CleanupConfig } from './cleanupTypes.js';

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
  private globalCleanupCallbacks = new Map<string, { cleanup: () => void; label: string }>();

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
   * Register a global cleanup callback
   * Replaces direct imports — util modules register their cleanup lazily
   */
  registerGlobalCleanupCallback(id: string, cleanup: () => void, label?: string): void {
    this.globalCleanupCallbacks.set(id, {
      cleanup,
      label: label ?? id,
    });
    this.log.debug(`Registered global cleanup callback: ${id}`);
  }

  /**
   * Get IDs of all registered global cleanup callbacks
   */
  getRegisteredCallbackIds(): string[] {
    return Array.from(this.globalCleanupCallbacks.keys());
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

    for (const [_id, { cleanup, label }] of this.globalCleanupCallbacks) {
      try {
        cleanup();
        this.log.debug(`${label} cleaned up`);
      } catch (error: unknown) {
        this.log.debug(`Failed to cleanup ${label}:`, toErrorMessage(error));
      }
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
    this.globalCleanupCallbacks.clear();
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
