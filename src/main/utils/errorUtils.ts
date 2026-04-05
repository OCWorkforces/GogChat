/**
 * Pure error utility functions — zero project dependencies
 *
 * Extracted from errorHandler.ts to break the circular dependency chain where
 * trackedResources.ts → errorHandler.ts ← resourceCleanup.ts.
 *
 * @module errorUtils
 */

/**
 * Extract error message from unknown error type
 * Type guard utility for safe error message extraction
 *
 * @param error - Unknown error from catch block
 * @returns Safe string error message
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Convert unknown error to Error object
 * Ensures error is always an Error instance for consistent handling
 *
 * @param error - Unknown error from catch block
 * @returns Error instance
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(toErrorMessage(error));
}

/**
 * Type guard to check if value is an Error
 *
 * @param error - Unknown value to check
 * @returns True if value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}
