#!/usr/bin/env node

/**
 * Headless GogChat startup harness for CI perf gating (PI1).
 *
 * Launches the built Electron app with:
 *   - GOGCHAT_EXPORT_METRICS=1        (signals intent — informational)
 *   - GOGCHAT_AUTO_QUIT_AFTER_MS=12000 (max lifetime; we also self-quit)
 *   - NODE_ENV=development             (triggers existing perf JSON export
 *                                        in `cacheWarmer.runDevPostDeferred`)
 *   - --user-data-dir=<temp>           (controls where performance-metrics.json lands)
 *
 * Polls the temp userData dir for `performance-metrics.json`. Once it appears
 * AND is stable for one tick, copies it to `./performance-metrics.json` in the
 * repo root, then terminates the Electron process.
 *
 * Exit codes:
 *   0 — metrics JSON captured and copied successfully
 *   1 — Electron crashed before producing metrics, or timeout reached
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const TIMEOUT_MS = Number(process.env.HEADLESS_TIMEOUT_MS || 60_000);
const AUTO_QUIT_MS = Number(process.env.GOGCHAT_AUTO_QUIT_AFTER_MS || 12_000);
const POLL_INTERVAL_MS = 250;

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-perf-'));
const metricsPathInUserData = path.join(userDataDir, 'performance-metrics.json');
const outputPath = path.resolve(repoRoot, 'performance-metrics.json');

function log(msg) {
  process.stdout.write(`[headless-startup] ${msg}\n`);
}

function resolveElectronBinary() {
  // Prefer the installed Electron binary directly so we avoid spawning bun/npm wrappers.
  // electron's npm package exports the absolute path as default export.
  const tryPaths = [
    path.join(repoRoot, 'node_modules', '.bin', 'electron'),
    path.join(repoRoot, 'node_modules', '.bin', 'electron.cmd'),
  ];
  for (const p of tryPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'electron';
}

async function main() {
  if (!fs.existsSync(path.join(repoRoot, 'lib', 'main', 'index.js'))) {
    log('ERROR: lib/main/index.js missing — run `bun run build:prod` first.');
    process.exit(1);
  }

  // Ensure stale output is removed so we don't accidentally accept a previous run.
  try {
    fs.rmSync(outputPath, { force: true });
  } catch {
    /* ignore */
  }

  const electron = resolveElectronBinary();
  const args = ['.', `--user-data-dir=${userDataDir}`];

  log(`Spawning Electron: ${electron} ${args.join(' ')}`);
  log(`User data dir: ${userDataDir}`);
  log(`Watching for: ${metricsPathInUserData}`);

  const child = spawn(electron, args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      GOGCHAT_EXPORT_METRICS: '1',
      GOGCHAT_AUTO_QUIT_AFTER_MS: String(AUTO_QUIT_MS),
      // Headless hints (most of these are no-ops on macOS but harmless)
      ELECTRON_DISABLE_SANDBOX: process.env.ELECTRON_DISABLE_SANDBOX || '',
      CI: process.env.CI || '1',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  let resolved = false;
  let timedOut = false;
  let lastChildExit = null;

  child.on('exit', (code, signal) => {
    lastChildExit = { code, signal };
    log(`Electron exited (code=${code}, signal=${signal})`);
  });

  // Hard timeout
  const overallTimer = setTimeout(() => {
    timedOut = true;
    log(`Overall timeout (${TIMEOUT_MS}ms) — killing Electron.`);
    safeKill(child);
  }, TIMEOUT_MS);

  // Self-quit safety: if app ignores AUTO_QUIT_AFTER_MS, ensure we still terminate it
  // shortly after the metrics JSON appears.
  const stableNeeded = 2; // poll-cycles file size must be stable

  let stableCount = 0;
  let lastSize = -1;

  while (!resolved && !timedOut && lastChildExit == null) {
    if (fs.existsSync(metricsPathInUserData)) {
      try {
        const { size } = fs.statSync(metricsPathInUserData);
        if (size > 0 && size === lastSize) {
          stableCount++;
        } else {
          stableCount = 0;
          lastSize = size;
        }
        if (stableCount >= stableNeeded) {
          resolved = true;
          break;
        }
      } catch {
        /* file may be mid-write; keep polling */
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }

  clearTimeout(overallTimer);

  if (resolved) {
    try {
      fs.copyFileSync(metricsPathInUserData, outputPath);
      log(`Metrics copied to: ${outputPath}`);
    } catch (err) {
      log(`ERROR copying metrics: ${err.message}`);
      safeKill(child);
      await waitExit(child);
      process.exit(1);
    }
  }

  // Always terminate the child if still alive.
  if (lastChildExit == null) {
    safeKill(child);
    await waitExit(child);
  }

  // Cleanup temp userData (best-effort)
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (resolved) {
    process.exit(0);
  }

  if (timedOut) {
    log('FAILURE: timed out waiting for performance-metrics.json');
  } else {
    log(`FAILURE: Electron exited before producing metrics (code=${lastChildExit?.code})`);
  }
  process.exit(1);
}

function safeKill(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  // Force kill after grace period
  setTimeout(() => {
    if (child && !child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
  }, 3000).unref();
}

function waitExit(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode != null || child.killed) return resolve();
    child.once('exit', () => resolve());
    setTimeout(resolve, 5000).unref();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  log(`Fatal: ${err?.stack || err}`);
  process.exit(1);
});
