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
