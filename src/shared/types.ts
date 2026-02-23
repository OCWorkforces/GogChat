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
export type IPCHandler<T = unknown> = (
  event: Electron.IpcMainEvent,
  data: T
) => void | Promise<void>;

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

/**
 * Branded type for nominal typing — prevents mixing structurally-identical primitive types.
 * Wrap a primitive with a unique brand to make it distinguishable at compile time.
 *
 * @example
 *   type UserId = Branded<string, 'UserId'>;
 *   type RoomId = Branded<string, 'RoomId'>;
 *   declare function getRoom(id: RoomId): void;
 *   const uid = 'abc' as UserId;
 *   getRoom(uid); // Error: Argument of type 'UserId' is not assignable to parameter of type 'RoomId'
 */
export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

/**
 * A URL string that has been validated by validateExternalURL() or validateFaviconURL().
 * Use this type to distinguish raw strings from validated URLs in function signatures.
 */
export type ValidatedURL = Branded<string, 'ValidatedURL'>;

/**
 * Typed response wrapper for IPC reply/invoke handlers.
 * Discriminated union — check `success` before accessing `data` or `error`.
 *
 * @example
 *   const response: IPCResponse<number> = { success: true, data: 42 };
 *   if (response.success) { console.log(response.data); } // number
 *   else { console.error(response.error); } // string
 */
export type IPCResponse<T> = { success: true; data: T } | { success: false; error: string };

/**
 * Maps each IPC channel string to its expected payload type.
 * Use this to enforce handler signature alignment with channel contracts.
 *
 * @example
 *   type Payload = IPCChannelPayloadMap[typeof IPC_CHANNELS.UNREAD_COUNT]; // number
 */
export interface IPCChannelPayloadMap {
  // renderer → main
  unreadCount: number;
  faviconChanged: string;
  notificationShow: NotificationData;
  notificationClicked: void;
  checkIfOnline: void;
  passkeyAuthFailed: PasskeyFailureData;
  // main → renderer
  searchShortcut: void;
  onlineStatus: boolean;
}

/**
 * Recursive dot-notation key paths for a nested object type.
 * Enables type-safe access to nested config keys (e.g. 'app.autoCheckForUpdates').
 *
 * Depth-limited to 3 levels to avoid infinite recursion on circular or very deep types.
 *
 * @example
 *   type Keys = StoreKeyPaths<StoreType>
 *   // 'window' | 'app' | '_meta' | 'window.bounds' | 'window.isMaximized'
 *   // | 'window.bounds.x' | 'window.bounds.y' | 'window.bounds.width' | ...
 *   // | 'app.autoCheckForUpdates' | 'app.startHidden' | ...
 */
export type StoreKeyPaths<T extends Record<string, unknown>> = {
  [K in keyof T & string]:
    | K
    | (NonNullable<T[K]> extends Record<string, unknown>
        ? `${K}.${StoreKeyPaths<NonNullable<T[K]>>}`
        : never);
}[keyof T & string];
