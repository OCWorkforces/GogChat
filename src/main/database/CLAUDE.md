# src/main/database/

This directory contains the database layer for storing and querying Google Chat messages. It uses SQLite via the `better-sqlite3` package for high performance and reliability.

## Overview

**Purpose**: The database layer provides:
- **Message persistence**: Store all Google Chat messages locally
- **Conversation tracking**: Track conversation metadata and activity
- **Analytics**: Generate statistics about messaging patterns
- **Retention policies**: Automatically delete old messages
- **Schema migrations**: Support for database schema updates
- **Performance optimization**: Indexes for fast queries

**Database engine**: SQLite 3 via `better-sqlite3` (synchronous, fast)
**Location**: `<userData>/messages.db` (platform-specific user data directory)
**Mode**: WAL (Write-Ahead Logging) for better concurrency
**Schema version**: Tracked in `_metadata` table for migrations

## Files

### messageDatabase.ts
SQLite database implementation for message logging and analytics.

**Key features:**
- Type-safe queries with TypeScript
- Automatic schema creation and migrations
- WAL mode for better performance
- Foreign key enforcement
- Comprehensive indexes
- Retention policy enforcement
- Statistics generation

#### Key Exports

**MessageDatabase class:**
```typescript
export class MessageDatabase {
  constructor(dbPath?: string)

  // Lifecycle
  init(): void
  close(): void

  // Message operations
  upsertMessage(data: MessageData): void
  getMessagesByConversation(conversationId: string, limit?: number): MessageRecord[]

  // Statistics
  getStatistics(startDate?: Date, endDate?: Date): MessageStatistics

  // Maintenance
  enforceRetention(retentionDays: number): number
  clearAll(): void
  getSize(): number
  vacuum(): void
}
```

**Singleton helpers:**
```typescript
export function getMessageDatabase(): MessageDatabase
export function closeMessageDatabase(): void
```

#### Database Schema

**Messages table:**
```sql
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  messageId TEXT NOT NULL UNIQUE,           -- Google Chat message ID
  conversationId TEXT NOT NULL,              -- Conversation/space ID
  conversationName TEXT NOT NULL,            -- Display name
  conversationType TEXT NOT NULL,            -- 'direct', 'group', or 'space'
  sender TEXT NOT NULL,                      -- Sender's name/email
  content TEXT NOT NULL,                     -- Message text
  timestamp INTEGER NOT NULL,                -- Message timestamp (ms)
  messageType TEXT NOT NULL,                 -- 'text', 'image', 'file', 'reaction', 'system', 'unknown'
  isOutgoing INTEGER NOT NULL,               -- 0 = received, 1 = sent
  attachmentUrl TEXT,                        -- URL for attachments
  attachmentName TEXT,                       -- Attachment filename
  createdAt INTEGER NOT NULL,                -- When inserted into DB (ms)
  updatedAt INTEGER                          -- When last updated (ms)
)
```

**Conversations table:**
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,                       -- Conversation ID
  name TEXT NOT NULL,                        -- Display name
  type TEXT NOT NULL,                        -- 'direct', 'group', or 'space'
  participants TEXT NOT NULL,                -- JSON array of participants
  firstSeen INTEGER NOT NULL,                -- First message timestamp
  lastActivity INTEGER NOT NULL,             -- Last message timestamp
  messageCount INTEGER NOT NULL DEFAULT 0    -- Total message count
)
```

**Metadata table:**
```sql
CREATE TABLE _metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
-- Stores schema_version for migrations
```

**Indexes:**
```sql
-- Fast timestamp-based queries
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);

-- Fast conversation message retrieval
CREATE INDEX idx_messages_conversation ON messages(conversationId, timestamp DESC);

-- Fast recent messages
CREATE INDEX idx_messages_created ON messages(createdAt DESC);

-- Fast conversation activity sorting
CREATE INDEX idx_conversations_activity ON conversations(lastActivity DESC);
```

#### Usage Examples

**Initialize database:**
```typescript
import { getMessageDatabase } from './database/messageDatabase';

// Singleton pattern - initializes on first call
const db = getMessageDatabase();

// Database is ready to use
```

**Store a message:**
```typescript
import type { MessageData } from '../../shared/types';

const message: MessageData = {
  messageId: 'msg-123',
  conversationId: 'conv-456',
  conversationName: 'Team Chat',
  conversationType: 'group',
  sender: 'John Doe',
  content: 'Hello, team!',
  timestamp: new Date(),
  messageType: 'text',
  isOutgoing: false,
  participants: ['John Doe', 'Jane Smith'],
};

db.upsertMessage(message);
```

**Retrieve conversation history:**
```typescript
// Get last 100 messages from a conversation
const messages = db.getMessagesByConversation('conv-456', 100);

// Messages are ordered by timestamp DESC (newest first)
messages.forEach(msg => {
  console.log(`${msg.sender}: ${msg.content}`);
});
```

**Generate statistics:**
```typescript
// Get statistics for last 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const stats = db.getStatistics(thirtyDaysAgo, new Date());

