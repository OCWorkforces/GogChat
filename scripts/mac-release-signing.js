#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SIGNING_CREDENTIALS = ['MAC_CSC_LINK', 'MAC_CSC_KEY_PASSWORD'];
const NOTARIZATION_CREDENTIALS = ['APPLE_ID', 'APPLE_TEAM_ID', 'APPLE_APP_PASSWORD'];

function hasValue(env, name) {
  return typeof env[name] === 'string' && env[name].length > 0;
}

function hasCredentials(env, names) {
  return names.every((name) => hasValue(env, name));
}

function credentialState(env, names) {
  const configuredCount = names.filter((name) => hasValue(env, name)).length;
  if (configuredCount === names.length) {
    return 'complete';
  }
  if (configuredCount === 0) {
    return 'absent';
  }
  return 'partial';
}

export function evaluateMacReleaseSigningPolicy(env) {
  const signingState = credentialState(env, SIGNING_CREDENTIALS);
  return {
    signingConfigured: signingState === 'complete',
    signingState,
    notarizationConfigured: hasCredentials(env, NOTARIZATION_CREDENTIALS),
  };
}

function usage() {
  return [
    'Usage: bun scripts/mac-release-signing.js --release',
    '',
    'Release mode signs and notarizes with complete credentials, or produces an unsigned DMG when both signing credentials are absent.',
  ].join('\n');
}

function runCli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return;
  }

  const hasUnknownArg = argv.some((arg) => arg !== '--release');
  if (hasUnknownArg) {
    console.error('Unknown argument');
    console.error(usage());
    process.exit(2);
  }

  if (!argv.includes('--release')) {
    console.error('--release is required');
    console.error(usage());
    process.exit(2);
  }

  const policy = evaluateMacReleaseSigningPolicy(process.env);
  if (policy.signingState === 'partial') {
    console.error(
      'macOS signing credentials must be configured as a complete pair or both omitted.'
    );
    process.exit(1);
  }
  if (policy.signingState === 'absent') {
    console.log('macOS signing credentials are absent; producing an unsigned DMG.');
    return;
  }
  if (!policy.notarizationConfigured) {
    console.error(
      'Apple notarization credentials are required. Configure APPLE_ID/APPLE_TEAM_ID/APPLE_APP_PASSWORD.'
    );
    process.exit(1);
  }

  console.log('macOS release signing and notarization preflight passed.');
}

const isCli = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  runCli(process.argv.slice(2));
}
