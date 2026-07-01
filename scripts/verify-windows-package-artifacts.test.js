import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  detectWindowsInstallerArch,
  findWindowsInstallers,
  findWindowsPackageArtifactViolations,
} from './verify-windows-package-artifacts.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

describe('verify-windows-package-artifacts helpers', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-win-artifacts-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('detects Electron builder x64 and arm64 installer artifact names', () => {
    expect(detectWindowsInstallerArch('GogChat-3.15.1-windows-x64-setup.exe')).toBe('x64');
    expect(detectWindowsInstallerArch('GogChat-3.15.1-windows-arm64-setup.exe')).toBe('arm64');
    expect(detectWindowsInstallerArch('GogChat-3.15.1-x64.exe')).toBeNull();
    expect(detectWindowsInstallerArch('GogChat-3.15.1-amd64.exe')).toBeNull();
  });

  it('lists Windows installers with stable relative paths and sizes', () => {
    const nestedDir = path.join(tmpRoot, 'win-unpacked');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');
    fs.writeFileSync(
      path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe.blockmap'),
      'blockmap'
    );

    expect(findWindowsInstallers(tmpRoot)).toEqual([
      { arch: 'x64', relativePath: 'GogChat-3.15.1-windows-x64-setup.exe', sizeBytes: 3 },
      {
        arch: 'arm64',
        relativePath: 'win-unpacked/GogChat-3.15.1-windows-arm64-setup.exe',
        sizeBytes: 5,
      },
    ]);
  });

  it('reports missing required installers and duplicate arch outputs', () => {
    const nestedDir = path.join(tmpRoot, 'duplicate');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(nestedDir, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');

    expect(findWindowsPackageArtifactViolations(tmpRoot, ['x64', 'arm64'])).toEqual([
      'Missing required Windows installer arch: arm64',
      'Duplicate Windows installer outputs for x64: duplicate/GogChat-3.15.1-windows-x64-setup.exe, GogChat-3.15.1-windows-x64-setup.exe',
    ]);
  });

  it('reports universal, ia32, amd64, and non-NSIS Windows outputs', () => {
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64-setup.exe'), 'x64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64-setup.exe'), 'arm64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-universal-setup.exe'), 'universal');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-ia32-setup.exe'), 'ia32');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-amd64-setup.exe'), 'amd64');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-x64.msi'), 'msi');
    fs.writeFileSync(path.join(tmpRoot, 'GogChat-3.15.1-windows-arm64.zip'), 'zip');

    expect(findWindowsPackageArtifactViolations(tmpRoot, ['x64', 'arm64'])).toEqual([
      'Forbidden Windows artifact arch label "amd64" in GogChat-3.15.1-windows-amd64-setup.exe',
      'Forbidden Windows artifact arch label "ia32" in GogChat-3.15.1-windows-ia32-setup.exe',
      'Forbidden Windows artifact arch label "universal" in GogChat-3.15.1-windows-universal-setup.exe',
      'Forbidden Windows package artifact type in GogChat-3.15.1-windows-arm64.zip',
      'Forbidden Windows package artifact type in GogChat-3.15.1-windows-x64.msi',
    ]);
  });

  it('prints an empty manifest when artifacts have not been generated yet', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-windows-package-artifacts.js', '--dist', tmpRoot, '--manifest'],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ installers: [] });
  });

  it('prints CLI help without requiring package artifacts', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/verify-windows-package-artifacts.js', '--help'],
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: bun scripts/verify-windows-package-artifacts.js');
    expect(result.stdout).toContain('--require-arch <x64|arm64>');
  });
});
