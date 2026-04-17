/**
 * Deep Link Utility Functions
 *
 * Pure utility functions for deep link URL extraction.
 * Extracted from deepLinkHandler.ts to break the feature→feature import
 * between singleInstance→deepLinkHandler.
 */

import { DEEP_LINK } from '../../shared/constants.js';

/**
 * Extract a deep link URL from command-line arguments.
 *
 * Checks for both `gogchat://` custom protocol URLs and `https://chat.google.com` URLs.
 *
 * @param argv - The command-line arguments array
 * @returns The deep link URL if found, or null
 */
export function extractDeepLinkFromArgv(argv: string[]): string | null {
  const deepLink = argv.find((arg) => arg.startsWith(DEEP_LINK.PREFIX));
  if (deepLink) return deepLink;

  const httpsChatLink = argv.find(
    (arg) => arg.startsWith('https://') && arg.includes('chat.google.com')
  );
  return httpsChatLink ?? null;
}
