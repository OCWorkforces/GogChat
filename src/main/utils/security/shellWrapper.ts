/**
 * Safe wrapper around Electron's `shell.openExternal`.
 *
 * Accepts only `ValidatedURL` (branded by `validateExternalURL` /
 * `validateAppleSystemPreferencesURL` / `validateDeepLinkURL`). Bare strings
 * are rejected at compile time, preventing accidental injection-style misuse.
 *
 * Direct imports of `shell.openExternal` from 'electron' are forbidden by
 * ESLint elsewhere in the tree — all production call sites must route
 * through this wrapper.
 */
import { shell } from 'electron';
import type { ValidatedURL } from '../../../shared/types/branded.js';

/**
 * Open a validated URL in the user's default external handler.
 * Mirrors the signature of `shell.openExternal` but enforces the
 * `ValidatedURL` brand at the type level.
 */
export function openExternal(url: ValidatedURL): Promise<void> {
  return shell.openExternal(url);
}
