/**
 * Domain data types passed across process boundaries.
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
 * Notification data passed via IPC
 */
export interface NotificationData {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  timestamp: number;
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
