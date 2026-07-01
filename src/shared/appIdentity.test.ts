import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { APP_IDENTITY } from './appIdentity';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORMER_APP_ID = ['com', 'electron', 'google-chat'].join('.');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

function parseTopLevelYamlString(source: string, key: string): string {
  const match = new RegExp(`^${key}:\\s*([^\\s#]+)\\s*$`, 'm').exec(source);
  if (match === null) {
    throw new Error(`Missing top-level ${key} in electron-builder.yml`);
  }
  const value = match[1];
  if (value === undefined) {
    throw new Error(`Empty top-level ${key} in electron-builder.yml`);
  }
  return value;
}

describe('APP_IDENTITY', () => {
  it('matches the electron-builder appId', () => {
    // Given: the centralized runtime identity and builder packaging config.
    const builderConfig = readRepoFile('electron-builder.yml');

    // When: the builder appId is parsed from the top-level config.
    const builderAppId = parseTopLevelYamlString(builderConfig, 'appId');

    // Then: runtime and packaged identity stay aligned.
    expect(APP_IDENTITY.appId).toBe('com.ocworkforces.gogchat');
    expect(builderAppId).toBe(APP_IDENTITY.appId);
  });

  it('does not keep the former Electron starter AppUserModelID in source files', () => {
    // Given: identity-sensitive source files.
    const filesToScan = [
      'src/main/index.ts',
      'src/shared/appIdentity.ts',
      'electron-builder.yml',
    ] as const;

    // When / Then: none retain the old runtime identity.
    for (const filePath of filesToScan) {
      expect(readRepoFile(filePath)).not.toContain(FORMER_APP_ID);
    }
  });

  it('keeps builder icon references aligned with generated platform assets', () => {
    // Given: electron-builder config and generated app icon assets.
    const builderConfig = readRepoFile('electron-builder.yml');

    // When / Then: mac behavior still points at ICNS and Windows points at generated ICO.
    expect(builderConfig).toContain('icon: resources/icons/normal/mac.icns');
    expect(builderConfig).toContain('icon: resources/icons/normal/win.ico');
    expect(existsSync(join(REPO_ROOT, 'resources/icons/normal/mac.icns'))).toBe(true);
    expect(existsSync(join(REPO_ROOT, 'resources/icons/normal/win.ico'))).toBe(true);
  });
});
