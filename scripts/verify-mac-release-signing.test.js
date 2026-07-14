import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyMacReleaseSigning } from './verify-mac-release-signing.js';

const temporaryDirectories = [];

function createTemporaryDist() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-mac-release-'));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
}

function createApp(distDir) {
  const appPath = path.join(distDir, 'mac-arm64', 'GogChat.app');
  fs.mkdirSync(appPath, { recursive: true });
  return appPath;
}

function createDmg(distDir) {
  const dmgPath = path.join(distDir, 'GogChat-1.0.0-arm64.dmg');
  fs.writeFileSync(dmgPath, 'fixture');
  return dmgPath;
}

function macCiOptions(distDir, runCommand) {
  return {
    distDir,
    platform: 'darwin',
    githubActions: 'true',
    runCommand,
  };
}

afterEach(() => {
  for (const temporaryDirectory of temporaryDirectories.splice(0)) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

describe('macOS release signing verification', () => {
  it('runs signing, Gatekeeper, and stapling checks in deterministic order for signed artifacts', () => {
    const distDir = createTemporaryDist();
    const appPath = createApp(distDir);
    const dmgPath = createDmg(distDir);
    const runCommand = vi.fn(() => 0);

    expect(verifyMacReleaseSigning(macCiOptions(distDir, runCommand))).toEqual({
      appPath,
      dmgPath,
    });
    expect(runCommand.mock.calls).toEqual([
      ['codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]],
      ['spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]],
      ['xcrun', ['stapler', 'validate', appPath]],
      ['xcrun', ['stapler', 'validate', dmgPath]],
    ]);
  });

  it('rejects a release artifact directory without a packaged application', () => {
    const distDir = createTemporaryDist();
    createDmg(distDir);
    const runCommand = vi.fn(() => 0);

    expect(() => verifyMacReleaseSigning(macCiOptions(distDir, runCommand))).toThrow(
      'Missing packaged macOS application'
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('rejects a release artifact directory without a packaged DMG', () => {
    const distDir = createTemporaryDist();
    createApp(distDir);
    const runCommand = vi.fn(() => 0);

    expect(() => verifyMacReleaseSigning(macCiOptions(distDir, runCommand))).toThrow(
      'Missing packaged macOS DMG'
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('rejects a failed native signing command before later checks run', () => {
    const distDir = createTemporaryDist();
    createApp(distDir);
    createDmg(distDir);
    const runCommand = vi.fn(() => 1);

    expect(() => verifyMacReleaseSigning(macCiOptions(distDir, runCommand))).toThrow(
      'macOS trust verification failed: codesign'
    );
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it('does not run native commands outside a macOS GitHub Actions runner', () => {
    const distDir = createTemporaryDist();
    createApp(distDir);
    createDmg(distDir);
    const runCommand = vi.fn(() => 0);

    expect(() =>
      verifyMacReleaseSigning({
        distDir,
        platform: 'linux',
        githubActions: 'true',
        runCommand,
      })
    ).toThrow('must run on a macOS GitHub Actions runner');
    expect(runCommand).not.toHaveBeenCalled();
  });
});
