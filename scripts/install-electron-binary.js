#!/usr/bin/env node
// Repo-controlled Electron binary installer for macOS CI.
//
// Replaces `node node_modules/electron/install.js` because the upstream script
// can exit after a partial extraction under the current toolchain, leaving
// node_modules/electron/dist with only Contents/MacOS/Electron and no
// Contents/Frameworks or path.txt. The downloaded zip is checksum-valid; the
// extraction step is the failure point. macOS `ditto -x -k` extracts the full
// bundle reliably, so we drive the download via @electron/get and the
// extraction via `ditto` ourselves, then verify the result.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { constants as fsConstants } from 'node:fs';
import { accessSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { downloadArtifact } from '@electron/get';

const LOG_PREFIX = '[install-electron-binary]';
const PLATFORM_PATH = 'Electron.app/Contents/MacOS/Electron';

const require = createRequire(import.meta.url);

function log(message) {
  console.log(`${LOG_PREFIX} ${message}`);
}

function fail(message) {
  console.error(`${LOG_PREFIX} ERROR: ${message}`);
  process.exit(1);
}

function resolveArch(platform) {
  let arch = process.env.npm_config_arch || process.arch;
  if (
    platform === 'darwin' &&
    process.platform === 'darwin' &&
    arch === 'x64' &&
    process.env.npm_config_arch === undefined
  ) {
    // Preserve upstream install.js Rosetta detection: on macOS-on-macOS, if the
    // selected arch is x64 and not pinned via npm_config_arch, ask the kernel
    // whether we are running under Rosetta and switch to arm64 if so.
    const result = spawnSync('sysctl', ['-in', 'sysctl.proc_translated'], {
      encoding: 'utf8',
    });
    if (result.status === 0 && result.stdout && result.stdout.trim() === '1') {
      arch = 'arm64';
    }
  }
  return arch;
}

function resolveCacheRoot() {
  if (process.env.electron_config_cache) {
    return process.env.electron_config_cache;
  }
  const runnerTemp = process.env.RUNNER_TEMP;
  const runId = process.env.GITHUB_RUN_ID;
  if (runnerTemp && runId) {
    return path.join(runnerTemp, `electron-cache-${runId}`);
  }
  return undefined;
}

function extractWithDitto(zipPath, distPath) {
  log(`Extracting via ditto: ${zipPath} -> ${distPath}`);
  const result = spawnSync('ditto', ['-x', '-k', zipPath, distPath], {
    stdio: 'inherit',
  });
  if (result.error) {
    fail(`ditto failed to spawn: ${result.error.message}`);
  }
  if (typeof result.status !== 'number' || result.status !== 0) {
    fail(`ditto exited with non-zero status: ${result.status}`);
  }
}

function verifyInstall(electronDir, launcherPath) {
  const frameworkPath = path.join(
    electronDir,
    'dist',
    'Electron.app',
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Electron Framework'
  );
  const versionPath = path.join(electronDir, 'dist', 'version');
  const pathTxtPath = path.join(electronDir, 'path.txt');

  if (!existsSync(launcherPath)) {
    fail(`Missing Electron executable at ${launcherPath}`);
  }
  try {
    accessSync(launcherPath, fsConstants.X_OK);
  } catch (err) {
    fail(`Electron executable not executable at ${launcherPath}: ${err.message}`);
  }
  if (!existsSync(frameworkPath)) {
    fail(`Missing Electron Framework binary at ${frameworkPath} (incomplete bundle)`);
  }
  if (!existsSync(versionPath)) {
    fail(`Missing dist/version sentinel at ${versionPath}`);
  }
  if (!existsSync(pathTxtPath)) {
    fail(`Missing path.txt sentinel at ${pathTxtPath}`);
  }
}

function smokeTest(launcherPath) {
  log(`Running smoke test: ${launcherPath} --version`);
  const result = spawnSync(launcherPath, ['--version'], { stdio: 'inherit' });
  if (result.error) {
    fail(`Failed to spawn Electron launcher: ${result.error.message}`);
  }
  if (typeof result.status !== 'number' || result.status !== 0) {
    fail(
      `Electron --version exited non-zero (status=${result.status}); likely dyld/framework load failure`
    );
  }
}

async function main() {
  const electronPkg = require('../node_modules/electron/package.json');
  const checksums = require('../node_modules/electron/checksums.json');
  const version = electronPkg.version;

  const platform = process.env.npm_config_platform || process.platform;
  if (platform !== 'darwin') {
    fail(`Unsupported platform: ${platform}. This installer only supports darwin.`);
  }

  const arch = resolveArch(platform);
  const cacheRoot = resolveCacheRoot();

  const electronDir = path.dirname(require.resolve('../node_modules/electron/package.json'));
  const distPath = path.join(electronDir, 'dist');
  const pathTxtPath = path.join(electronDir, 'path.txt');
  const launcherPath = path.join(distPath, PLATFORM_PATH);

  log(`Electron version: ${version}`);
  log(`Platform: ${platform}, arch: ${arch}`);
  log(`Cache root: ${cacheRoot ?? '(unset; @electron/get default)'}`);
  log(`Target dist: ${distPath}`);

  log('Removing previous dist and path.txt');
  rmSync(distPath, { recursive: true, force: true });
  rmSync(pathTxtPath, { force: true });

  log('Downloading Electron artifact via @electron/get');
  const downloadOptions = {
    version,
    artifactName: 'electron',
    platform,
    arch,
    checksums,
  };
  if (cacheRoot !== undefined) {
    downloadOptions.cacheRoot = cacheRoot;
  }
  const zipPath = await downloadArtifact(downloadOptions);
  log(`Downloaded zip: ${zipPath}`);

  extractWithDitto(zipPath, distPath);

  log(`Writing path.txt: ${pathTxtPath}`);
  writeFileSync(pathTxtPath, PLATFORM_PATH);

  verifyInstall(electronDir, launcherPath);
  smokeTest(launcherPath);

  log('Install complete.');
}

main().catch((err) => {
  console.error(`${LOG_PREFIX} ERROR: ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
