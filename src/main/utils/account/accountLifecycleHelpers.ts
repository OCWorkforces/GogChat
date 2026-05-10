/**
 * Account Lifecycle Helpers — shared composition utilities for account managers.
 *
 * Both {@link AccountWindowManager} (BrowserWindow-per-account) and
 * {@link AccountViewManager} (single-host + WebContentsView-per-account)
 * implement {@link IAccountWindowManager}. Several methods on that
 * interface are byte-identical between the two implementations because
 * they are pure delegates to the bootstrap tracker. Extracting them here
 * keeps the duplication out of the two large manager files via
 * composition — the managers spread {@link bootstrapDelegates} onto
 * themselves via class field assignment instead of writing four matching
 * wrapper methods each.
 *
 * Persistence of the `accountWindows` config map is handled separately
 * by {@link accountWindowsStore}, which already owns the serialized
 * write queue (`updateAccountWindows`) and the read helper
 * (`getAccountWindowState`). This module is intentionally narrow and
 * does NOT duplicate that surface.
 *
 * Intentionally NOT extracted (despite superficial similarity):
 *   - `markAsBootstrap`: the BrowserWindow path enforces a registry
 *     guard before delegating; the view path does not.
 *   - hydrate/dehydrate: completely different semantics (destroy/recreate
 *     vs hide/show).
 *
 * @module accountLifecycleHelpers
 */

import {
  isBootstrap as _isBootstrap,
  promoteBootstrap as _promoteBootstrap,
  clearBootstrap as _clearBootstrap,
  getBootstrapAccounts as _getBootstrapAccounts,
} from './bootstrapTracker.js';
import type { AccountIndex } from '../../../shared/types/branded.js';

/**
 * Bundle of bootstrap-tracker delegate methods that both managers expose
 * verbatim. Consumers compose by calling these directly — keeping the
 * forwarding logic in one place instead of four matching wrappers per
 * class.
 *
 * `markAsBootstrap` is intentionally absent: the BrowserWindow manager
 * adds a registry guard before delegating, so the two implementations
 * are not identical there.
 */
export const bootstrapDelegates = {
  isBootstrap(accountIndex: AccountIndex): boolean {
    return _isBootstrap(accountIndex);
  },
  promoteBootstrap(accountIndex: AccountIndex): boolean {
    return _promoteBootstrap(accountIndex);
  },
  clearBootstrap(accountIndex: AccountIndex): void {
    _clearBootstrap(accountIndex);
  },
  getBootstrapAccounts(): AccountIndex[] {
    return _getBootstrapAccounts();
  },
} as const;
