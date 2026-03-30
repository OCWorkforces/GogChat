/**
 * Common IPC Validators
 *
 * Reusable validator functions for IPC message payloads.
 * Extracted from ipcHelper.ts for focused module responsibility.
 */

/**
 * Common validators that can be reused across IPC handlers
 */
export const commonValidators = {
  /** Validates that data is a non-null object */
  isObject: (data: unknown): Record<string, unknown> => {
    if (typeof data !== 'object' || data === null) {
      throw new Error('Expected object');
    }
    return data as Record<string, unknown>;
  },

  /** Validates that data is a string */
  isString: (data: unknown): string => {
    if (typeof data !== 'string') {
      throw new Error('Expected string');
    }
    return data;
  },

  /** Validates that data is a number */
  isNumber: (data: unknown): number => {
    if (typeof data !== 'number' || isNaN(data)) {
      throw new Error('Expected valid number');
    }
    return data;
  },

  /** Validates that data is a boolean */
  isBoolean: (data: unknown): boolean => {
    if (typeof data !== 'boolean') {
      throw new Error('Expected boolean');
    }
    return data;
  },

  /** No-op validator for void/empty channels */
  noData: (_data: unknown): void => {
    /* Intentionally empty - for channels with no payload */
  },
};
