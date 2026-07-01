/**
 * Deep Link Utility Functions
 *
 * Pure utility functions for deep link URL extraction.
 * Extracted from features/deepLinkHandler.ts (and previously
 * features/deepLinkUtils.ts) to break the feature→feature import
 * between singleInstance and deepLinkHandler.
 */

import { DEEP_LINK } from '../../../shared/constants.js';

/**
 * Extract a deep link URL from command-line arguments.
 *
 * Checks for `gogchat://` custom protocol URLs passed by OS protocol handlers.
 *
 * @param argv - The command-line arguments array
 * @returns The deep link URL if found, or null
 */
export function extractDeepLinkFromArgv(argv: string[]): string | null {
  const deepLink = argv.find((arg) => arg.startsWith(DEEP_LINK.PREFIX));
  return deepLink ?? null;
}
