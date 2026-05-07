/**
 * Application configuration and persistent store schema.
 */

import type { WindowState, AccountWindowsMap } from './window.js';

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
  notificationPermissionRequested: boolean;
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
 * Memory optimization configuration (hidden prefs, not in UI).
 */
export interface MemoryConfig {
  /** Dehydration idle threshold in ms (default 90000 = 90s). Range: 60000-600000. */
  dehydrationThresholdMs?: number;
  /** V8 heap cap per renderer in MB (applied via --js-flags before app.ready). Default: 512. */
  v8HeapCapMB?: number;
  /** Disk cache max size per account in MB (0 = clear, undefined = unlimited). Not yet enforced. */
  diskCacheMaxMB?: number;
}

/**
 * Complete electron-store type definition
 */
export interface StoreType extends Record<string, unknown> {
  window: WindowState;
  app: AppConfig;
  _meta?: StoreMetadata;
  accountWindows?: AccountWindowsMap;
  /** Hidden memory optimization preferences (not exposed in UI). */
  memory?: MemoryConfig;
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
