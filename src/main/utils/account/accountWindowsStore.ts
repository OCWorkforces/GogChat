/**
 * Shared persistence helpers for the `accountWindows` config key.
 *
 * Both account-window backends ({@link AccountWindowManager} —
 * BrowserWindow per account — and {@link AccountViewManager} —
 * WebContentsView in a single host BrowserWindow) read and write the
 * same `accountWindows` config map. Without coordination, concurrent
 * read-modify-write sequences (resize, save-on-close, app quit) can
 * lose updates: two reads observe the same baseline and the second
 * write overwrites the first.
 *
 * This module owns the serialization queue and a small read helper so
 * both managers share one safe code path. It is *composition* — the
 * managers call into these helpers rather than inheriting from a base
 * class.
 *
 * @module accountWindowsStore
 */

import type { BrowserWindow } from 'electron';
import { configGet, configSet } from '../../config.js';
import type { AccountWindowState, AccountWindowsMap } from '../../../shared/types/window.js';
import type { AccountIndex } from '../../../shared/types/branded.js';

/**
 * Serialized write queue for the `accountWindows` config key.
 *
 * All mutations to `accountWindows` MUST go through
 * {@link updateAccountWindows} so they execute sequentially on this
 * microtask chain.
 */
let accountWindowsWriteQueue: Promise<void> = Promise.resolve();

/**
 * Apply `updater` to the current `accountWindows` map atomically with
 * respect to other queued updates. Returns a promise resolved once the
 * underlying `configSet` has run.
 */
export function updateAccountWindows(
  updater: (current: AccountWindowsMap) => AccountWindowsMap
): Promise<void> {
  accountWindowsWriteQueue = accountWindowsWriteQueue
    .then(() => {
      const current = configGet('accountWindows') ?? {};
      configSet('accountWindows', updater(current));
    })
    // Detach error from chain head to prevent rejection deadlock.
    .catch(() => {});
  return accountWindowsWriteQueue;
}

/**
 * Await all pending `accountWindows` writes. Intended for tests and
 * shutdown paths that must observe a fully-flushed state.
 */
export function flushAccountWindowsWrites(): Promise<void> {
  return accountWindowsWriteQueue;
}

/**
 * Read the persisted state for a single account. Returns `null` when
 * the map is missing or the account has no entry.
 */
export function readAccountWindowState(accountIndex: AccountIndex): AccountWindowState | null {
  const all = configGet('accountWindows');
  return all?.[accountIndex] ?? null;
}

/**
 * Build a serializable {@link AccountWindowState} snapshot from a live
 * BrowserWindow's bounds and maximized flag. Shared by both backends
 * (per-account window and host window in the view-based path) so the
 * snapshot shape — and the field-by-field `getBounds()` projection —
 * stays in lockstep. The object is plain JSON: callers may persist it
 * directly via {@link persistAccountWindowState} or {@link updateAccountWindows}.
 */
export function buildAccountWindowState(window: BrowserWindow): AccountWindowState {
  const bounds = window.getBounds();
  return {
    bounds: {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    isMaximized: window.isMaximized(),
  };
}

/**
 * Persist `state` for `accountIndex` through the serialized write
 * queue. Equivalent to calling {@link updateAccountWindows} with a
 * spread-and-replace updater, but spelled out so backends do not
 * each re-derive the same merge logic. Returns the queued promise so
 * callers can `await` or `.catch` as needed.
 */
export function persistAccountWindowState(
  accountIndex: AccountIndex,
  state: AccountWindowState
): Promise<void> {
  return updateAccountWindows((current) => ({
    ...current,
    [accountIndex]: state,
  }));
}
