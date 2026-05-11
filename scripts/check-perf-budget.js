#!/usr/bin/env node

/**
 * CI Performance Regression Gate (PI1)
 *
 * Reads a `performance-metrics.json` file produced by GogChat at startup
 * (see `src/main/utils/account/cacheWarmer.ts → runDevPostDeferred`) and compares
 * 9 metrics against fixed budgets. Exits 1 if any **gated** metric fails.
 * Prints GitHub Actions annotations (`::error` / `::warning`) so failures
 * surface inline on PRs.
 *
 * Usage:
 *   node scripts/check-perf-budget.js [path/to/performance-metrics.json]
 *
 * Defaults to `./performance-metrics.json` when no argument is given.
 *
 * Exit codes:
 *   0 — all gated budgets met
 *   1 — at least one gated budget exceeded (or metrics file unreadable)
 *
 * Side effects:
 *   - Writes `.perf-history.json` (last 20 runs) for trend tracking.
 *   - Updates `.perf-baseline.json` ONLY when the env var
 *     `PERF_UPDATE_BASELINE=1` is set (never automatically in CI).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Budget definitions
// ---------------------------------------------------------------------------

/** @typedef {{ name: string, budget: number, unit: string, gated: boolean, extract: (m: object) => number | null, describe: string }} BudgetSpec */

const MB = 1024 * 1024;
const KB = 1024;

/** @type {BudgetSpec[]} */
const BUDGETS = [
  {
    name: 'totalStartup',
    budget: 2000,
    unit: 'ms',
    gated: true,
    describe: 'app-start → all-features-loaded',
    extract: (m) => diffMarkers(m, 'app-start', 'all-features-loaded'),
  },
  {
    name: 'windowFirstPaint',
    budget: 1500,
    unit: 'ms',
    gated: true,
    describe: 'app-ready → account-0-ready',
    extract: (m) => diffMarkers(m, 'app-ready', 'account-0-ready'),
  },
  {
    name: 'criticalPhase',
    budget: 1000,
    unit: 'ms',
    gated: true,
    describe: 'app-ready → features-loaded',
    extract: (m) => diffMarkers(m, 'app-ready', 'features-loaded'),
  },
  {
    name: 'heapBaseline',
    budget: 150 * MB,
    unit: 'MB',
    gated: true,
    describe: 'last memorySnapshot.heapUsed',
    extract: (m) => lastMemoryField(m, 'heapUsed'),
  },
  {
    name: 'rssBaseline',
    budget: 350 * MB,
    unit: 'MB',
    gated: false, // WARN only
    describe: 'last memorySnapshot.rss',
    extract: (m) => lastMemoryField(m, 'rss'),
  },
  {
    name: 'rendererCount',
    budget: 1,
    unit: 'count',
    gated: true,
    describe: 'unique renderer PIDs',
    extract: (m) => uniqueRendererCount(m),
  },
  {
    name: 'mainBundleSize',
    budget: 100 * KB,
    unit: 'KB',
    gated: true,
    describe: 'lib/main/index.js',
    extract: () => fileSize(path.join(repoRoot, 'lib', 'main', 'index.js')),
  },
  {
    name: 'preloadBundleSize',
    budget: 50 * KB,
    unit: 'KB',
    gated: true,
    describe: 'sum(lib/preload/*.js)',
    extract: () => preloadBundleSize(),
  },
  {
    name: 'buildTimeMs',
    budget: 500,
    unit: 'ms',
    gated: false, // WARN only
    describe: 'last entry of .build-history.json',
    extract: () => lastBuildTimeMs(),
  },
];

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

function diffMarkers(metrics, from, to) {
  const markers = metrics?.markers;
  if (!markers || typeof markers !== 'object') return null;
  const a = markers[from];
  const b = markers[to];
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return b - a;
}

function lastMemoryField(metrics, field) {
  const snaps = metrics?.memorySnapshots;
  if (!Array.isArray(snaps) || snaps.length === 0) return null;
  const last = snaps[snaps.length - 1];
  const v = last?.[field];
  return typeof v === 'number' ? v : null;
}

function uniqueRendererCount(metrics) {
  const snaps = metrics?.rendererSnapshots;
  if (!Array.isArray(snaps)) return 0;
  const renderers = snaps.filter((s) => s?.type === 'renderer' && typeof s?.pid === 'number');
  return new Set(renderers.map((s) => s.pid)).size;
}

function fileSize(absPath) {
  try {
    return fs.statSync(absPath).size;
  } catch {
    return null;
  }
}

function preloadBundleSize() {
  const dir = path.join(repoRoot, 'lib', 'preload');
  let total = 0;
  let found = false;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.js')) {
        total += fs.statSync(path.join(dir, entry.name)).size;
        found = true;
      }
    }
  } catch {
    return null;
  }
  return found ? total : null;
}

