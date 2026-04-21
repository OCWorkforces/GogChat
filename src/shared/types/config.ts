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
  disableCertPinning: boolean;
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
  accountWindows?: AccountWindowsMap;
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
