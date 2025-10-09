/**
 * IPC Helper Utility
 * Provides factory functions for creating secure, validated IPC handlers
 * Reduces boilerplate and ensures consistent security patterns
 */

import { ipcMain, IpcMainEvent, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { getRateLimiter } from './rateLimiter';
import { logger } from './logger';

/**
 * Configuration for creating a secure IPC handler
 */
export interface IPCHandlerConfig<T> {
  /** IPC channel name */
  channel: string;
  /** Validator function for incoming data */
  validator: (data: unknown) => T;
  /** Handler function for validated data */
  handler: (data: T, event: IpcMainEvent | IpcMainInvokeEvent) => void | Promise<void>;
  /** Optional rate limit (messages per second) */
  rateLimit?: number;
  /** Optional custom error handler */
  onError?: (error: Error, event: IpcMainEvent | IpcMainInvokeEvent) => void;
  /** Optional flag to skip logging */
  silent?: boolean;
  /** Optional description for logging */
  description?: string;
}

/**
 * Configuration for creating a reply-based IPC handler
 */
export interface IPCReplyHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  /** Handler that returns a response */
  handler: (data: T, event: IpcMainEvent) => R | Promise<R>;
  /** Reply channel name */
  replyChannel?: string;
}

/**
 * Configuration for creating an invoke handler (request/response)
 */
export interface IPCInvokeHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  /** Handler that returns a response */
  handler: (data: T, event: IpcMainInvokeEvent) => R | Promise<R>;
}

/**
 * Creates a secure IPC handler with validation and rate limiting
 * Use for one-way communication (renderer -> main)
 */
export function createSecureIPCHandler<T>(config: IPCHandlerConfig<T>): () => void {
  const { channel, validator, handler, rateLimit, onError, silent = false, description } = config;

  const rateLimiter = getRateLimiter();
  const log = logger.ipc;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void (async () => {
      try {
        // Rate limiting check
        if (rateLimit !== undefined && !rateLimiter.isAllowed(channel, rateLimit)) {
          if (!silent) {
            log.warn(`Rate limited: ${channel}`);
          }
          return;
        }

        // Validate input data
        const validated = validator(data);

        // Log the handler execution (if not silent)
        if (!silent) {
          log.debug(`Handling ${channel}${description ? ` (${description})` : ''}`);
        }

        // Execute handler with validated data
        await handler(validated, event);
      } catch (error) {
        const err = error as Error;

        if (!silent) {
          log.error(`Handler failed: ${channel}`, err.message);
        }

        // Call custom error handler if provided
        if (onError) {
          onError(err, event);
        }
      }
    })();
  };

  // Register the handler
  ipcMain.on(channel, secureHandler);

  // Return cleanup function
  return () => {
    ipcMain.removeListener(channel, secureHandler);
  };
}

/**
 * Creates a secure IPC handler that sends a reply
 * Use for request/response communication with event.reply()
 */
export function createSecureReplyHandler<T, R>(config: IPCReplyHandlerConfig<T, R>): () => void {
  const {
    channel,
    validator,
    handler,
    replyChannel,
    rateLimit,
    onError,
    silent = false,
    description,
  } = config;

  const rateLimiter = getRateLimiter();
  const log = logger.ipc;
  const responseChannel = replyChannel || `${channel}-reply`;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void (async () => {
      try {
        // Rate limiting check
        if (rateLimit !== undefined && !rateLimiter.isAllowed(channel, rateLimit)) {
          if (!silent) {
            log.warn(`Rate limited: ${channel}`);
          }
          event.reply(responseChannel, { error: 'Rate limited' });
          return;
        }

        // Validate input data
        const validated = validator(data);

        // Log the handler execution
        if (!silent) {
          log.debug(`Handling ${channel}${description ? ` (${description})` : ''}`);
        }

        // Execute handler and get response
        const response = await handler(validated, event);

        // Send reply
        event.reply(responseChannel, { success: true, data: response });
      } catch (error) {
        const err = error as Error;

        if (!silent) {
          log.error(`Reply handler failed: ${channel}`, err.message);
        }

        // Send error reply
        event.reply(responseChannel, { error: err.message });

        // Call custom error handler if provided
        if (onError) {
          onError(err, event);
        }
      }
    })();
  };

  // Register the handler
  ipcMain.on(channel, secureHandler);

  // Return cleanup function
  return () => {
    ipcMain.removeListener(channel, secureHandler);
  };
}

/**
 * Creates a secure invoke handler (async request/response)
 * Use with ipcRenderer.invoke() for promise-based communication
 */
