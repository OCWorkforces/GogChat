/**
 * Custom Error subclasses for GogChat.
 *
 * Provides a small hierarchy rooted at {@link GogChatError} with a typed
 * {@link ErrorCode} and native `cause` chaining. Use these instead of bare
 * `new Error(message)` whenever a caller may need to discriminate the failure
 * programmatically (e.g. distinguishing config-read vs config-write failures).
 *
 * Keep this hierarchy small — add a new subclass only when callers need to
 * `instanceof`-check it. Otherwise prefer `new GogChatError(message, code)`.
 *
 * @module errors
 */

import type { ErrorCode } from '../../shared/types/errors.js';

/** Base class for all GogChat domain errors */
export class GogChatError extends Error {
  public readonly code: ErrorCode;

  constructor(message: string, code: ErrorCode, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GogChatError';
    this.code = code;
  }
}

/** IPC-related errors (rate limiting, validation, deduplication, channel lookup) */
export class IPCError extends GogChatError {
  constructor(message: string, code: ErrorCode, options?: { cause?: unknown }) {
    super(message, code, options);
    this.name = 'IPCError';
  }
}

/** Config / electron-store access errors */
export class ConfigError extends GogChatError {
  constructor(message: string, code: ErrorCode, options?: { cause?: unknown }) {
    super(message, code, options);
    this.name = 'ConfigError';
  }
}
