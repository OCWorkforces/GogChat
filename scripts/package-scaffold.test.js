import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON_BUILDER_WIN_YML_PATH = path.join(PROJECT_ROOT, 'electron-builder.win.yml');
const ELECTRON_BUILDER_YML_PATH = path.join(PROJECT_ROOT, 'electron-builder.yml');
const ELECTRON_BUILDER_SIGN_YML_PATH = path.join(PROJECT_ROOT, 'electron-builder.sign.yml');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

function readPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
}

function packageScript(name) {
  const packageJson = readPackageJson();
  const script = packageJson.scripts[name];
  expect(typeof script).toBe('string');
  return script;
}

function readElectronBuilderConfig() {
  return fs.readFileSync(ELECTRON_BUILDER_YML_PATH, 'utf-8');
}

function readElectronBuilderWinConfig() {
  return fs.readFileSync(ELECTRON_BUILDER_WIN_YML_PATH, 'utf-8');
}

function readElectronBuilderSigningConfig() {
  return fs.readFileSync(ELECTRON_BUILDER_SIGN_YML_PATH, 'utf-8');
}

describe('Windows package scaffold scripts', () => {
  it('preserves the existing macOS package script semantics', () => {
    expect(packageScript('package')).toBe(
      'BUILD_ENV=${BUILD_ENV:-production} bun run build:prod && BUILD_ENV=${BUILD_ENV:-production} electron-builder --mac'
    );
  });

  it('defines a fail-closed signed and notarized macOS release package script', () => {
    expect(packageScript('package:mac:release')).toBe(
      'BUILD_ENV=${BUILD_ENV:-production} bun run build:prod && bun scripts/mac-release-signing.js --release && env -u MAC_CSC_LINK -u MAC_CSC_KEY_PASSWORD BUILD_ENV=${BUILD_ENV:-production} CSC_LINK="$MAC_CSC_LINK" CSC_KEY_PASSWORD="$MAC_CSC_KEY_PASSWORD" electron-builder --config electron-builder.sign.yml --mac --publish never'
    );
    expect(packageScript('package')).not.toContain('--publish never');
  });

  it('uses the signing overlay with hardened runtime and entitlements for macOS release packages', () => {
    const config = readElectronBuilderSigningConfig();

    expect(config).toContain('extends: electron-builder.yml');
    expect(config).toContain('mac:\n  hardenedRuntime: true');
    expect(config).toContain('entitlements: entitlements.mac.plist');
    expect(config).toContain('entitlementsInherit: entitlements.mac.inherit.plist');
  });

  it('defines publish-never NSIS package scripts for Electron x64 and arm64', () => {
    expect(packageScript('package:win:x64')).toBe(
      'bun run build:prod && electron-builder --config electron-builder.win.yml --win nsis:x64 --publish never'
    );
    expect(packageScript('package:win:arm64')).toBe(
      'bun run build:prod && electron-builder --config electron-builder.win.yml --win nsis:arm64 --publish never'
    );
  });

  it('uses Electron builder arch names and never release-publishing modes', () => {
    const builderScripts = [
      packageScript('package:mac:release'),
      packageScript('package:win:x64'),
      packageScript('package:win:arm64'),
    ];

    expect(builderScripts.join('\n')).not.toContain('amd64');
    expect(builderScripts.join('\n')).not.toMatch(/--publish\s+(always|onTag|onTagOrDraft)/);
    for (const script of builderScripts) {
      expect(script).toContain('--publish never');
    }
  });

  it('exposes a local Windows artifact manifest path for later packaging proof', () => {
    expect(packageScript('package:win:artifacts')).toBe(
      'bun scripts/verify-windows-package-artifacts.js --dist dist --manifest --require-arch x64 --require-arch arm64'
    );
  });

  it('exposes a release signing policy gate without changing local Windows package scripts', () => {
    expect(packageScript('package:win:signing-policy')).toBe(
      'bun scripts/verify-windows-signing-policy.js --release'
    );
    expect(packageScript('package:win:x64')).not.toContain('verify-windows-signing-policy');
    expect(packageScript('package:win:arm64')).not.toContain('verify-windows-signing-policy');
  });

  it('defines separate NSIS x64 and arm64 Windows targets in electron-builder config', () => {
    const config = readElectronBuilderConfig();

    expect(config).toContain('win:\n  icon: resources/icons/normal/win.ico');
    expect(config).toContain('    - target: nsis\n      arch:\n        - x64\n        - arm64');
    expect(config).toContain('nsis:\n  buildUniversalInstaller: false');
    expect(config).toContain(
      "  artifactName: '${productName}-${version}-windows-${arch}-setup.${ext}'"
    );
    expect(config).toContain("artifactName: '${productName}-${version}-${arch}.${ext}'");
    expect(config).not.toMatch(/\n\s+- (ia32|universal)\b/i);
    expect(config).not.toMatch(/\n\s+- target: (portable|msi|msix|zip)\b/i);
  });

  it('keeps the base mac protocol registration unchanged', () => {
    const config = readElectronBuilderConfig();

    expect(config).toContain(
      "protocols:\n  name: 'GogChat'\n  schemes:\n    - gogchat\n    - https"
    );
  });

  it('uses a Windows overlay that registers only the gogchat protocol', () => {
    const config = readElectronBuilderWinConfig();

    expect(config).toContain('extends: electron-builder.yml');
    expect(config).toContain("protocols:\n  name: 'GogChat'\n  schemes:\n    - gogchat");
    expect(config).not.toContain('https');
  });
});

describe('install-electron-binary platform handling', () => {
  it('skips the macOS-only installer on non-Darwin package targets', () => {
    const result = spawnSync(process.execPath, ['scripts/install-electron-binary.js'], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        npm_config_platform: 'win32',
      },
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Skipping macOS-only Electron binary installer for win32');
    expect(result.stdout).toContain('upstream Electron install behavior');
  });
});
