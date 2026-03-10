#!/usr/bin/env node

/**
 * Notarization hook for electron-builder (afterSign)
 *
 * Invoked automatically by electron-builder after code signing.
 * Skips gracefully when:
 *   - CSC_IDENTITY_AUTO_DISCOVERY=false (local dev without signing)
 *   - Required env vars are missing (APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD)
 *
 * Required environment variables for notarization:
 *   APPLE_ID                    Apple ID email address
 *   APPLE_TEAM_ID               Apple Developer Team ID (10-char string)
 *   APPLE_APP_SPECIFIC_PASSWORD App-specific password from appleid.apple.com
 */

import { notarize } from '@electron/notarize';

/**
 * @param {import('@electron/notarize').NotarizeContext} context
 */
export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize on macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  // Skip if code signing is disabled (local development)
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('[Notarize] Skipping: CSC_IDENTITY_AUTO_DISCOVERY=false');
    return;
  }

  // Skip if required env vars are not set
  const appleId = process.env.APPLE_ID;
  const appleTeamId = process.env.APPLE_TEAM_ID;
  const appleAppSpecificPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;

  if (!appleId || !appleTeamId || !appleAppSpecificPassword) {
    console.warn(
      '[Notarize] WARNING: Skipping notarization — APPLE_ID, APPLE_TEAM_ID, or APPLE_APP_SPECIFIC_PASSWORD not set'
    );
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[Notarize] Notarizing ${appPath}...`);

  await notarize({
    appBundleId: 'com.ocworkforce.googlechat',
    appPath,
    appleId,
    appleIdPassword: appleAppSpecificPassword,
    teamId: appleTeamId,
  });

  console.log(`[Notarize] Done: ${appPath}`);
}