console.log(`Total messages: ${stats.totalMessages}`);
console.log(`Sent: ${stats.sentMessages}, Received: ${stats.receivedMessages}`);
console.log(`Active conversations: ${stats.activeConversations}`);
console.log(`Most active: ${stats.mostActiveConversation.name}`);
console.log(`Messages per day:`, stats.messagesPerDay);
console.log(`By type:`, stats.messagesByType);
```

**Enforce retention policy:**
```typescript
// Delete messages older than 90 days
const deletedCount = db.enforceRetention(90);
console.log(`Deleted ${deletedCount} old messages`);
```

**Database maintenance:**
```typescript
// Get database size
const sizeBytes = db.getSize();
console.log(`Database size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB`);

// Vacuum to reclaim space (after deleting many messages)
db.vacuum();

// Clear all messages (use with caution!)
db.clearAll();

// Close database connection (app shutdown)
closeMessageDatabase();
```

**Custom database path (testing):**
```typescript
import { MessageDatabase } from './database/messageDatabase';

// Use custom path for testing
const testDb = new MessageDatabase('/tmp/test-messages.db');
testDb.init();

// ... use testDb ...

testDb.close();
```

#### Data Types

**MessageData** (input for upsertMessage):
```typescript
interface MessageData {
  messageId: string;
  conversationId: string;
  conversationName: string;
  conversationType: 'direct' | 'group' | 'space';
  sender: string;
  content: string;
  timestamp: Date | string | number;
  messageType: 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';
  isOutgoing: boolean;
  participants?: string[];
  attachmentUrl?: string;
  attachmentName?: string;
}
```

**MessageRecord** (output from queries):
```typescript
interface MessageRecord {
  id: number;                    // Auto-increment ID
  messageId: string;
  conversationId: string;
  conversationName: string;
  conversationType: string;
  sender: string;
  content: string;
  timestamp: number;             // Unix timestamp (ms)
  messageType: string;
  isOutgoing: boolean;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: number;             // Unix timestamp (ms)
  updatedAt: number | null;      // Unix timestamp (ms)
}
```

**MessageStatistics**:
```typescript
interface MessageStatistics {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  activeConversations: number;
  mostActiveConversation: { name: string; count: number };
  messagesPerDay: Array<{ date: string; count: number }>;
  messagesByType: {
    text: number;
    image: number;
    file: number;
    reaction: number;
    system: number;
    unknown: number;
  };
  timeRange: { start: number; end: number };
}
```

#### Migration System

**How migrations work:**
1. Current schema version stored in `_metadata` table
2. On init, check if version < `SCHEMA_VERSION`
3. Run migration functions in order (v1→v2, v2→v3, etc.)
4. Update version in metadata

**Adding a migration:**
```typescript
// In messageDatabase.ts, update SCHEMA_VERSION
const SCHEMA_VERSION = 2;  // Increment

// In migrate() method, add migration logic
private migrate(): void {
  // ... existing code ...

  if (currentVersion < 2) {
    this.migrateToV2();
    this.updateSchemaVersion(2);
  }
}

// Add migration method
private migrateToV2(): void {
  if (!this.db) return;

  log.info('[MessageDB] Migrating to schema v2');

  // Example: Add a new column
  this.db.exec(`
    ALTER TABLE messages ADD COLUMN editedAt INTEGER;
  `);

  log.info('[MessageDB] Migration to v2 complete');
}
```

**Migration best practices:**
- Always increment `SCHEMA_VERSION`
- Migrations must be idempotent (can run multiple times safely)
- Test migrations with real data
- Keep migrations fast (avoid full table scans)
- Log migration progress
- Never delete old migrations (users may skip versions)

#### Performance Characteristics

**Write performance:**
- ~10,000 inserts/sec (WAL mode)
- Upsert operations: O(log n) due to UNIQUE index
- Batch inserts recommended for bulk data

**Read performance:**
- Indexed queries: O(log n)
- Full table scans: Avoid in production
- Statistics queries: Optimized with covering indexes

**Database size:**
- ~1KB per message (text only)
- ~5-10KB per message (with attachments metadata)
- 100,000 messages ≈ 100-1000 MB
- WAL file adds ~10-20% overhead

**Optimization tips:**
- Use indexes for frequent queries
- Vacuum periodically to reclaim space
- Enforce retention policies to limit growth
- Use prepared statements (already done via better-sqlite3)
- Batch operations in transactions

#### Security Considerations

**Current implementation:**
- ✅ No SQL injection (prepared statements)
- ✅ Type safety (TypeScript)
- ✅ Input validation (TypeScript types)
- ⚠️ No encryption at rest (database file is plaintext)

**Future encryption implementation:**
```typescript
// Option 1: SQLite encryption extension (SQLCipher)
import SQLite from '@journeyapps/sqlcipher';

this.db = new SQLite(this.dbPath, {
  key: encryptionKey,  // Derived from user password or system key
});

