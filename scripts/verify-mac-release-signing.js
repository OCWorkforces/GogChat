#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usage() {
  return [
    'Usage: bun scripts/verify-mac-release-signing.js [--dist <dir>]',
    '',
    'Verifies signed and stapled macOS release artifacts on a macOS GitHub Actions runner.',
  ].join('\n');
}

function listArtifacts(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return { apps: [], dmgs: [] };
  }

  const artifacts = { apps: [], dmgs: [] };
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        artifacts.apps.push(entryPath);
      } else {
        const nested = listArtifacts(entryPath);
        artifacts.apps.push(...nested.apps);
        artifacts.dmgs.push(...nested.dmgs);
      }
    } else if (entry.isFile() && entry.name.endsWith('.dmg')) {
      artifacts.dmgs.push(entryPath);
    }
  }

  return artifacts;
}

function requireArtifact(artifacts, label) {
  const artifactPath = artifacts[0];
  if (artifactPath === undefined) {
    throw new Error(`Missing packaged macOS ${label}`);
  }
  return artifactPath;
}

function assertMacOSGitHubActions(platform, githubActions) {
  if (platform !== 'darwin' || githubActions !== 'true') {
    throw new Error('macOS trust verification must run on a macOS GitHub Actions runner');
  }
}

function runNativeCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  return result.status ?? 1;
}

function verifyCommand(runCommand, command, args) {
  if (runCommand(command, args) !== 0) {
    throw new Error(`macOS trust verification failed: ${command}`);
  }
}

export function verifyMacReleaseSigning({
  distDir,
  platform = process.platform,
  githubActions = process.env.GITHUB_ACTIONS,
  runCommand = runNativeCommand,
}) {
  assertMacOSGitHubActions(platform, githubActions);

  const artifacts = listArtifacts(distDir);
  const appPath = requireArtifact(artifacts.apps, 'application');
  const dmgPath = requireArtifact(artifacts.dmgs, 'DMG');

  verifyCommand(runCommand, 'codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);
  verifyCommand(runCommand, 'spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  verifyCommand(runCommand, 'xcrun', ['stapler', 'validate', appPath]);
  verifyCommand(runCommand, 'xcrun', ['stapler', 'validate', dmgPath]);

  return { appPath, dmgPath };
}

function parseArgs(argv) {
  const parsed = { distDir: 'dist', help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dist') {
      const value = argv[index + 1];
      if (!value) {
        throw new UsageError('--dist requires a directory path');
      }
      parsed.distDir = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function runCli(argv) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }

  const artifacts = verifyMacReleaseSigning({
    distDir: path.resolve(process.cwd(), parsed.distDir),
  });
  console.log(`Verified macOS trust for ${artifacts.appPath} and ${artifacts.dmgPath}`);
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  runCli(process.argv.slice(2));
}
