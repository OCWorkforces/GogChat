import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const PREFLIGHT_PATH = 'scripts/mac-release-signing.js';

function releasePreflightResult(env, argv = ['--release']) {
  return spawnSync(process.execPath, [PREFLIGHT_PATH, ...argv], {
    cwd: PROJECT_ROOT,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: 'utf-8',
  });
}

function completeReleaseEnvironment() {
  return {
    MAC_CSC_LINK: 'fixture-signing-link',
    MAC_CSC_KEY_PASSWORD: 'fixture-signing-password',
    APPLE_ID: 'fixture-apple-id',
    APPLE_TEAM_ID: 'fixture-team-id',
    APPLE_APP_PASSWORD: 'fixture-app-password',
  };
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}

describe('macOS release signing preflight', () => {
  it('rejects release mode when signing credentials are absent', () => {
    const result = releasePreflightResult({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('macOS signing credentials are required');
  });

  it('rejects a partial signing credential pair without disclosing its value', () => {
    const result = releasePreflightResult({
      MAC_CSC_LINK: 'fixture-partial-signing-link',
      APPLE_ID: 'fixture-apple-id',
      APPLE_TEAM_ID: 'fixture-team-id',
      APPLE_APP_PASSWORD: 'fixture-app-password',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('macOS signing credentials are required');
    expect(combinedOutput(result)).not.toContain('fixture-partial-signing-link');
  });

  it('rejects an incomplete Apple notarization credential set without disclosing its value', () => {
    const result = releasePreflightResult({
      MAC_CSC_LINK: 'fixture-signing-link',
      MAC_CSC_KEY_PASSWORD: 'fixture-signing-password',
      APPLE_ID: 'fixture-apple-id',
      APPLE_TEAM_ID: 'fixture-team-id',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Apple notarization credentials are required');
    expect(combinedOutput(result)).not.toContain('fixture-signing-password');
    expect(combinedOutput(result)).not.toContain('fixture-apple-id');
  });

  it('allows complete signing and notarization credentials without disclosing them', () => {
    const environment = completeReleaseEnvironment();
    const result = releasePreflightResult(environment);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('macOS release signing and notarization preflight passed');
    for (const secret of Object.values(environment)) {
      expect(combinedOutput(result)).not.toContain(secret);
    }
  });

  it('rejects an unknown argument without reflecting its value', () => {
    const untrustedArgument = '--token=fixture-untrusted-text';
    const result = releasePreflightResult({}, [untrustedArgument]);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown argument');
    expect(combinedOutput(result)).not.toContain(untrustedArgument);
  });
});
