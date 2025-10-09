/**
 * Message Database Layer - Skeleton Implementation
 *
 * This is a no-op skeleton implementation that maintains API compatibility
 * but doesn't actually persist data. The messageLogger feature is disabled by default.
 *
 * To implement a real database:
 * 1. Install your preferred database library (e.g., better-sqlite3, lowdb, etc.)
 * 2. Replace this skeleton with actual implementation
 * 3. Enable messageLogging.enabled in config
 */

import log from 'electron-log';
import type { MessageRecord, MessageStatistics, MessageData } from '../../shared/types.js';

/**
 * Message Database class - Skeleton Implementation
 * Maintains API compatibility but doesn't persist data
 */
export class MessageDatabase {
  private initialized = false;

  constructor(_dbPath?: string) {
    // Skeleton: No actual database path needed
    log.debug('[MessageDB:Skeleton] Constructor called (no-op implementation)');
  }

  /**
   * Initialize database connection and schema
   * Skeleton: Just marks as initialized
   */
  public init(): void {
    log.warn(
      '[MessageDB:Skeleton] init() called - using no-op skeleton implementation (data will not be persisted)'
    );
    this.initialized = true;
  }

  /**
   * Insert or update a message
   * Skeleton: Logs the message but doesn't persist it
   */
  public upsertMessage(data: MessageData): void {
    if (!this.initialized) {
      log.warn('[MessageDB:Skeleton] upsertMessage() called before init()');
      return;
    }

    log.debug(
      '[MessageDB:Skeleton] upsertMessage() called (no-op):',
      data.messageId,
      'from',
      data.sender
    );
    // Skeleton: Message not persisted
  }

  /**
   * Get messages by conversation ID
   * Skeleton: Returns empty array
   */
  public getMessagesByConversation(_conversationId: string, _limit = 100): MessageRecord[] {
    log.debug('[MessageDB:Skeleton] getMessagesByConversation() called (returning empty array)');
    return [];
  }

  /**
   * Get statistics for analytics
   * Skeleton: Returns zero stats
   */
  public getStatistics(_startDate?: Date, _endDate?: Date): MessageStatistics {
    log.debug('[MessageDB:Skeleton] getStatistics() called (returning zero stats)');

    const now = Date.now();
    return {
      totalMessages: 0,
      sentMessages: 0,
      receivedMessages: 0,
      activeConversations: 0,
      mostActiveConversation: { name: 'N/A', count: 0 },
      messagesPerDay: [],
      messagesByType: {
        text: 0,
        image: 0,
        file: 0,
        reaction: 0,
        system: 0,
        unknown: 0,
      },
      timeRange: { start: now, end: now },
    };
  }

  /**
   * Delete messages older than retention period
   * Skeleton: Returns 0 (no messages to delete)
   */
  public enforceRetention(_retentionDays: number): number {
    log.debug('[MessageDB:Skeleton] enforceRetention() called (returning 0)');
    return 0;
  }

  /**
   * Clear all messages
   * Skeleton: No-op
   */
  public clearAll(): void {
    log.debug('[MessageDB:Skeleton] clearAll() called (no-op)');
  }

  /**
   * Get database file size in bytes
   * Skeleton: Returns 0
   */
  public getSize(): number {
    log.debug('[MessageDB:Skeleton] getSize() called (returning 0)');
    return 0;
  }

  /**
   * Close database connection
   * Skeleton: Just marks as not initialized
   */
  public close(): void {
    log.debug('[MessageDB:Skeleton] close() called');
    this.initialized = false;
  }

  /**
   * Vacuum database to reclaim space
   * Skeleton: No-op
   */
  public vacuum(): void {
    log.debug('[MessageDB:Skeleton] vacuum() called (no-op)');
  }
}

/**
 * Singleton instance
 */
let instance: MessageDatabase | null = null;

/**
 * Get the singleton database instance
 */
export function getMessageDatabase(): MessageDatabase {
  if (!instance) {
    instance = new MessageDatabase();
    instance.init();
  }
  return instance;
}

/**
 * Close and destroy the singleton instance
 */
export function closeMessageDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
