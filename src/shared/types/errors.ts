/**
 * Typed error codes for GogChat domain errors.
 *
 * These codes accompany {@link GogChatError} subclasses (see
 * `src/main/utils/errors.ts`) and give callers a stable, programmatic
 * identifier independent of human-readable error messages.
 *
 * @module shared/types/errors
 */

/** Error codes for GogChat domain errors */
export type ErrorCode =
  | 'IPC_RATE_LIMITED'
  | 'IPC_INVALID_PAYLOAD'
  | 'IPC_CHANNEL_NOT_FOUND'
  | 'IPC_DEDUPLICATION_FAILED'
  | 'ENCRYPTION_FAILED'
  | 'CONFIG_READ_FAILED'
  | 'CONFIG_WRITE_FAILED'
  | 'WINDOW_CREATION_FAILED'
  | 'SESSION_MAINTENANCE_FAILED'
  | 'FEATURE_INIT_FAILED'
  | 'CERTIFICATE_PINNING_FAILED'
  | 'EXTERNAL_URL_BLOCKED'
  | 'AUTH_FLOW_INTERRUPTED'
  | 'UNKNOWN';
