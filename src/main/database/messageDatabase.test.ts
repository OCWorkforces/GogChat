/**
 * Unit tests for Message Database - Skeleton Implementation
 * Tests that the skeleton API works correctly and doesn't crash
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MessageDatabase, getMessageDatabase, closeMessageDatabase } from './messageDatabase.js';
import type { MessageData } from '../../shared/types.js';

describe('MessageDatabase - Skeleton Implementation', () => {
  let db: MessageDatabase;

  beforeEach(() => {
    db = new MessageDatabase();
    db.init();
  });

  afterEach(() => {
    db.close();
  });

  describe('Initialization', () => {
    it('should initialize without errors', () => {
      expect(() => db.init()).not.toThrow();
    });

    it('should not crash when closed', () => {
      expect(() => db.close()).not.toThrow();
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

    it('should accept messages without crashing', () => {
      expect(() => db.upsertMessage(sampleMessage)).not.toThrow();
    });

    it('should return empty array when querying messages', () => {
      db.upsertMessage(sampleMessage);
      const messages = db.getMessagesByConversation('conv-001');
      expect(messages).toEqual([]);
    });

    it('should accept limit parameter in getMessagesByConversation', () => {
      const messages = db.getMessagesByConversation('conv-001', 50);
      expect(messages).toEqual([]);
    });
  });

  describe('Statistics', () => {
    it('should return zero statistics', () => {
      const stats = db.getStatistics();

      expect(stats.totalMessages).toBe(0);
      expect(stats.sentMessages).toBe(0);
      expect(stats.receivedMessages).toBe(0);
      expect(stats.activeConversations).toBe(0);
      expect(stats.mostActiveConversation).toEqual({ name: 'N/A', count: 0 });
      expect(stats.messagesPerDay).toEqual([]);
      expect(stats.messagesByType).toEqual({
        text: 0,
        image: 0,
        file: 0,
        reaction: 0,
        system: 0,
        unknown: 0,
      });
    });

    it('should accept date range parameters', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const stats = db.getStatistics(yesterday, now);
      expect(stats.totalMessages).toBe(0);
    });
  });

  describe('Retention Policy', () => {
    it('should return 0 for retention enforcement', () => {
      const deletedCount = db.enforceRetention(30);
      expect(deletedCount).toBe(0);
    });
  });

  describe('Data Management', () => {
    it('should not crash when clearing all data', () => {
      expect(() => db.clearAll()).not.toThrow();
    });

    it('should return 0 for database size', () => {
      const size = db.getSize();
      expect(size).toBe(0);
    });

    it('should not crash when vacuuming', () => {
      expect(() => db.vacuum()).not.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should create singleton instance', () => {
      const instance1 = getMessageDatabase();
      const instance2 = getMessageDatabase();

      expect(instance1).toBe(instance2);
    });

    it('should allow closing singleton', () => {
      getMessageDatabase();
      expect(() => closeMessageDatabase()).not.toThrow();
    });

    it('should recreate singleton after closing', () => {
      const instance1 = getMessageDatabase();
      closeMessageDatabase();
      const instance2 = getMessageDatabase();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('API Compatibility', () => {
    it('should maintain backwards compatibility with all methods', () => {
      // Verify all expected methods exist
      expect(typeof db.init).toBe('function');
      expect(typeof db.close).toBe('function');
      expect(typeof db.upsertMessage).toBe('function');
      expect(typeof db.getMessagesByConversation).toBe('function');
      expect(typeof db.getStatistics).toBe('function');
      expect(typeof db.enforceRetention).toBe('function');
      expect(typeof db.clearAll).toBe('function');
      expect(typeof db.getSize).toBe('function');
      expect(typeof db.vacuum).toBe('function');
    });
  });
});
