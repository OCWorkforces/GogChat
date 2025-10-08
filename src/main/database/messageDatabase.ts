/**
 * Message Database Layer
 * SQLite database for storing and querying Google Chat messages
 * Features: Encryption-ready, migration support, retention policies
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import log from 'electron-log';
import type {
  MessageRecord,
  ConversationRecord,
  MessageStatistics,
  MessageData,
} from '../../shared/types';

/**
 * Database schema version for migrations
 */
const SCHEMA_VERSION = 1;

/**
 * Message Database class
 * Handles all database operations for message logging
 */
export class MessageDatabase {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Default to user data directory
    this.dbPath = dbPath || join(app.getPath('userData'), 'messages.db');
  }

  /**
   * Initialize database connection and schema
   */
  public init(): void {
    try {
      log.info('[MessageDB] Initializing database:', this.dbPath);

      // Open database connection
      this.db = new Database(this.dbPath, {
        verbose: process.env.NODE_ENV === 'development' ? (msg) => log.debug(msg) : undefined,
      });

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Create schema if needed
      this.createSchema();

      // Run migrations
      this.migrate();

      log.info('[MessageDB] Database initialized successfully');
    } catch (error) {
      log.error('[MessageDB] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Metadata table for schema versioning
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);

    // Messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId TEXT NOT NULL UNIQUE,
        conversationId TEXT NOT NULL,
        conversationName TEXT NOT NULL,
        conversationType TEXT NOT NULL CHECK(conversationType IN ('direct', 'group', 'space')),
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        messageType TEXT NOT NULL CHECK(messageType IN ('text', 'image', 'file', 'reaction', 'system', 'unknown')),
        isOutgoing INTEGER NOT NULL CHECK(isOutgoing IN (0, 1)),
        attachmentUrl TEXT,
        attachmentName TEXT,
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updatedAt INTEGER
      )
    `);

    // Conversations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('direct', 'group', 'space')),
        participants TEXT NOT NULL,
        firstSeen INTEGER NOT NULL,
        lastActivity INTEGER NOT NULL,
        messageCount INTEGER NOT NULL DEFAULT 0
      )
    `);

    // Indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversationId, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(createdAt DESC);
      CREATE INDEX IF NOT EXISTS idx_conversations_activity ON conversations(lastActivity DESC);
    `);

    // Initialize schema version
    const versionStmt = this.db.prepare('SELECT value FROM _metadata WHERE key = ?');
    const currentVersion = versionStmt.get('schema_version') as { value: string } | undefined;

    if (!currentVersion) {
      const insertStmt = this.db.prepare('INSERT INTO _metadata (key, value) VALUES (?, ?)');
      insertStmt.run('schema_version', SCHEMA_VERSION.toString());
      log.info('[MessageDB] Schema created, version:', SCHEMA_VERSION);
    }
  }

  /**
   * Run database migrations
   */
  private migrate(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const versionStmt = this.db.prepare('SELECT value FROM _metadata WHERE key = ?');
    const result = versionStmt.get('schema_version') as { value: string } | undefined;
    const currentVersion = result ? parseInt(result.value, 10) : 0;

    log.info('[MessageDB] Current schema version:', currentVersion);

    // Future migrations go here
    // Example:
    // if (currentVersion < 2) {
    //   this.migrateToV2();
    //   this.updateSchemaVersion(2);
    // }

    if (currentVersion < SCHEMA_VERSION) {
      this.updateSchemaVersion(SCHEMA_VERSION);
    }
  }

  /**
   * Update schema version in metadata
   */
  private updateSchemaVersion(version: number): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare('UPDATE _metadata SET value = ? WHERE key = ?');
    stmt.run(version.toString(), 'schema_version');
    log.info('[MessageDB] Updated schema version to:', version);
  }

  /**
   * Insert or update a message
   */
  public upsertMessage(data: MessageData): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const now = Date.now();
    const timestamp = new Date(data.timestamp).getTime();

    // Insert or replace message
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        messageId, conversationId, conversationName, conversationType,
        sender, content, timestamp, messageType, isOutgoing,
        attachmentUrl, attachmentName, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(messageId) DO UPDATE SET
        content = excluded.content,
        updatedAt = ?
    `);

    stmt.run(
      data.messageId,
      data.conversationId,
      data.conversationName,
      data.conversationType,
      data.sender,
      data.content,
      timestamp,
      data.messageType,
      data.isOutgoing ? 1 : 0,
      data.attachmentUrl || null,
      data.attachmentName || null,
      now,
      now // updatedAt
    );

    // Update or insert conversation
    this.upsertConversation({
      id: data.conversationId,
      name: data.conversationName,
      type: data.conversationType,
      participants: JSON.stringify(data.participants || [data.sender]),
      firstSeen: timestamp,
      lastActivity: timestamp,
      messageCount: 0, // Will be updated by trigger or separate query
    });

    log.debug('[MessageDB] Upserted message:', data.messageId);
  }

  /**
   * Insert or update a conversation
   */
  private upsertConversation(data: ConversationRecord): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      INSERT INTO conversations (id, name, type, participants, firstSeen, lastActivity, messageCount)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        lastActivity = excluded.lastActivity,
        messageCount = messageCount + 1
    `);

    stmt.run(
      data.id,
      data.name,
      data.type,
      data.participants,
      data.firstSeen,
      data.lastActivity,
      data.messageCount
    );
  }

  /**
   * Get messages by conversation ID
   */
  public getMessagesByConversation(conversationId: string, limit = 100): MessageRecord[] {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversationId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const rows = stmt.all(conversationId, limit) as (Omit<MessageRecord, 'isOutgoing'> & {
      isOutgoing: number;
    })[];
    return rows.map((row) => ({
      ...row,
      isOutgoing: row.isOutgoing === 1,
    }));
  }

  /**
   * Get statistics for analytics
   */
  public getStatistics(startDate?: Date, endDate?: Date): MessageStatistics {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const start = startDate ? startDate.getTime() : 0;
    const end = endDate ? endDate.getTime() : Date.now();

    // Total messages
    const totalStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE timestamp BETWEEN ? AND ?
    `);
    const totalResult = totalStmt.get(start, end) as { count: number };

    // Sent vs received
    const sentStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages WHERE timestamp BETWEEN ? AND ? AND isOutgoing = 1
    `);
    const sentResult = sentStmt.get(start, end) as { count: number };

    // Active conversations
    const conversationsStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT conversationId) as count FROM messages WHERE timestamp BETWEEN ? AND ?
    `);
    const conversationsResult = conversationsStmt.get(start, end) as { count: number };

    // Most active conversation
    const mostActiveStmt = this.db.prepare(`
      SELECT conversationName as name, COUNT(*) as count
      FROM messages
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY conversationId
      ORDER BY count DESC
      LIMIT 1
    `);
    const mostActive = mostActiveStmt.get(start, end) as
      | { name: string; count: number }
      | undefined;

    // Messages per day (last 30 days)
    const perDayStmt = this.db.prepare(`
      SELECT date(timestamp / 1000, 'unixepoch') as date, COUNT(*) as count
      FROM messages
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `);
    const perDay = perDayStmt.all(start, end) as { date: string; count: number }[];

    // Messages by type
    const byTypeStmt = this.db.prepare(`
      SELECT messageType, COUNT(*) as count
      FROM messages
      WHERE timestamp BETWEEN ? AND ?
      GROUP BY messageType
    `);
    const byType = byTypeStmt.all(start, end) as { messageType: string; count: number }[];

    return {
      totalMessages: totalResult.count,
      sentMessages: sentResult.count,
      receivedMessages: totalResult.count - sentResult.count,
      activeConversations: conversationsResult.count,
      mostActiveConversation: mostActive || { name: 'N/A', count: 0 },
      messagesPerDay: perDay,
      messagesByType: byType.reduce(
        (acc, item) => {
          acc[item.messageType as keyof typeof acc] = item.count;
          return acc;
        },
        { text: 0, image: 0, file: 0, reaction: 0, system: 0, unknown: 0 }
      ),
      timeRange: { start, end },
    };
  }

  /**
   * Delete messages older than retention period
   */
  public enforceRetention(retentionDays: number): number {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const cutoffDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare('DELETE FROM messages WHERE timestamp < ?');
    const result = stmt.run(cutoffDate);

    log.info('[MessageDB] Deleted', result.changes, 'messages older than', retentionDays, 'days');
    return result.changes;
  }

  /**
   * Clear all messages
   */
  public clearAll(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    this.db.exec('DELETE FROM messages');
    this.db.exec('DELETE FROM conversations');
    log.info('[MessageDB] All messages cleared');
  }

  /**
   * Get database file size in bytes
   */
  public getSize(): number {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const stmt = this.db.prepare(
      'SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()'
    );
    const result = stmt.get() as { size: number };
    return result.size;
  }

  /**
   * Close database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      log.info('[MessageDB] Database closed');
    }
  }

  /**
   * Vacuum database to reclaim space
   */
  public vacuum(): void {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    log.info('[MessageDB] Running VACUUM...');
    this.db.exec('VACUUM');
    log.info('[MessageDB] VACUUM completed');
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
