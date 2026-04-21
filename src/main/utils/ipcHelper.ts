/** Secure IPC handler factories with validation and rate limiting */

import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { ipcMain, BrowserWindow } from 'electron';
import type { IPCResponse } from '../../shared/types/ipc.js';
import { getRateLimiter } from './rateLimiter.js';
import { logger } from './logger.js';
import { toError, toErrorMessage } from './errorUtils.js';

/** Configuration for creating a secure IPC handler */
export interface IPCHandlerConfig<T> {
  channel: string;
  validator: (data: unknown) => T;
  handler: (data: T, event: IpcMainEvent | IpcMainInvokeEvent) => void | Promise<void>;
  rateLimit?: number;
  onError?: (error: Error, event: IpcMainEvent | IpcMainInvokeEvent) => void;
  silent?: boolean;
  description?: string;
}

/** Configuration for creating a reply-based IPC handler */
export interface IPCReplyHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: T, event: IpcMainEvent) => R | Promise<R>;
  replyChannel?: string;
}

/** Configuration for creating an invoke handler (request/response) */
export interface IPCInvokeHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: T, event: IpcMainInvokeEvent) => R | Promise<R>;
}

/** Common config fields shared by all secure handler types */
type BaseSecureConfig = Pick<
  IPCHandlerConfig<unknown>,
  'channel' | 'validator' | 'rateLimit' | 'onError' | 'silent' | 'description'
>;

/** Internal base handler: rate-limit → validate → log → execute → catch */
async function executeSecureHandler<T, R>(
  config: BaseSecureConfig,
  data: unknown,
  event: IpcMainEvent | IpcMainInvokeEvent,
  execute: (validated: T) => R | Promise<R>,
  options: {
    debugLabel: string;
    errorLabel: string;
    onRateLimited?: () => void;
    beforeOnError?: (err: Error) => void;
    afterOnError?: (err: Error) => void;
  }
): Promise<R | undefined> {
  const { channel, validator, rateLimit, onError, silent = false, description } = config;
  const rateLimiter = getRateLimiter();
  const log = logger.ipc;

  try {
    if (rateLimit !== undefined && !rateLimiter.isAllowed(channel, rateLimit)) {
      if (!silent) {
        log.warn(`Rate limited: ${channel}`);
      }
      options.onRateLimited?.();
      return undefined;
    }

    const validated = validator(data) as T;

    if (!silent) {
      log.debug(`${options.debugLabel}${channel}${description ? ` (${description})` : ''}`);
    }

    return await execute(validated);
  } catch (error: unknown) {
    const err = toError(error);

    if (!silent) {
      log.error(`${options.errorLabel}${channel}`, err.message);
    }

    options.beforeOnError?.(err);

    if (onError) {
      onError(err, event);
    }

    options.afterOnError?.(err);
    return undefined;
  }
}

/** One-way IPC handler (renderer → main) */
export function createSecureIPCHandler<T>(config: IPCHandlerConfig<T>): () => void {
  const { handler } = config;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void executeSecureHandler<T, void>(
      config,
      data,
      event,
      (validated) => handler(validated, event),
      {
        debugLabel: 'Handling ',
        errorLabel: 'Handler failed: ',
      }
    );
  };

  ipcMain.on(config.channel, secureHandler);
  return () => {
    ipcMain.removeListener(config.channel, secureHandler);
  };
}

/** Reply-based IPC handler using event.reply() */
export function createSecureReplyHandler<T, R>(config: IPCReplyHandlerConfig<T, R>): () => void {
  const { handler, replyChannel } = config;
  const responseChannel = replyChannel || `${config.channel}-reply`;

  const secureHandler = (event: IpcMainEvent, data: unknown) => {
    void executeSecureHandler<T, void>(
      config,
      data,
      event,
      async (validated) => {
        const response = await handler(validated, event);
        event.reply(responseChannel, { success: true, data: response } satisfies IPCResponse<R>);
      },
      {
        debugLabel: 'Handling ',
        errorLabel: 'Reply handler failed: ',
        onRateLimited: () => {
          event.reply(responseChannel, {
            success: false,
            error: 'Rate limited',
          } satisfies IPCResponse<R>);
        },
        beforeOnError: (err) => {
          event.reply(responseChannel, {
            success: false,
            error: err.message,
          } satisfies IPCResponse<R>);
        },
      }
    );
  };

  ipcMain.on(config.channel, secureHandler);
  return () => {
    ipcMain.removeListener(config.channel, secureHandler);
  };
}

/** Invoke-based IPC handler for ipcRenderer.invoke() */
export function createSecureInvokeHandler<T, R>(config: IPCInvokeHandlerConfig<T, R>): () => void {
  const { handler } = config;

  const secureHandler = async (event: IpcMainInvokeEvent, data: unknown): Promise<R> => {
    const result = await executeSecureHandler<T, R>(
      config,
      data,
      event,
      (validated) => handler(validated, event),
      {
        debugLabel: 'Handling invoke ',
        errorLabel: 'Invoke handler failed: ',
        onRateLimited: () => {
          throw new Error('Rate limited');
        },
        afterOnError: (err) => {
          throw err;
        },
      }
    );
    return result as R;
  };

  ipcMain.handle(config.channel, secureHandler);
  return () => {
    ipcMain.removeHandler(config.channel);
  };
}

/** Broadcasts to all windows */
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
    } catch (error: unknown) {
      logger.ipc.error(`Broadcast failed: ${config.channel}`, toErrorMessage(error));
    }
  };
}

/** Sends to a specific window */
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
  } catch (error: unknown) {
    logger.ipc.error(`Failed to send to window: ${channel}`, toErrorMessage(error));
    return false;
  }
}

/** Batch register/cleanup multiple handlers */
export class IPCHandlerManager {
  private cleanupFunctions: Array<() => void> = [];

  register<T>(config: IPCHandlerConfig<T>): void {
    const cleanup = createSecureIPCHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  registerReply<T, R>(config: IPCReplyHandlerConfig<T, R>): void {
    const cleanup = createSecureReplyHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  registerInvoke<T, R>(config: IPCInvokeHandlerConfig<T, R>): void {
    const cleanup = createSecureInvokeHandler(config);
    this.cleanupFunctions.push(cleanup);
  }

  cleanup(): void {
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];
  }
}

let globalManager: IPCHandlerManager | null = null;

export function getIPCManager(): IPCHandlerManager {
  if (!globalManager) {
    globalManager = new IPCHandlerManager();
  }
  return globalManager;
}

export function cleanupGlobalHandlers(): void {
  if (globalManager) {
    globalManager.cleanup();
    globalManager = null;
  }
}
