/**
 * Input validation utilities for IPC messages and user input
 * Re-exports from domain-specific validation modules
 */

export {
  validateUnreadCount,
  validateBoolean,
  validateString,
  isSafeObject,
  sanitizeHTML,
  validatePasskeyFailureData,
  validateNotificationData,
} from './dataValidators.js';

export {
  validateFaviconURL,
  validateExternalURL,
  validateAppleSystemPreferencesURL,
  isWhitelistedHost,
  validateDeepLinkURL,
  isAuthenticatedChatUrl,
  isGoogleAuthUrl,
} from './urlValidators.js';
