/**
 * Account Session Maintenance — periodic clearCodeCaches on idle accounts (T11)
 *
 * Tracks per-account activity (focus/blur/show/hide) and periodically clears V8
 * code caches for accounts that have been idle beyond a threshold. This frees
 * memory tied to compiled JS without touching cookies, localStorage, or IDB.
 *
 * The {@link AccountActivityTracker} is a general-purpose timestamp registry —
 * T12 will reuse it with a different threshold (5 min) for window dehydration.
 *
 * @module accountSessionMaintenance
 */

import { app, session } from 'electron';
import log from 'electron-log';
import { createTrackedInterval } from '../lifecycle/resourceCleanup.js';
import { toErrorMessage } from '../lifecycle/errorUtils.js';
import { asType } from '../../../shared/typeUtils.js';
import type { IAccountWindowManager } from '../../../shared/types/window.js';
import type { AccountIndex } from '../../../shared/types/branded.js';
import { toPartition } from '../../../shared/types/branded.js';

/** Tick interval for the maintenance scheduler (5 minutes). */
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

/** Idle threshold for clearCodeCaches (30 minutes). */
const IDLE_THRESHOLD_MS = 30 * 60 * 1000;

/** Idle threshold for full HTTP cache clearing (2 hours). */
const HTTP_CACHE_IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/** Idle threshold for service worker storage clearing (6 hours). */
const SERVICE_WORKER_IDLE_THRESHOLD_MS = 6 * 60 * 60 * 1000;

/** Idle threshold for memory-pressure-triggered dehydration (30 seconds). */
const PRESSURE_IDLE_THRESHOLD_MS = 30 * 1000;

/**
 * Per-account activity timestamp registry.
 *
 * Records the last "activity" tick for each account index. Activity is signaled
 * externally (focus, blur, show, hide events from the BrowserWindow). The
 * tracker is purely passive — it stores millisecond timestamps and answers
 * idle-detection queries.
 */
export class AccountActivityTracker {
  private readonly lastActivity = new Map<AccountIndex, number>();

  /**
   * Stamp `Date.now()` as the most recent activity time for an account.
   */
  recordActivity(accountIndex: AccountIndex): void {
    this.lastActivity.set(accountIndex, Date.now());
  }

  /**
   * Get the most recent activity timestamp for an account, or undefined if
   * no activity has been recorded.
   */
  getLastActivity(accountIndex: AccountIndex): number | undefined {
    return this.lastActivity.get(accountIndex);
  }

  /**
   * Return account indices whose last activity is older than `thresholdMs`.
   *
   * Accounts in `excludeIndices` (e.g. accounts being interacted with right now)
   * are filtered out. Accounts with no recorded activity are NOT considered idle —
   * they have never been seen, so we have no signal to act on.
   */
  getIdleAccounts(thresholdMs: number, excludeIndices?: Set<AccountIndex>): AccountIndex[] {
    const now = Date.now();
    const idle: AccountIndex[] = [];
    for (const [accountIndex, lastTime] of this.lastActivity) {
      if (excludeIndices?.has(accountIndex)) {
        continue;
      }
      if (now - lastTime >= thresholdMs) {
        idle.push(accountIndex);
      }
    }
    return idle;
  }

  /**
   * Drop all recorded activity. Used by the singleton destroyer.
   */
  clear(): void {
    this.lastActivity.clear();
  }
}

// ─── Maintenance scheduler ───────────────────────────────────────────────────

let maintenanceInterval: NodeJS.Timeout | null = null;
let pressureHandler: (() => void) | null = null;

/**
 * Start the periodic maintenance scheduler.
 *
 * Every 5 minutes, every account that has been idle for >= 30 minutes (and is
 * NOT a bootstrap window per `manager.isBootstrap(i)`) has its V8 code cache
 * cleared via `session.fromPartition('persist:account-N').clearCodeCaches()`.
 *
 * Calling this while a scheduler is already running is a no-op.
 */
