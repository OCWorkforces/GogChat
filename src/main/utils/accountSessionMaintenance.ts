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

import { session } from 'electron';
import log from 'electron-log';
import { createTrackedInterval } from './resourceCleanup.js';
import type { IAccountWindowManager } from '../../shared/types/window.js';

/** Tick interval for the maintenance scheduler (5 minutes). */
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;

/** Idle threshold for clearCodeCaches (30 minutes). */
const IDLE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Per-account activity timestamp registry.
 *
 * Records the last "activity" tick for each account index. Activity is signaled
 * externally (focus, blur, show, hide events from the BrowserWindow). The
 * tracker is purely passive — it stores millisecond timestamps and answers
 * idle-detection queries.
 */
export class AccountActivityTracker {
  private readonly lastActivity = new Map<number, number>();

  /**
   * Stamp `Date.now()` as the most recent activity time for an account.
   */
  recordActivity(accountIndex: number): void {
    this.lastActivity.set(accountIndex, Date.now());
  }

  /**
   * Get the most recent activity timestamp for an account, or undefined if
   * no activity has been recorded.
   */
  getLastActivity(accountIndex: number): number | undefined {
    return this.lastActivity.get(accountIndex);
  }

  /**
   * Return account indices whose last activity is older than `thresholdMs`.
   *
   * Accounts in `excludeIndices` (e.g. accounts being interacted with right now)
   * are filtered out. Accounts with no recorded activity are NOT considered idle —
   * they have never been seen, so we have no signal to act on.
   */
  getIdleAccounts(thresholdMs: number, excludeIndices?: Set<number>): number[] {
    const now = Date.now();
    const idle: number[] = [];
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
      const idleAccounts = tracker.getIdleAccounts(IDLE_THRESHOLD_MS);
      for (const accountIndex of idleAccounts) {
        if (manager.isBootstrap(accountIndex)) {
          continue;
        }
        try {
          const partition = `persist:account-${accountIndex}`;
          void session.fromPartition(partition).clearCodeCaches({ urls: [] });
          log.debug(
            `[AccountSessionMaintenance] Cleared code cache for idle account ${accountIndex}`
          );
        } catch (error) {
          log.debug(
            `[AccountSessionMaintenance] clearCodeCaches failed for account ${accountIndex}:`,
            error
          );
        }
      }
    },
    MAINTENANCE_INTERVAL_MS,
    'accountSessionMaintenance'
  );
  log.info('[AccountSessionMaintenance] Scheduler started (5-min tick, 30-min idle threshold)');
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
