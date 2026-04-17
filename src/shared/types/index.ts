/**
 * Shared TypeScript type definitions used across main and renderer processes.
 *
 * Barrel module — re-exports every domain-specific type file so existing imports
 * from `../shared/types.js` continue to resolve unchanged.
 */

export type * from './branded.js';
export type * from './window.js';
export type * from './domain.js';
export type * from './config.js';
export type * from './ipc.js';
export type * from './bridge.js';

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
