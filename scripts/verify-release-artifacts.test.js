import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findReleaseArtifactViolations } from './verify-release-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('verify-release-artifacts aggregation helper', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-release-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('accepts one DMG plus one Windows setup exe per official architecture', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-arm64.dmg'), 'dmg');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');

    expect(findReleaseArtifactViolations(tmpRoot)).toEqual([]);
  });

  it('reports missing DMG, missing Windows arch, duplicate filenames, and forbidden Windows outputs', () => {
    const nestedDir = path.join(tmpRoot, 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-x64-setup.exe'), 'duplicate');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-ia32-setup.exe'), 'ia32');

    expect(findReleaseArtifactViolations(tmpRoot)).toEqual([
      'Missing macOS DMG artifact',
      'Missing required Windows installer arch: arm64',
      'Duplicate release artifact filename: GogChat-3.15.1-windows-x64-setup.exe',
      'Duplicate Windows installer outputs for x64: GogChat-3.15.1-windows-x64-setup.exe, nested/GogChat-3.15.1-windows-x64-setup.exe',
      'Forbidden Windows artifact arch label "ia32" in GogChat-3.15.1-windows-ia32-setup.exe',
    ]);
  });

  it('copies verified release assets and writes SHA-256 checksums from the CLI', () => {
    const outputDir = path.join(tmpRoot, 'verified');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-arm64.dmg'), 'dmg');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');

    const result = spawnSync(
      process.execPath,
      ['scripts/verify-release-artifacts.js', '--input', tmpRoot, '--output', outputDir],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(fs.readdirSync(outputDir).sort()).toEqual([
      'GogChat-3.15.1-arm64.dmg',
      'GogChat-3.15.1-windows-arm64-setup.exe',
      'GogChat-3.15.1-windows-x64-setup.exe',
      'SHA256SUMS.txt',
    ]);
    expect(fs.readFileSync(path.join(outputDir, 'SHA256SUMS.txt'), 'utf-8')).toContain(
      'GogChat-3.15.1-windows-x64-setup.exe'
    );
  });
});
