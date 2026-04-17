/**
 * IPC Deduplication Patterns & Helpers
 * Common key-generation patterns and helper wrappers built on top of the
 * global IPCDeduplicator singleton.
 */

import { getDeduplicator } from './ipcDeduplicator.js';

/**
 * Common deduplication patterns
 */
export const deduplicationPatterns = {
  /**
   * Deduplicate by channel name
   */
  byChannel: (channel: string) => channel,

  /**
   * Deduplicate by channel and data hash
   */
  byChannelAndData: (channel: string, data: unknown) => {
    const dataHash = JSON.stringify(data);
    return `${channel}:${dataHash}`;
  },

  /**
   * Deduplicate by channel and first argument
   */
  byChannelAndFirstArg: (channel: string, arg: unknown) => {
    return `${channel}:${String(arg)}`;
  },

  /**
   * Deduplicate window operations
   */
  byWindowOperation: (operation: string, windowId?: number) => {
    return windowId ? `${operation}:${windowId}` : operation;
  },

  /**
   * Deduplicate file operations
   */
  byFileOperation: (operation: string, path: string) => {
    return `${operation}:${path}`;
  },
};

/**
 * Helper to create a deduplicated IPC handler
 */
export function createDeduplicatedHandler<T>(
  channel: string,
  handler: () => Promise<T>,
  windowMs = 100
): () => Promise<T> {
  const deduplicator = getDeduplicator();
  return () => deduplicator.deduplicate(channel, handler, windowMs);
}

/**
 * Helper to wrap an existing function with deduplication
 */
export function withDeduplication<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>,
  keyFn: (...args: A) => string,
  windowMs = 100
): (...args: A) => Promise<T> {
  const deduplicator = getDeduplicator();
  return deduplicator.createDeduplicated(fn, keyFn, windowMs);
}