export function createSecureInvokeHandler<T, R>(config: IPCInvokeHandlerConfig<T, R>): () => void {
  const { channel, validator, handler, rateLimit, onError, silent = false, description } = config;

  const rateLimiter = getRateLimiter();
  const log = logger.ipc;

  const secureHandler = async (event: IpcMainInvokeEvent, data: unknown): Promise<R> => {
    try {
      // Rate limiting check
      if (rateLimit !== undefined && !rateLimiter.isAllowed(channel, rateLimit)) {
        if (!silent) {
          log.warn(`Rate limited: ${channel}`);
        }
        throw new Error('Rate limited');
      }

      // Validate input data
      const validated = validator(data);

      // Log the handler execution
      if (!silent) {
        log.debug(`Handling invoke ${channel}${description ? ` (${description})` : ''}`);
      }

      // Execute handler and return response
      return await handler(validated, event);
    } catch (error) {
      const err = error as Error;

      if (!silent) {
        log.error(`Invoke handler failed: ${channel}`, err.message);
      }

      // Call custom error handler if provided
      if (onError) {
        onError(err, event);
      }

      // Re-throw for invoke error handling
      throw err;
    }
  };

  // Register the handler
  ipcMain.handle(channel, secureHandler);

  // Return cleanup function
  return () => {
    ipcMain.removeHandler(channel);
  };
}

/**
 * Creates a handler that broadcasts to all windows
 */
export function createBroadcastHandler<T>(config: {
  channel: string;
  validator: (data: unknown) => T;
  filter?: (window: BrowserWindow, data: T) => boolean;
}): (data: unknown) => void {
  return (data: unknown) => {
    try {
      const validated = config.validator(data);
      const windows = BrowserWindow.getAllWindows();

      windows.forEach((window) => {
        if (!config.filter || config.filter(window, validated)) {
          window.webContents.send(config.channel, validated);
        }
      });
    } catch (error) {
      logger.ipc.error(`Broadcast failed: ${config.channel}`, error);
    }
  };
}

/**
 * Creates a handler that sends to a specific window
 */
export function sendToWindow<T>(
  window: BrowserWindow | null,
  channel: string,
  data: T,
  validator?: (data: T) => T
): boolean {
  try {
    if (!window || window.isDestroyed()) {
      logger.ipc.warn(`Window not available for channel: ${channel}`);
      return false;
    }

    const validated = validator ? validator(data) : data;
    window.webContents.send(channel, validated);
    return true;
  } catch (error) {
    logger.ipc.error(`Failed to send to window: ${channel}`, error);
    return false;
  }
}

/**
 * Batch register multiple handlers
 */
export class IPCHandlerManager {
  private cleanupFunctions: Array<() => void> = [];

  /**
   * Register a secure handler
   */
  register<T>(config: IPCHandlerConfig<T>): void {
    const cleanup = createSecureIPCHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * Register a reply handler
   */
  registerReply<T, R>(config: IPCReplyHandlerConfig<T, R>): void {
    const cleanup = createSecureReplyHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * Register an invoke handler
   */
  registerInvoke<T, R>(config: IPCInvokeHandlerConfig<T, R>): void {
    const cleanup = createSecureInvokeHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  /**
   * Clean up all registered handlers
   */
  cleanup(): void {
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];
  }
}

/**
 * Global IPC handler manager instance
 */
let globalManager: IPCHandlerManager | null = null;

/**
 * Get or create the global IPC handler manager
 */
export function getIPCManager(): IPCHandlerManager {
  if (!globalManager) {
    globalManager = new IPCHandlerManager();
  }
  return globalManager;
}

/**
 * Clean up all global handlers
 */
export function cleanupGlobalHandlers(): void {
  if (globalManager) {
    globalManager.cleanup();
    globalManager = null;
  }
}

/**
 * Common validators that can be reused
 */
export const commonValidators = {
  /** Validates that data is a non-null object */
  isObject: (data: unknown): Record<string, unknown> => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Expected object');
    }
    return data as Record<string, unknown>;
  },

  /** Validates that data is a string */
  isString: (data: unknown): string => {
    if (typeof data !== 'string') {
      throw new Error('Expected string');
    }
    return data;
  },

  /** Validates that data is a number */
  isNumber: (data: unknown): number => {
    if (typeof data !== 'number' || isNaN(data)) {
      throw new Error('Expected valid number');
    }
    return data;
  },

  /** Validates that data is a boolean */
  isBoolean: (data: unknown): boolean => {
    if (typeof data !== 'boolean') {
      throw new Error('Expected boolean');
    }
    return data;
  },

  /** Pass-through validator (no validation) */
  passthrough: <T>(data: unknown): T => data as T,
};
