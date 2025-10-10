/**
 * Shared constants for IPC channels, selectors, and configuration values
 * This prevents typos and makes refactoring easier
 */

/**
 * IPC Channel names for communication between main and renderer processes
 */
export const IPC_CHANNELS = {
  // From renderer to main
  UNREAD_COUNT: 'unreadCount',
  FAVICON_CHANGED: 'faviconChanged',
  NOTIFICATION_SHOW: 'notificationShow',
  NOTIFICATION_CLICKED: 'notificationClicked',
  CHECK_IF_ONLINE: 'checkIfOnline',
  PASSKEY_AUTH_FAILED: 'passkeyAuthFailed',
  MESSAGE_CAPTURED: 'messageCaptured',

  // From main to renderer
  SEARCH_SHORTCUT: 'searchShortcut',
  ONLINE_STATUS: 'onlineStatus',
} as const;

/**
 * DOM selectors for Google Chat elements
 * These may need updating if Google changes their HTML structure
 */
export const SELECTORS = {
  // Unread count groups
  CHAT_GROUP: 'div[data-tooltip="Chat"][role="group"]',
  SPACES_GROUP: 'div[data-tooltip="Spaces"][role="group"]',
  UNREAD_HEADING: 'span[role="heading"]',

  // Search functionality
  SEARCH_INPUT: 'input[name="q"]',

  // Favicon tracking
  FAVICON_ICON: 'link[rel="icon"]',
  FAVICON_SHORTCUT: 'link[rel="shortcut icon"]',

  // Message logging (TODO: Update after DOM inspection with npm start)
  MESSAGE_CONTAINER: 'TODO_INSPECT_DOM', // Main message list container
  MESSAGE_ITEM: 'TODO_INSPECT_DOM', // Individual message element
  MESSAGE_ID_ATTR: 'data-message-id', // Attribute name for message ID (tentative)
  MESSAGE_CONTENT: 'TODO_INSPECT_DOM', // Message text content
  MESSAGE_SENDER: 'TODO_INSPECT_DOM', // Sender name
  MESSAGE_TIMESTAMP: 'TODO_INSPECT_DOM', // Message timestamp
  CONVERSATION_NAME: 'TODO_INSPECT_DOM', // Conversation/group name
  CONVERSATION_ID_ATTR: 'data-conversation-id', // Attribute for conversation ID (tentative)
} as const;

/**
 * Timing constants for polling and throttling
 */
export const TIMING = {
  // Polling intervals (in milliseconds)
  FAVICON_POLL: 1000,
  UNREAD_COUNT_POLL: 1000,

  // Debounce/throttle delays
  WINDOW_STATE_SAVE: 500,

  // Timeouts
  CONNECTIVITY_CHECK: 5000,
  CONNECTIVITY_CHECK_FAST: 3000,
  NOTIFICATION_AUTO_DISMISS: 10000, // 10 seconds

  // Re-guard timer for external links
  EXTERNAL_LINKS_REGUARD: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Icon types based on favicon state
 */
export const ICON_TYPES = {
  OFFLINE: 'offline',
  NORMAL: 'normal',
  BADGE: 'badge',
} as const;

/**
 * Favicon URL patterns for detecting Google Chat state
 */
export const FAVICON_PATTERNS = {
  NORMAL: /favicon_chat_r2|favicon_chat_new_non_notif_r2/,
  BADGE: /favicon_chat_new_notif_r2/,
} as const;

/**
 * Rate limiting configuration
 */
export const RATE_LIMITS = {
  IPC_DEFAULT: 10, // messages per second
  IPC_UNREAD_COUNT: 5,
  IPC_FAVICON: 5,
  IPC_NOTIFICATION: 5, // Limit notification creation
  IPC_MESSAGE_CAPTURED: 100, // Higher limit for message capture (rapid conversations)
} as const;

/**
 * Badge icon limits
 */
export const BADGE = {
  MAX_COUNT: 9999,
  CACHE_LIMIT: 99, // Cache icons for counts 0-99
} as const;

/**
 * Whitelisted hosts for navigation
 */
export const WHITELISTED_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'chat.google.com',
  'mail.google.com',
] as const;

/**
 * URL patterns for special handling
 */
export const URL_PATTERNS = {
  DOWNLOAD: 'https://chat.google.com/u/0/api/get_attachment_url',
  GMAIL_PREFIX: 'https://mail.google.com/',
  CHAT_PREFIX: 'https://mail.google.com/chat',
} as const;

/**
 * Message logging configuration defaults
 */
export const MESSAGE_LOGGING = {
  DEFAULT_RETENTION_DAYS: 30,
  MAX_MESSAGE_SIZE: 50000, // 50KB
  MAX_CONVERSATION_NAME_LENGTH: 500,
  MAX_SENDER_NAME_LENGTH: 500,
  BATCH_WRITE_DELAY: 100, // Debounce delay in ms for batching DB writes
} as const;
