#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function hasValue(env, name) {
  return typeof env[name] === 'string' && env[name].length > 0;
}

function hasPfxSigningRoute(env) {
  return hasValue(env, 'WIN_CSC_LINK') && hasValue(env, 'WIN_CSC_KEY_PASSWORD');
}

export function evaluateWindowsSigningPolicy(env) {
  if (hasPfxSigningRoute(env)) {
    return { route: 'pfx', unsignedReleaseAllowed: false };
  }

  if (env.WINDOWS_ALLOW_UNSIGNED_RELEASE === 'true') {
    return { route: 'unsigned', unsignedReleaseAllowed: true };
  }

  return { route: null, unsignedReleaseAllowed: false };
}

function usage() {
  return [
    'Usage: bun scripts/verify-windows-signing-policy.js [--release]',
    '',
    'Release mode requires WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD, unless WINDOWS_ALLOW_UNSIGNED_RELEASE=true is explicitly set.',
  ].join('\n');
}

function runCli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const unknownArg = argv.find((arg) => arg !== '--release');
  if (unknownArg) {
    console.error(`Unknown argument: ${unknownArg}`);
    console.error(usage());
    process.exit(2);
  }

  const releaseMode = argv.includes('--release');
  const policy = evaluateWindowsSigningPolicy(process.env);
  if (policy.route === 'pfx') {
    console.log('Windows signing policy satisfied: Windows PFX route configured.');
    return;
  }
  if (policy.unsignedReleaseAllowed) {
    console.log('Windows signing policy satisfied: unsigned Windows release explicitly allowed.');
    return;
  }
  if (releaseMode) {
    console.error(
      'Windows release signing route is required. Configure WIN_CSC_LINK/WIN_CSC_KEY_PASSWORD, or set WINDOWS_ALLOW_UNSIGNED_RELEASE=true.'
    );
    process.exit(1);
  }

  console.log('Windows signing policy: no release signing route configured.');
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  runCli(process.argv.slice(2));
}
