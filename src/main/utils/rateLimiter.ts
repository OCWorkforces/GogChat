/**
 * IPC Rate Limiter to prevent flooding and DoS attacks
 * Tracks message frequency per channel and blocks excessive requests
 */

import log from 'electron-log';
import { RATE_LIMITS } from '../../shared/constants.js';
import type { RateLimitEntry } from '../../shared/types.js';

/**
 * Rate limiter for IPC channels
 */
export class IPCRateLimiter {
  private counters: Map<string, RateLimitEntry> = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly cleanupIntervalMs = 60000; // Clean up every minute

  constructor() {
    // Periodically clean up old entries to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Check if a message is allowed based on rate limits
   * @param channel - IPC channel name
   * @param maxPerSecond - Maximum messages allowed per second (default from config)
   * @returns true if message is allowed, false if rate limited
   */
  isAllowed(channel: string, maxPerSecond?: number): boolean {
    const limit = maxPerSecond ?? this.getDefaultLimit(channel);
    const now = Date.now();

    // Get or create entry for this channel
    let entry = this.counters.get(channel);
    if (!entry) {
      entry = { timestamps: [], blocked: 0 };
      this.counters.set(channel, entry);
    }

    // Filter to only recent timestamps (within last second)
    const oneSecondAgo = now - 1000;
    entry.timestamps = entry.timestamps.filter((t) => t > oneSecondAgo);

    // Check if limit exceeded
    if (entry.timestamps.length >= limit) {
      entry.blocked++;

      // Log if being heavily rate limited
      if (entry.blocked % 10 === 0) {
        log.warn(`[RateLimiter] Channel "${channel}" has been rate limited ${entry.blocked} times`);
      }

      return false;
    }

    // Allow message and record timestamp
    entry.timestamps.push(now);
    return true;
  }

  /**
   * Get default rate limit for a channel
   * @param channel - IPC channel name
   * @returns Maximum messages per second
   */
  private getDefaultLimit(channel: string): number {
    // Special limits for specific channels
    if (channel === 'unreadCount') {
      return RATE_LIMITS.IPC_UNREAD_COUNT;
    }
    if (channel === 'faviconChanged') {
      return RATE_LIMITS.IPC_FAVICON;
    }

    // Default limit
    return RATE_LIMITS.IPC_DEFAULT;
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  private cleanup(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    for (const [channel, entry] of this.counters.entries()) {
      // Remove channels with no recent activity
      const hasRecentActivity = entry.timestamps.some((t) => t > fiveMinutesAgo);

      if (!hasRecentActivity) {
        if (entry.blocked > 0) {
          log.debug(
            `[RateLimiter] Removing inactive channel "${channel}" (blocked ${entry.blocked} times)`
          );
        }
        this.counters.delete(channel);
      }
    }
  }

  /**
   * Get statistics for a channel
   * @param channel - IPC channel name
   * @returns Statistics object or undefined if channel not found
   */
  getStats(channel: string): { messagesLastSecond: number; totalBlocked: number } | undefined {
    const entry = this.counters.get(channel);
    if (!entry) return undefined;

    const now = Date.now();
    const oneSecondAgo = now - 1000;
    const recentCount = entry.timestamps.filter((t) => t > oneSecondAgo).length;

    return {
      messagesLastSecond: recentCount,
      totalBlocked: entry.blocked,
    };
  }

  /**
   * Reset rate limit for a specific channel
   * @param channel - IPC channel name
   */
  reset(channel: string): void {
    this.counters.delete(channel);
    log.debug(`[RateLimiter] Reset rate limit for channel "${channel}"`);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.counters.clear();
    log.debug('[RateLimiter] Reset all rate limits');
  }

  /**
   * Get all channel statistics
   * @returns Map of channel names to statistics
   */
  getAllStats(): Map<string, { messagesLastSecond: number; totalBlocked: number }> {
    const stats = new Map();

    for (const [channel, entry] of this.counters.entries()) {
      const now = Date.now();
      const oneSecondAgo = now - 1000;
      const recentCount = entry.timestamps.filter((t) => t > oneSecondAgo).length;

      stats.set(channel, {
        messagesLastSecond: recentCount,
        totalBlocked: entry.blocked,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return stats;
  }

  /**
   * Clean up and stop the rate limiter
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.counters.clear();
  }
}

// Create singleton instance
let rateLimiterInstance: IPCRateLimiter | null = null;

/**
 * Get the singleton rate limiter instance
 * @returns IPCRateLimiter instance
 */
export function getRateLimiter(): IPCRateLimiter {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new IPCRateLimiter();
  }
  return rateLimiterInstance;
}

/**
 * Destroy the rate limiter singleton
 */
export function destroyRateLimiter(): void {
  if (rateLimiterInstance) {
    rateLimiterInstance.destroy();
    rateLimiterInstance = null;
  }
}
