/**
 * CDP Metrics Storage
 *
 * Stores Chrome DevTools Protocol performance samples locally in a per-account
 * JSON file under `userData/cdp-metrics-account-{N}.json`. Zero network — data
 * never leaves the user's machine. Used by the `cdpTelemetry` feature to track
 * Google Chat real-user performance over time without a SQLite dependency.
 *
 * Storage shape:
 * ```
 * {
 *   "version": 1,
 *   "records": [
 *     { "timestamp": 1700000000000, "metrics": { "JSHeapUsedSize": 12345, ... } }
 *   ],
 *   "lastCleanup": 1700000000000
 * }
 * ```
 *
 * Rolling buffer: the latest {@link MAX_RECORDS_PER_ACCOUNT} records per account
 * (FIFO eviction). On any I/O failure callers do not crash — we log a warning
 * and continue. This module is best-effort observability, never load-bearing.
 *
 * @module cdpMetrics
 */

import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import log from 'electron-log';

/** Maximum records retained per account before FIFO eviction kicks in. */
export const MAX_RECORDS_PER_ACCOUNT = 1000;

/** Single CDP performance sample. */
export interface CdpMetricRecord {
  timestamp: number;
  metrics: Record<string, number>;
  layoutShift?: number;
  longTasks?: number[];
}

/** On-disk shape of the per-account metrics file. */
export interface CdpMetricsFile {
  version: 1;
  records: CdpMetricRecord[];
  lastCleanup: number;
}

function getMetricsFilePath(accountIndex: number): string {
  return path.join(app.getPath('userData'), `cdp-metrics-account-${accountIndex}.json`);
}

function emptyFile(): CdpMetricsFile {
  return { version: 1, records: [], lastCleanup: Date.now() };
}

/**
 * Read the metrics file for an account. Returns an empty file shape on any
 * error (missing file, malformed JSON, version mismatch).
 */
function readMetricsFile(accountIndex: number): CdpMetricsFile {
  const filePath = getMetricsFilePath(accountIndex);
  try {
    if (!fs.existsSync(filePath)) {
      return emptyFile();
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') {
      return emptyFile();
    }
    const candidate = parsed as Partial<CdpMetricsFile>;
    if (candidate.version !== 1 || !Array.isArray(candidate.records)) {
      return emptyFile();
    }
    return {
      version: 1,
      records: candidate.records,
      lastCleanup: typeof candidate.lastCleanup === 'number' ? candidate.lastCleanup : Date.now(),
    };
  } catch (error: unknown) {
    log.warn('[CdpMetrics] Failed to read metrics file, resetting:', error);
    return emptyFile();
  }
}

function writeMetricsFile(accountIndex: number, file: CdpMetricsFile): void {
  const filePath = getMetricsFilePath(accountIndex);
  try {
    fs.writeFileSync(filePath, JSON.stringify(file));
  } catch (error: unknown) {
    log.warn('[CdpMetrics] Failed to write metrics file:', error);
  }
}

/**
 * Append a CDP sample to the rolling buffer for the given account. FIFO-evicts
 * once the buffer exceeds {@link MAX_RECORDS_PER_ACCOUNT}. Best-effort: any
 * I/O failure is logged and swallowed.
 */
export function recordMetrics(
  accountIndex: number,
  metrics: Record<string, number>,
  extras?: { layoutShift?: number; longTasks?: number[] }
): void {
  const file = readMetricsFile(accountIndex);
  const record: CdpMetricRecord = { timestamp: Date.now(), metrics };
  if (extras?.layoutShift !== undefined) record.layoutShift = extras.layoutShift;
  if (extras?.longTasks !== undefined) record.longTasks = extras.longTasks;

  file.records.push(record);
  if (file.records.length > MAX_RECORDS_PER_ACCOUNT) {
    file.records.splice(0, file.records.length - MAX_RECORDS_PER_ACCOUNT);
  }
  writeMetricsFile(accountIndex, file);
}

/**
 * Returns a defensive copy of all records currently buffered for an account.
 * Intended for offline analysis tooling — not on the hot path.
 */
export function getMetrics(accountIndex: number): CdpMetricRecord[] {
  return readMetricsFile(accountIndex).records.slice();
}

/**
 * Drop records older than {@link maxAgeDays} days from the buffer for the
 * given account. Updates `lastCleanup`. No-op (with a single write) if no
 * records are eligible.
 */
export function cleanupOldRecords(accountIndex: number, maxAgeDays: number): void {
  const file = readMetricsFile(accountIndex);
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const beforeCount = file.records.length;
  file.records = file.records.filter((r) => r.timestamp >= cutoff);
  file.lastCleanup = Date.now();
  if (file.records.length !== beforeCount) {
    log.debug(
      `[CdpMetrics] Cleaned ${beforeCount - file.records.length} old records (account ${accountIndex})`
    );
  }
  writeMetricsFile(accountIndex, file);
}
