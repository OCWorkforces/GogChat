import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { evaluateWindowsSigningPolicy } from './verify-windows-signing-policy.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');

function releasePolicyResult(env) {
  return spawnSync(process.execPath, ['scripts/verify-windows-signing-policy.js', '--release'], {
    cwd: PROJECT_ROOT,
    env: {
      PATH: process.env.PATH,
      ...env,
    },
    encoding: 'utf-8',
  });
}

describe('Windows signing policy helper', () => {
  it('fails release mode when no signing route or explicit unsigned override is configured', () => {
    const result = releasePolicyResult({});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Windows release signing route is required');
    expect(result.stderr).toContain('WINDOWS_ALLOW_UNSIGNED_RELEASE=true');
  });

  it('allows release mode only when unsigned release override is explicitly true', () => {
    const result = releasePolicyResult({ WINDOWS_ALLOW_UNSIGNED_RELEASE: 'true' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('unsigned Windows release explicitly allowed');
  });

  it('detects electron-builder Windows PFX signing environment routes', () => {
    expect(
      evaluateWindowsSigningPolicy({
        WIN_CSC_LINK: 'base64-or-path',
        WIN_CSC_KEY_PASSWORD: 'password',
      })
    ).toEqual({ route: 'pfx', unsignedReleaseAllowed: false });
  });

  it('does not treat generic CSC credentials as Windows signing proof', () => {
    expect(
      evaluateWindowsSigningPolicy({
        CSC_LINK: 'base64-or-path',
        CSC_KEY_PASSWORD: 'password',
      })
    ).toEqual({ route: null, unsignedReleaseAllowed: false });
  });

  it('does not treat unwired Azure Trusted Signing env as signing proof', () => {
    expect(
      evaluateWindowsSigningPolicy({
        AZURE_CLIENT_ID: 'client-id',
        AZURE_CLIENT_SECRET: 'client-secret',
        AZURE_TENANT_ID: 'tenant-id',
        AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: 'account',
        AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME: 'profile',
        AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://example.codesigning.azure.net/',
      })
    ).toEqual({ route: null, unsignedReleaseAllowed: false });
  });

  it('does not treat unwired certificate file env as signing proof', () => {
    expect(
      evaluateWindowsSigningPolicy({
        WINDOWS_CERTIFICATE_FILE: 'certificate.pfx',
        WINDOWS_CERTIFICATE_PASSWORD: 'password',
      })
    ).toEqual({ route: null, unsignedReleaseAllowed: false });
  });
});