function lastBuildTimeMs() {
  const file = path.join(repoRoot, '.build-history.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(raw) ? raw : raw?.builds;
    if (!Array.isArray(list) || list.length === 0) return null;
    const last = list[list.length - 1];
    const v = last?.buildTimeMs ?? last?.durationMs ?? last?.elapsed;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatValue(value, unit) {
  if (value == null) return 'N/A';
  switch (unit) {
    case 'ms':
      return `${Math.round(value)}ms`;
    case 'MB':
      return `${(value / MB).toFixed(2)}MB`;
    case 'KB':
      return `${(value / KB).toFixed(2)}KB`;
    case 'count':
      return String(value);
    default:
      return String(value);
  }
}

function pct(actual, budget) {
  if (actual == null || !budget) return 'N/A';
  return `${((actual / budget) * 100).toFixed(1)}%`;
}

function annotate(level, message) {
  // GitHub Actions workflow command: ::error:: / ::warning::
  process.stdout.write(`::${level}::${message}\n`);
}

// ---------------------------------------------------------------------------
// History / baseline
// ---------------------------------------------------------------------------

function loadJSONSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeHistory(results) {
  const file = path.join(repoRoot, '.perf-history.json');
  const prev = loadJSONSafe(file);
  const list = Array.isArray(prev) ? prev : [];
  const entry = {
    timestamp: new Date().toISOString(),
    sha: process.env.GITHUB_SHA || null,
    ref: process.env.GITHUB_REF || null,
    metrics: Object.fromEntries(results.map((r) => [r.name, r.actual])),
  };
  list.push(entry);
  while (list.length > 20) list.shift();
  try {
    fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n');
  } catch (err) {
    process.stderr.write(`[perf-budget] Failed to write history: ${err.message}\n`);
  }
}

function maybeUpdateBaseline(results) {
  if (process.env.PERF_UPDATE_BASELINE !== '1') return;
  const file = path.join(repoRoot, '.perf-baseline.json');
  const baseline = {
    timestamp: new Date().toISOString(),
    sha: process.env.GITHUB_SHA || null,
    metrics: Object.fromEntries(results.map((r) => [r.name, r.actual])),
  };
  try {
    fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n');
    process.stdout.write(`[perf-budget] Baseline updated: ${file}\n`);
  } catch (err) {
    process.stderr.write(`[perf-budget] Failed to write baseline: ${err.message}\n`);
  }
}

function loadBaseline() {
  return loadJSONSafe(path.join(repoRoot, '.perf-baseline.json'));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const arg = process.argv[2] || './performance-metrics.json';
  const metricsPath = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);

  let metrics;
  try {
    metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  } catch (err) {
    annotate('error', `Cannot read metrics file ${metricsPath}: ${err.message}`);
    process.exit(1);
  }

  const baseline = loadBaseline();
  const baselineMetrics = baseline?.metrics || {};

  const results = BUDGETS.map((spec) => {
    let actual = null;
    try {
      actual = spec.extract(metrics);
    } catch (err) {
      process.stderr.write(`[perf-budget] extractor "${spec.name}" threw: ${err.message}\n`);
    }

    const baseValue = baselineMetrics[spec.name] ?? null;
    let status;
    if (actual == null) {
      status = 'SKIP';
    } else if (actual <= spec.budget) {
      status = 'PASS';
    } else {
      status = spec.gated ? 'FAIL' : 'WARN';
    }

    return { ...spec, actual, baseline: baseValue, status };
  });

  // ---------- Report ----------
  const COL = { name: 22, status: 6, actual: 14, budget: 14, util: 8, delta: 14 };
  const pad = (s, n) => String(s).padEnd(n);

  process.stdout.write('\n');
  process.stdout.write('Performance Budget Report\n');
  process.stdout.write('=========================\n');
  process.stdout.write(
    `${pad('METRIC', COL.name)}${pad('STATE', COL.status)}${pad('ACTUAL', COL.actual)}` +
      `${pad('BUDGET', COL.budget)}${pad('USED', COL.util)}${pad('Δ vs BASE', COL.delta)}\n`
  );
  process.stdout.write(
    `${'-'.repeat(COL.name + COL.status + COL.actual + COL.budget + COL.util + COL.delta)}\n`
  );

  for (const r of results) {
    const actualStr = formatValue(r.actual, r.unit);
    const budgetStr = formatValue(r.budget, r.unit);
    const utilStr = pct(r.actual, r.budget);
    let deltaStr = 'n/a';
    if (r.actual != null && typeof r.baseline === 'number') {
      const diff = r.actual - r.baseline;
      deltaStr = `${diff >= 0 ? '+' : '-'}${formatValue(Math.abs(diff), r.unit)}`;
    }
    const tag = r.gated ? '' : ' (warn)';
    process.stdout.write(
      `${pad(r.name + tag, COL.name)}${pad(r.status, COL.status)}${pad(actualStr, COL.actual)}` +
        `${pad(budgetStr, COL.budget)}${pad(utilStr, COL.util)}${pad(deltaStr, COL.delta)}\n`
    );
  }
  process.stdout.write('\n');

  // ---------- Annotations ----------
  let failed = 0;
  let warned = 0;
  let skipped = 0;
  for (const r of results) {
    const msg =
      `${r.name} (${r.describe}): actual=${formatValue(r.actual, r.unit)} ` +
      `budget=${formatValue(r.budget, r.unit)} (${pct(r.actual, r.budget)})`;
    if (r.status === 'FAIL') {
      failed++;
      annotate('error', `Perf budget exceeded — ${msg}`);
    } else if (r.status === 'WARN') {
      warned++;
      annotate('warning', `Perf budget exceeded (warn-only) — ${msg}`);
    } else if (r.status === 'SKIP') {
      skipped++;
      annotate('warning', `Perf metric unavailable — ${msg}`);
    }
  }

  writeHistory(results);
  maybeUpdateBaseline(results);

  process.stdout.write(
    `Summary: ${results.filter((r) => r.status === 'PASS').length} pass, ` +
      `${failed} fail, ${warned} warn, ${skipped} skip\n`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main();
