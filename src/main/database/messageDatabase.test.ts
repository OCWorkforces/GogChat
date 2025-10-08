/**
 * Unit tests for Message Database
 * Tests database operations, schema management, and data integrity
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageDatabase } from './messageDatabase';
import type { MessageData } from '../../shared/types';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MessageDatabase', () => {
  let db: MessageDatabase;
  let testDbPath: string;

  beforeEach(() => {
    // Create a temporary database for testing
    testDbPath = join(tmpdir(), `test-messages-${Date.now()}.db`);
    db = new MessageDatabase(testDbPath);
    db.init();
  });

  afterEach(() => {
    // Cleanup
    db.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
    // Also clean up WAL files
    const walPath = `${testDbPath}-wal`;
    const shmPath = `${testDbPath}-shm`;
    if (existsSync(walPath)) {
      unlinkSync(walPath);
    }
    if (existsSync(shmPath)) {
      unlinkSync(shmPath);
    }
  });

  describe('Initialization', () => {
    it('should create database file on init', () => {
      expect(existsSync(testDbPath)).toBe(true);
    });

    it('should create messages table', () => {
      const result = db['db']?.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
      ).get() as { name: string } | undefined;
      expect(result?.name).toBe('messages');
    });

    it('should create conversations table', () => {
      const result = db['db']?.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
      ).get() as { name: string } | undefined;
      expect(result?.name).toBe('conversations');
    });

    it('should create metadata table', () => {
      const result = db['db']?.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='_metadata'"
      ).get() as { name: string } | undefined;
      expect(result?.name).toBe('_metadata');
    });

    it('should set schema version', () => {
      const result = db['db']?.prepare(
        "SELECT value FROM _metadata WHERE key='schema_version'"
      ).get() as { value: string } | undefined;
      expect(result?.value).toBe('1');
    });

    it('should enable WAL mode', () => {
      const result = db['db']?.pragma('journal_mode', { simple: true }) as string;
      expect(result).toBe('wal');
    });

    it('should enable foreign keys', () => {
      const result = db['db']?.pragma('foreign_keys', { simple: true }) as number;
      expect(result).toBe(1);
    });
  });

  describe('Message Operations', () => {
    const sampleMessage: MessageData = {
      messageId: 'msg-test-001',
      content: 'Hello, this is a test message',
      sender: 'Test User',
      timestamp: new Date().toISOString(),
      conversationId: 'conv-001',
      conversationName: 'Test Conversation',
      conversationType: 'group',
      messageType: 'text',
      isOutgoing: false,
    };

    it('should insert a message', () => {
      db.upsertMessage(sampleMessage);

      const result = db['db']?.prepare('SELECT COUNT(*) as count FROM messages').get() as {
        count: number;
      };
      expect(result.count).toBe(1);
    });

    it('should store message with correct fields', () => {
      db.upsertMessage(sampleMessage);

      const result = db['db']?.prepare('SELECT * FROM messages WHERE messageId = ?').get(
        sampleMessage.messageId
      ) as Record<string, unknown>;

      expect(result.messageId).toBe(sampleMessage.messageId);
      expect(result.content).toBe(sampleMessage.content);
      expect(result.sender).toBe(sampleMessage.sender);
      expect(result.conversationId).toBe(sampleMessage.conversationId);
      expect(result.isOutgoing).toBe(0); // SQLite stores boolean as 0/1
    });

    it('should update message on conflict', () => {
      db.upsertMessage(sampleMessage);

      const updatedMessage = {
        ...sampleMessage,
        content: 'Updated content',
      };
      db.upsertMessage(updatedMessage);

      const result = db['db']?.prepare('SELECT content FROM messages WHERE messageId = ?').get(
        sampleMessage.messageId
      ) as { content: string };

      expect(result.content).toBe('Updated content');
    });

    it('should create conversation on message insert', () => {
      db.upsertMessage(sampleMessage);

      const result = db['db']?.prepare('SELECT * FROM conversations WHERE id = ?').get(
        sampleMessage.conversationId
      ) as Record<string, unknown>;

      expect(result.name).toBe(sampleMessage.conversationName);
      expect(result.type).toBe(sampleMessage.conversationType);
    });

    it('should retrieve messages by conversation ID', () => {
      // Insert multiple messages
      db.upsertMessage(sampleMessage);
      db.upsertMessage({
        ...sampleMessage,
        messageId: 'msg-test-002',
        content: 'Second message',
      });
      db.upsertMessage({
        ...sampleMessage,
        messageId: 'msg-test-003',
        conversationId: 'conv-002', // Different conversation
      });

      const messages = db.getMessagesByConversation('conv-001');

      expect(messages.length).toBe(2);
      expect(messages[0].isOutgoing).toBe(false); // Should be boolean, not number
    });

    it('should limit results when querying messages', () => {
      // Insert 10 messages
      for (let i = 0; i < 10; i++) {
        db.upsertMessage({
          ...sampleMessage,
          messageId: `msg-test-${i.toString().padStart(3, '0')}`,
        });
      }

      const messages = db.getMessagesByConversation('conv-001', 5);
      expect(messages.length).toBe(5);
    });

    it('should return messages in descending timestamp order', () => {
      const now = Date.now();

      db.upsertMessage({
        ...sampleMessage,
        messageId: 'msg-001',
        timestamp: new Date(now - 2000).toISOString(),
      });
      db.upsertMessage({
        ...sampleMessage,
        messageId: 'msg-002',
        timestamp: new Date(now - 1000).toISOString(),
      });
      db.upsertMessage({
        ...sampleMessage,
        messageId: 'msg-003',
        timestamp: new Date(now).toISOString(),
      });

      const messages = db.getMessagesByConversation('conv-001');

      // Most recent first
      expect(messages[0].messageId).toBe('msg-003');
      expect(messages[1].messageId).toBe('msg-002');
      expect(messages[2].messageId).toBe('msg-001');
    });

    it('should handle messages with optional fields', () => {
      const messageWithOptional: MessageData = {
        ...sampleMessage,
        messageId: 'msg-optional',
        attachmentUrl: 'https://example.com/file.pdf',
        attachmentName: 'document.pdf',
        participants: ['User1', 'User2'],
      };

      db.upsertMessage(messageWithOptional);

      const result = db['db']?.prepare('SELECT * FROM messages WHERE messageId = ?').get(
        'msg-optional'
      ) as Record<string, unknown>;

      expect(result.attachmentUrl).toBe('https://example.com/file.pdf');
      expect(result.attachmentName).toBe('document.pdf');
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      // Insert sample data
      const now = Date.now();

      // Sent messages
      for (let i = 0; i < 5; i++) {
        db.upsertMessage({
          messageId: `sent-${i}`,
          content: `Sent message ${i}`,
          sender: 'Me',
          timestamp: new Date(now - i * 60000).toISOString(),
          conversationId: 'conv-001',
          conversationName: 'Team Chat',
          conversationType: 'group',
          messageType: 'text',
          isOutgoing: true,
        });
      }

      // Received messages
      for (let i = 0; i < 10; i++) {
        db.upsertMessage({
          messageId: `received-${i}`,
          content: `Received message ${i}`,
          sender: 'Other User',
          timestamp: new Date(now - i * 60000).toISOString(),
          conversationId: 'conv-001',
          conversationName: 'Team Chat',
          conversationType: 'group',
          messageType: 'text',
          isOutgoing: false,
        });
      }

      // Messages in another conversation
      for (let i = 0; i < 3; i++) {
        db.upsertMessage({
          messageId: `conv2-${i}`,
          content: `Message ${i}`,
          sender: 'User',
          timestamp: new Date(now - i * 60000).toISOString(),
          conversationId: 'conv-002',
          conversationName: 'Direct Chat',
          conversationType: 'direct',
          messageType: 'text',
          isOutgoing: false,
        });
      }
    });

    it('should count total messages', () => {
      const stats = db.getStatistics();
      expect(stats.totalMessages).toBe(18); // 5 sent + 10 received + 3 in other conv
    });

    it('should count sent vs received messages', () => {
      const stats = db.getStatistics();
      expect(stats.sentMessages).toBe(5);
      expect(stats.receivedMessages).toBe(13);
    });

    it('should count active conversations', () => {
      const stats = db.getStatistics();
      expect(stats.activeConversations).toBe(2);
    });

    it('should identify most active conversation', () => {
      const stats = db.getStatistics();
      expect(stats.mostActiveConversation.name).toBe('Team Chat');
      expect(stats.mostActiveConversation.count).toBe(15);
    });

    it('should filter statistics by date range', () => {
      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);

      // Statistics for last 5 minutes should exclude most messages
      // (since beforeEach creates messages with timestamps going back in time by minutes)
      const stats = db.getStatistics(fiveMinutesAgo, new Date(now + 1000));
      // Should only count the most recent 5 messages (0-4 minutes ago)
      expect(stats.totalMessages).toBeLessThan(18);
      expect(stats.totalMessages).toBeGreaterThanOrEqual(5);
    });

    it('should group messages by type', () => {
      // Add different message types
      db.upsertMessage({
        messageId: 'img-1',
        content: '',
        sender: 'User',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Team Chat',
        conversationType: 'group',
        messageType: 'image',
        isOutgoing: false,
      });

      db.upsertMessage({
        messageId: 'file-1',
        content: '',
        sender: 'User',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Team Chat',
        conversationType: 'group',
        messageType: 'file',
        isOutgoing: false,
      });

      const stats = db.getStatistics();
      expect(stats.messagesByType.text).toBeGreaterThan(0);
      expect(stats.messagesByType.image).toBeGreaterThan(0);
      expect(stats.messagesByType.file).toBeGreaterThan(0);
    });
  });

  describe('Retention Policy', () => {
    it('should delete messages older than retention period', () => {
      const now = Date.now();
      const oldTimestamp = now - 40 * 24 * 60 * 60 * 1000; // 40 days ago
      const recentTimestamp = now - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      db.upsertMessage({
        messageId: 'old-msg',
        content: 'Old message',
        sender: 'User',
        timestamp: new Date(oldTimestamp).toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Test',
        conversationType: 'group',
        messageType: 'text',
        isOutgoing: false,
      });

      db.upsertMessage({
        messageId: 'recent-msg',
        content: 'Recent message',
        sender: 'User',
        timestamp: new Date(recentTimestamp).toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Test',
        conversationType: 'group',
        messageType: 'text',
        isOutgoing: false,
      });

      const deletedCount = db.enforceRetention(30); // 30 days retention

      expect(deletedCount).toBe(1); // Only old message deleted

      const remaining = db['db']?.prepare('SELECT COUNT(*) as count FROM messages').get() as {
        count: number;
      };
      expect(remaining.count).toBe(1);
    });

    it('should not delete messages within retention period', () => {
      const now = Date.now();

      db.upsertMessage({
        messageId: 'msg-1',
        content: 'Recent message',
        sender: 'User',
        timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        conversationId: 'conv-001',
        conversationName: 'Test',
        conversationType: 'group',
        messageType: 'text',
        isOutgoing: false,
      });

      const deletedCount = db.enforceRetention(30);
      expect(deletedCount).toBe(0);
    });
  });

  describe('Data Management', () => {
    it('should clear all messages', () => {
      db.upsertMessage({
        messageId: 'msg-1',
        content: 'Test',
        sender: 'User',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Test',
        conversationType: 'group',
        messageType: 'text',
        isOutgoing: false,
      });

      db.clearAll();

      const messageCount = db['db']?.prepare('SELECT COUNT(*) as count FROM messages').get() as {
        count: number;
      };
      const convCount = db['db']?.prepare('SELECT COUNT(*) as count FROM conversations').get() as {
        count: number;
      };

      expect(messageCount.count).toBe(0);
      expect(convCount.count).toBe(0);
    });

    it('should report database size', () => {
      const size = db.getSize();
      expect(size).toBeGreaterThan(0);
    });

    it('should vacuum database', () => {
      // Add and remove data to create fragmentation
      for (let i = 0; i < 100; i++) {
        db.upsertMessage({
          messageId: `msg-${i}`,
          content: 'x'.repeat(1000),
          sender: 'User',
          timestamp: new Date().toISOString(),
          conversationId: 'conv-001',
          conversationName: 'Test',
          conversationType: 'group',
          messageType: 'text',
          isOutgoing: false,
        });
      }

      db.clearAll();
      const sizeBeforeVacuum = db.getSize();

      db.vacuum();
      const sizeAfterVacuum = db.getSize();

      // Size should be smaller or equal after vacuum
      expect(sizeAfterVacuum).toBeLessThanOrEqual(sizeBeforeVacuum);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when operating on closed database', () => {
      db.close();

      expect(() => {
        db.upsertMessage({
          messageId: 'msg-1',
          content: 'Test',
          sender: 'User',
          timestamp: new Date().toISOString(),
          conversationId: 'conv-001',
          conversationName: 'Test',
          conversationType: 'group',
          messageType: 'text',
          isOutgoing: false,
        });
      }).toThrow('Database not initialized');
    });

    it('should handle duplicate message IDs gracefully', () => {
      const message: MessageData = {
        messageId: 'dup-msg',
        content: 'Original',
        sender: 'User',
        timestamp: new Date().toISOString(),
        conversationId: 'conv-001',
        conversationName: 'Test',
        conversationType: 'group',
        messageType: 'text',
        isOutgoing: false,
      };

      db.upsertMessage(message);

      // Insert again with different content - should update
      db.upsertMessage({
        ...message,
        content: 'Updated',
      });

      const result = db['db']?.prepare('SELECT content, COUNT(*) as count FROM messages WHERE messageId = ?').get(
        'dup-msg'
      ) as { content: string; count: number };

      expect(result.count).toBe(1);
      expect(result.content).toBe('Updated');
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent writes', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          Promise.resolve().then(() => {
            db.upsertMessage({
              messageId: `concurrent-${i}`,
              content: `Message ${i}`,
              sender: 'User',
              timestamp: new Date().toISOString(),
              conversationId: 'conv-001',
              conversationName: 'Test',
              conversationType: 'group',
              messageType: 'text',
              isOutgoing: false,
            });
          })
        );
      }

      await Promise.all(promises);

      const count = db['db']?.prepare('SELECT COUNT(*) as count FROM messages').get() as {
        count: number;
      };
      expect(count.count).toBe(10);
    });
  });
});
