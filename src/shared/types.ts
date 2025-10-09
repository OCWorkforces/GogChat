/**
 * Shared TypeScript type definitions used across main and renderer processes
 */

/**
 * Icon type based on application state
 */
export type IconType = 'offline' | 'normal' | 'badge';

/**
 * Unread count data passed via IPC
 */
export interface UnreadCountData {
  count: number;
  timestamp: number;
}

/**
 * Favicon change data
 */
export interface FaviconData {
  href: string;
  type: IconType;
  timestamp: number;
}

/**
 * Window bounds for state persistence
 */
export interface WindowBounds {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

/**
 * Window state configuration
 */
export interface WindowState {
  bounds: WindowBounds;
  isMaximized: boolean;
}

/**
 * Application configuration
 */
export interface AppConfig {
  autoCheckForUpdates: boolean;
  autoLaunchAtLogin: boolean;
  startHidden: boolean;
  hideMenuBar: boolean;
  disableSpellChecker: boolean;
  suppressPasskeyDialog: boolean;
}

/**
 * Store metadata for cache versioning and tracking
 * ⚡ OPTIMIZATION: Used for cache invalidation on app updates
 */
export interface StoreMetadata {
  cacheVersion?: string;
  lastAppVersion?: string;
  lastUpdated?: number;
}

/**
 * Complete electron-store type definition
 */
export interface StoreType extends Record<string, unknown> {
  window: WindowState;
  app: AppConfig;
  messageLogging: MessageLogConfig;
  _meta?: StoreMetadata;
}

/**
 * Online status data
 */
export interface OnlineStatusData {
  online: boolean;
  timestamp: number;
}

/**
 * Passkey authentication failure data
 */
export interface PasskeyFailureData {
  errorType: string;
  timestamp: number;
}

/**
 * IPC event handler type
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IPCHandler<T = any> = (event: Electron.IpcMainEvent, data: T) => void | Promise<void>;

/**
 * Validated IPC message wrapper
 */
export interface ValidatedIPCMessage<T> {
  channel: string;
  data: T;
  timestamp: number;
  valid: boolean;
  error?: string;
}

/**
 * Context Bridge API exposed to renderer
 */
export interface GChatBridgeAPI {
  // Send messages to main process
  sendUnreadCount: (count: number) => void;
  sendFaviconChanged: (href: string) => void;
  sendNotificationClicked: () => void;
  checkIfOnline: () => void;
  reportPasskeyFailure: (errorType: string) => void;
  sendMessageData: (messageData: MessageData) => void;

  // Receive messages from main process
  onSearchShortcut: (callback: () => void) => () => void;
  onOnlineStatus: (callback: (online: boolean) => void) => () => void;
}

/**
 * Extended window interface with our custom API
 */
declare global {
  interface Window {
    gchat: GChatBridgeAPI;
  }
}

/**
 * Rate limit tracking data
 */
export interface RateLimitEntry {
  timestamps: number[];
  blocked: number;
}

/**
 * Badge icon cache entry
 */
export interface BadgeIconCacheEntry {
  icon: Electron.NativeImage;
  count: number;
  timestamp: number;
}

/**
 * External link validation result
 */
export interface LinkValidationResult {
  valid: boolean;
  sanitizedURL?: string;
  reason?: string;
}

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  timestamp: number;
  level: 'error' | 'warn' | 'info' | 'debug';
  scope: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  startupTime?: number;
  ipcMessageCount: number;
  memoryUsage?: NodeJS.MemoryUsage;
  domObserverCount: number;
}

/**
 * Message logging feature types
 */

/**
 * Message type classification
 */
export type MessageType = 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';

/**
 * Conversation type
 */
export type ConversationType = 'direct' | 'group' | 'space';

/**
 * Raw message data extracted from DOM and passed via IPC
 */
export interface MessageData {
  messageId: string;
  content: string;
  sender: string;
  timestamp: string; // ISO 8601 format
  conversationId: string;
  conversationName: string;
  conversationType: ConversationType;
  messageType: MessageType;
  isOutgoing: boolean;
  // Optional fields
  receiverName?: string; // For direct messages
  participants?: string[]; // For group chats
  attachmentUrl?: string; // For files/images
  attachmentName?: string;
  reactionType?: string; // For reactions
}

/**
 * Message logging configuration
 */
export interface MessageLogConfig {
  enabled: boolean;
  retentionDays: number;
  excludedConversations: string[];
  showAnalyticsInTray: boolean;
  maxMessageSize: number; // Maximum message content length to store
}

/**
 * Database message record (stored format)
 */
export interface MessageRecord {
  id: number; // Auto-increment primary key
  messageId: string; // Unique message ID from Google Chat
  conversationId: string;
  conversationName: string;
  conversationType: ConversationType;
  sender: string;
  content: string; // Encrypted in database
  timestamp: number; // Unix timestamp (ms)
  messageType: MessageType;
  isOutgoing: boolean;
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt: number; // When record was inserted
  updatedAt?: number; // For tracking edits
}

/**
 * Conversation record
 */
export interface ConversationRecord {
  id: string; // Conversation ID from Google Chat
  name: string;
  type: ConversationType;
  participants: string; // JSON-encoded array
  firstSeen: number; // Unix timestamp
  lastActivity: number; // Unix timestamp
  messageCount: number;
}

/**
 * Analytics statistics
 */
export interface MessageStatistics {
  totalMessages: number;
  sentMessages: number;
  receivedMessages: number;
  activeConversations: number;
  mostActiveConversation: {
    name: string;
    count: number;
  };
  messagesPerDay: { date: string; count: number }[];
  messagesByType: Record<MessageType, number>;
  timeRange: {
    start: number;
    end: number;
  };
}
