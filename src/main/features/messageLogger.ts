/**
 * Message Logger Feature
 * Captures messages from Google Chat and stores them in the database
 * Features: Rate limiting, validation, retention enforcement, batch writes
 */

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, RATE_LIMITS, MESSAGE_LOGGING } from '../../shared/constants';
import { validateMessageData } from '../../shared/validators';
import { getMessageDatabase, closeMessageDatabase } from '../database/messageDatabase';
import { getRateLimiter } from '../utils/rateLimiter';
import { logger } from '../utils/logger';
import store from '../config';

const log = logger.feature('MessageLogger');
const rateLimiter = getRateLimiter();

/**
 * Message queue for batch writing
 */
interface QueuedMessage {
  messageId: string;
  content: string;
  sender: string;
  timestamp: string;
  conversationId: string;
  conversationName: string;
  conversationType: 'direct' | 'group' | 'space';
  messageType: 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';
  isOutgoing: boolean;
  receiverName?: string;
  participants?: string[];
  attachmentUrl?: string;
  attachmentName?: string;
  reactionType?: string;
}

let messageQueue: QueuedMessage[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let retentionTimer: NodeJS.Timeout | null = null;

/**
 * Flush queued messages to database
 */
function flushMessageQueue(): void {
  if (messageQueue.length === 0) {
    return;
  }

  try {
    const db = getMessageDatabase();
    const messagesToWrite = [...messageQueue];
    messageQueue = [];

    log.debug(`[MessageLogger] Flushing ${messagesToWrite.length} messages to database`);

    for (const message of messagesToWrite) {
      try {
        db.upsertMessage(message);
      } catch (error) {
        log.error('[MessageLogger] Failed to write message:', error);
      }
    }

    log.info(`[MessageLogger] Successfully wrote ${messagesToWrite.length} messages`);
  } catch (error) {
    log.error('[MessageLogger] Failed to flush message queue:', error);
  }
}

/**
 * Schedule a flush of the message queue
 */
function scheduleFlush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => {
    flushMessageQueue();
    flushTimer = null;
  }, MESSAGE_LOGGING.BATCH_WRITE_DELAY);
}

/**
 * Enforce data retention policy
 */
function enforceRetention(): void {
  try {
    const config = store.get('messageLogging') as {
      enabled: boolean;
      retentionDays: number;
    };

    if (!config.enabled) {
      return;
    }

    const db = getMessageDatabase();
    const deletedCount = db.enforceRetention(config.retentionDays);

    if (deletedCount > 0) {
      log.info(`[MessageLogger] Retention: Deleted ${deletedCount} old messages`);
    }
  } catch (error) {
    log.error('[MessageLogger] Failed to enforce retention:', error);
  }
}

/**
 * Initialize message logger feature
 */
export default function setupMessageLogger(_mainWindow: BrowserWindow): void {
  log.info('[MessageLogger] Initializing message logger feature');

  // Check if feature is enabled
  const config = store.get('messageLogging') as {
    enabled: boolean;
    retentionDays: number;
    excludedConversations: string[];
  };

  if (!config.enabled) {
    log.info('[MessageLogger] Feature is disabled, skipping initialization');
    return;
  }

  // Initialize database
  try {
    getMessageDatabase();
    log.info('[MessageLogger] Database initialized');
  } catch (error) {
    log.error('[MessageLogger] Failed to initialize database:', error);
    return;
  }

  // Set up IPC handler for message capture
  ipcMain.on(IPC_CHANNELS.MESSAGE_CAPTURED, (event, data) => {
    try {
      // Rate limiting
      if (!rateLimiter.isAllowed(IPC_CHANNELS.MESSAGE_CAPTURED, RATE_LIMITS.IPC_MESSAGE_CAPTURED)) {
        log.warn('[MessageLogger] Rate limited');
        return;
      }

      // Validate message data
      const validated = validateMessageData(data);

      // Check if conversation is excluded
      if (config.excludedConversations.includes(validated.conversationId)) {
        log.debug('[MessageLogger] Skipping excluded conversation:', validated.conversationId);
        return;
      }

      // Add to queue
      messageQueue.push(validated);
      log.debug(
        '[MessageLogger] Message queued:',
        validated.messageId,
        `(queue size: ${messageQueue.length})`
      );

      // Schedule flush
      scheduleFlush();
    } catch (error) {
      log.error('[MessageLogger] Failed to process message:', error);
    }
  });

  // Set up retention enforcement (run daily)
  retentionTimer = setInterval(
    () => {
      enforceRetention();
    },
    24 * 60 * 60 * 1000
  ); // 24 hours

  // Run retention check on startup
  enforceRetention();

  log.info('[MessageLogger] Message logger initialized successfully');
}

/**
 * Cleanup function
 */
export function cleanupMessageLogger(): void {
  log.info('[MessageLogger] Cleaning up message logger');

  // Flush any pending messages
  if (messageQueue.length > 0) {
    flushMessageQueue();
  }

  // Clear timers
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (retentionTimer) {
    clearInterval(retentionTimer);
    retentionTimer = null;
  }

  // Close database
  closeMessageDatabase();

  log.info('[MessageLogger] Message logger cleaned up');
}
