/**
 * Domain data types passed across process boundaries.
 */

/**
 * Icon type based on application state
 */
export type IconType = 'offline' | 'normal' | 'badge';

/**
 * Discriminated union for icon state — badge variant carries a count,
 * offline/normal variants carry no additional data.
 * Prefer this over `IconType` string union in new code.
 */
export type IconState =
  | { readonly type: 'offline' }
  | { readonly type: 'normal' }
  | { readonly type: 'badge'; readonly count: number };

/**
 * Unread count data passed via IPC
 */
export interface UnreadCountData {
  readonly count: number;
  readonly timestamp: number;
}

/**
 * Favicon change data
 */
export interface FaviconData {
  readonly href: string;
  readonly type: IconType;
  readonly timestamp: number;
}

/**
 * Online status data
 */
export interface OnlineStatusData {
  readonly online: boolean;
  readonly timestamp: number;
}

/**
 * Passkey authentication failure data
 */
/**
 * Known WebAuthn/FIDO error type names for passkey authentication failures.
 * The `string & {}` intersection allows forward-compatible unknown error types
 * while preserving autocomplete on known values.
 */
export type PasskeyErrorType =
  | 'NotAllowedError'
  | 'NotSupportedError'
  | 'SecurityError'
  | 'AbortError'
  | 'ConstraintError'
  | 'InvalidStateError'
  | 'UnknownError'
  | 'TimeoutError';

export interface PasskeyFailureData {
  readonly errorType: PasskeyErrorType | (string & {});
  readonly timestamp: number;
}

/**
 * Notification data passed via IPC
 */
export interface NotificationData {
  readonly title: string;
  readonly body?: string;
  readonly icon?: string;
  readonly tag?: string;
  readonly timestamp: number;
}

/**
 * Badge icon cache entry
 */
export interface BadgeIconCacheEntry {
  readonly icon: Electron.NativeImage;
  readonly count: number;
  readonly timestamp: number;
}

/**
 * External link validation result
 */
export interface LinkValidationResult {
  readonly valid: boolean;
  readonly sanitizedURL?: string;
  readonly reason?: string;
}

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  readonly timestamp: number;
  readonly level: 'error' | 'warn' | 'info' | 'debug';
  readonly scope: string;
  readonly message: string;
  readonly stack?: string;
  readonly meta?: Record<string, unknown>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  readonly startupTime?: number;
  readonly ipcMessageCount: number;
  readonly memoryUsage?: NodeJS.MemoryUsage;
  readonly domObserverCount: number;
}