export function startSessionMaintenance(
  tracker: AccountActivityTracker,
  manager: IAccountWindowManager
): void {
  if (maintenanceInterval) {
    return;
  }
  maintenanceInterval = createTrackedInterval(
    () => {
      // Build the active-accounts exclusion set once per tick. Bootstrap
      // accounts must never have their caches touched mid-auth.
      const bootstrapAccounts = new Set<AccountIndex>(manager.getBootstrapAccounts());

      // ── Tier 1 — V8 code cache (idle >= 30 min) ─────────────────────
      const idleAccounts = tracker.getIdleAccounts(IDLE_THRESHOLD_MS, bootstrapAccounts);
      for (const accountIndex of idleAccounts) {
        if (manager.isBootstrap(accountIndex)) {
          continue;
        }
        try {
          const partition = toPartition(accountIndex);
          void session.fromPartition(partition).clearCodeCaches({ urls: [] });
          log.debug(
            `[AccountSessionMaintenance] Cleared code cache for idle account ${accountIndex}`
          );
        } catch (error: unknown) {
          log.debug(
            `[AccountSessionMaintenance] clearCodeCaches failed for account ${accountIndex}: ${toErrorMessage(error)}`,
            error
          );
        }
      }

      // ── Tier 2 — Full HTTP cache (idle >= 2 hours) ────────
      const twoHourIdle = tracker.getIdleAccounts(HTTP_CACHE_IDLE_THRESHOLD_MS, bootstrapAccounts);
      for (const accountIndex of twoHourIdle) {
        if (manager.isBootstrap(accountIndex)) {
          continue;
        }
        try {
          const partition = toPartition(accountIndex);
          void session
            .fromPartition(partition)
            .clearCache()
            .then(() => {
              log.debug(
                `[AccountSessionMaintenance] Cleared HTTP cache for idle account ${accountIndex}`
              );
            })
            .catch((err: unknown) => {
              log.warn(
                `[AccountSessionMaintenance] clearCache failed for account ${accountIndex}: ${toErrorMessage(err)}`
              );
            });
        } catch (error: unknown) {
          log.warn(
            `[AccountSessionMaintenance] clearCache failed for account ${accountIndex}: ${toErrorMessage(error)}`
          );
        }
      }

      // ── Tier 3 — Service worker storage (idle >= 6 hours) ─
      const sixHourIdle = tracker.getIdleAccounts(
        SERVICE_WORKER_IDLE_THRESHOLD_MS,
        bootstrapAccounts
      );
      for (const accountIndex of sixHourIdle) {
        if (manager.isBootstrap(accountIndex)) {
          continue;
        }
        try {
          const partition = toPartition(accountIndex);
          void session
            .fromPartition(partition)
            .clearStorageData({ storages: ['serviceworkers'] })
            .then(() => {
              log.info(
                `[AccountSessionMaintenance] Cleared service workers for idle account ${accountIndex}`
              );
            })
            .catch((err: unknown) => {
              log.warn(
                `[AccountSessionMaintenance] clearStorageData(serviceworkers) failed for account ${accountIndex}: ${toErrorMessage(err)}`
              );
            });
        } catch (error: unknown) {
          log.warn(
            `[AccountSessionMaintenance] clearStorageData(serviceworkers) failed for account ${accountIndex}: ${toErrorMessage(error)}`
          );
        }
      }
    },
    MAINTENANCE_INTERVAL_MS,
    'accountSessionMaintenance'
  );

  // Register memory pressure handler to shed idle renderers.
  // macOS sends 'memory-pressure' when the system is low on RAM. We respond
  // by dehydrating ALL idle accounts (including account-0 when idle) to
  // immediately free renderer memory.
  pressureHandler = () => {
    const pressureIdle = tracker.getIdleAccounts(PRESSURE_IDLE_THRESHOLD_MS);
    let dehydratedCount = 0;
    for (const idx of pressureIdle) {
      // Bootstrap accounts must never be dehydrated — they are mid-auth.
      if (manager.isBootstrap(idx)) {
        continue;
      }
      // Only dehydrate if the account is not already dehydrated.
      if (!manager.isDehydrated(idx)) {
        manager.dehydrateAccount(idx);
        dehydratedCount++;
      }
    }
    if (dehydratedCount > 0) {
      log.info(
        `[AccountSessionMaintenance] Memory pressure: dehydrated ${dehydratedCount} idle account(s)`
      );
    }
  };
  // Guard: in unit-test environments where `electron` is partially mocked,
  // `app` may be missing. Wrap registration so a missing export does not throw.
  try {
    asType<NodeJS.EventEmitter>(app).on('memory-pressure', pressureHandler);
  } catch (error: unknown) {
    log.debug(
      `[AccountSessionMaintenance] memory-pressure handler not registered: ${toErrorMessage(error)}`
    );
  }

  log.info(
    '[AccountSessionMaintenance] Scheduler started (5-min tick; thresholds: 30-min code cache, 2-hr HTTP cache, 6-hr service workers; memory-pressure handler armed)'
  );
}

/**
 * Stop the maintenance scheduler. Safe to call when not running.
 */
export function stopSessionMaintenance(): void {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
    log.info('[AccountSessionMaintenance] Scheduler stopped');
  }
  if (pressureHandler) {
    try {
      asType<NodeJS.EventEmitter>(app).removeListener('memory-pressure', pressureHandler);
    } catch {
      // app missing in test environments — ignore
    }
    pressureHandler = null;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let tracker: AccountActivityTracker | null = null;

/**
 * Get or create the global activity tracker singleton.
 */
export function getAccountActivityTracker(): AccountActivityTracker {
  if (!tracker) {
    tracker = new AccountActivityTracker();
  }
  return tracker;
}

/**
 * Destroy the global activity tracker singleton and stop maintenance.
 */
export function destroyAccountActivityTracker(): void {
  stopSessionMaintenance();
  if (tracker) {
    tracker.clear();
    tracker = null;
  }
}