// Option 2: Application-level encryption
const encryptedContent = encrypt(message.content, encryptionKey);
db.upsertMessage({ ...message, content: encryptedContent });
```

**Security recommendations:**
- Add encryption at rest (SQLCipher or app-level)
- Secure deletion (overwrite before delete)
- Access control (file permissions)
- Audit logging (who accessed what)
- Backup encryption

#### Error Handling

**Common errors:**
```typescript
try {
  db.upsertMessage(message);
} catch (error) {
  if (error.code === 'SQLITE_CONSTRAINT') {
    // Duplicate messageId or constraint violation
    log.warn('Duplicate message:', message.messageId);
  } else if (error.code === 'SQLITE_FULL') {
    // Disk full
    log.error('Database full, cannot insert message');
  } else {
    // Other errors
    log.error('Database error:', error);
  }
}
```

**Database not initialized:**
```typescript
const db = new MessageDatabase();
// db.upsertMessage(...)  // ❌ Throws: Database not initialized
db.init();  // ✅ Initialize first
db.upsertMessage(...);  // ✅ Now works
```

**Connection handling:**
```typescript
// Singleton pattern ensures single connection
const db1 = getMessageDatabase();
const db2 = getMessageDatabase();
// db1 === db2 (same instance)

// Close on app quit
app.on('will-quit', () => {
  closeMessageDatabase();
});
```

#### Testing

**Test file**: `messageDatabase.test.ts`

**Test coverage:**
- Database initialization
- Schema creation
- Message insertion and retrieval
- Conversation tracking
- Statistics generation
- Retention policy enforcement
- Migration system
- Error handling

**Running tests:**
```bash
npm test messageDatabase.test.ts
npm run test:coverage
```

**Test database isolation:**
```typescript
// Each test uses a unique database file
const testDb = new MessageDatabase(':memory:');  // In-memory DB
testDb.init();
// ... run tests ...
testDb.close();
```

## Integration with Features

**Message logging feature:**
```typescript
import { getMessageDatabase } from './database/messageDatabase';
import { ipcMain } from 'electron';

ipcMain.on('log-message', (event, data) => {
  try {
    const db = getMessageDatabase();
    db.upsertMessage(data);
  } catch (error) {
    log.error('Failed to log message:', error);
  }
});
```

**Analytics dashboard:**
```typescript
import { getMessageDatabase } from './database/messageDatabase';

function getAnalyticsDashboard() {
  const db = getMessageDatabase();
  const stats = db.getStatistics();

  return {
    ...stats,
    databaseSize: db.getSize(),
  };
}
```

**Retention policy (scheduled task):**
```typescript
import { getMessageDatabase } from './database/messageDatabase';

// Run daily
setInterval(() => {
  const db = getMessageDatabase();
  const deleted = db.enforceRetention(90);  // 90 days

  if (deleted > 0) {
    log.info(`Deleted ${deleted} old messages`);
    db.vacuum();  // Reclaim space
  }
}, 24 * 60 * 60 * 1000);  // 24 hours
```

## Best Practices

**Use the singleton:**
```typescript
// Good: Use singleton
const db = getMessageDatabase();

// Avoid: Creating multiple instances
const db1 = new MessageDatabase();
const db2 = new MessageDatabase();  // Second connection to same file
```

**Close on shutdown:**
```typescript
import { closeMessageDatabase } from './database/messageDatabase';

app.on('will-quit', () => {
  closeMessageDatabase();
});
```

**Error handling:**
```typescript
try {
  db.upsertMessage(message);
} catch (error) {
  log.error('Failed to store message:', error);
  // Don't crash the app for database errors
}
```

**Batch operations:**
```typescript
// For bulk inserts, use transactions
import Database from 'better-sqlite3';

const db = getMessageDatabase();
const transaction = db.db!.transaction((messages: MessageData[]) => {
  for (const msg of messages) {
    db.upsertMessage(msg);
  }
});

transaction(messagesArray);  // Faster than individual inserts
```

**Regular maintenance:**
```typescript
// Periodically clean up and optimize
function performMaintenance() {
  const db = getMessageDatabase();

  // Delete old messages
  const deleted = db.enforceRetention(90);

  // Reclaim space if significant deletions
  if (deleted > 1000) {
    db.vacuum();
  }

  // Log database size
  const sizeMB = db.getSize() / 1024 / 1024;
  log.info(`Database size: ${sizeMB.toFixed(2)} MB`);
}

// Run weekly
setInterval(performMaintenance, 7 * 24 * 60 * 60 * 1000);
```

## Future Enhancements

**Planned features:**
- [ ] Encryption at rest (SQLCipher)
- [ ] Full-text search (FTS5)
- [ ] Message attachments (store files or URLs)
- [ ] Export to CSV/JSON
- [ ] Import from backup
- [ ] Database compaction (automatic)
- [ ] Read receipts tracking
- [ ] Reaction aggregation
- [ ] Thread support
- [ ] Rich media metadata

**Performance improvements:**
- [ ] Connection pooling (if needed)
- [ ] Query result caching
- [ ] Lazy loading for large conversations
- [ ] Pagination for statistics
- [ ] Incremental statistics updates

**Security enhancements:**
- [ ] Row-level encryption
- [ ] Secure deletion (overwrite)
- [ ] Access audit log
- [ ] Backup encryption
- [ ] Key rotation support
