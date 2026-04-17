/**
 * Shared TypeScript type definitions used across main and renderer processes.
 *
 * Backward-compatibility barrel — the real type definitions now live in
 * `./types/` split across domain-specific files (branded, window, domain,
 * config, ipc, bridge). NodeNext module resolution requires this file to
 * exist so existing `from '../shared/types.js'` / `'../../shared/types.js'`
 * imports keep resolving without touching the 17 call sites.
 */

export type * from './types/index.js';
export type { StoreKeyPaths } from './types/index.js';
