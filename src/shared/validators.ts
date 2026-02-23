/**
 * Input validation utilities for IPC messages and user input
 * These validators prevent injection attacks and ensure data integrity
 */

import { BADGE, WHITELISTED_HOSTS, DEEP_LINK } from './constants.js';

/**
 * Validates and sanitizes unread count values
 * @param count - Raw count value from renderer
 * @returns Sanitized count number
 * @throws Error if count is invalid
 */
export function validateUnreadCount(count: unknown): number {
  // Type check
  if (typeof count !== 'number' && typeof count !== 'string') {
    throw new Error('Unread count must be a number or string');
  }

  // Convert to number
  const num = Number(count);

  // Validate
  if (isNaN(num)) {
    throw new Error('Unread count is not a valid number');
  }

  if (num < 0) {
    throw new Error('Unread count cannot be negative');
  }

  if (num > BADGE.MAX_COUNT) {
    throw new Error(`Unread count exceeds maximum (${BADGE.MAX_COUNT})`);
  }

  if (!Number.isFinite(num)) {
    throw new Error('Unread count must be finite');
  }

  // Return safe integer
  return Math.floor(num);
}

/**
 * Validates and sanitizes favicon URL
 * @param href - Favicon URL from renderer
 * @returns Sanitized URL string
 * @throws Error if URL is invalid
 */
export function validateFaviconURL(href: unknown): string {
  // Type check
  if (typeof href !== 'string') {
    throw new Error('Favicon URL must be a string');
  }

  // Length check (prevent DoS)
  if (href.length > 2048) {
    throw new Error('Favicon URL too long');
  }

  // Empty check
  if (href.trim().length === 0) {
    throw new Error('Favicon URL cannot be empty');
  }

  // Parse URL
  try {
    const url = new URL(href);

    // Protocol check
    if (!['http:', 'https:', 'data:'].includes(url.protocol)) {
      throw new Error('Favicon URL must use http, https, or data protocol');
    }

    return href;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid favicon URL format');
    }
    throw error;
  }
}

/**
 * Validates and sanitizes external URLs before opening
 * @param url - URL to be opened externally
 * @returns Sanitized URL string
 * @throws Error if URL is unsafe
 */
export function validateExternalURL(url: unknown): string {
  // Type check
  if (typeof url !== 'string') {
    throw new Error('URL must be a string');
  }

  // Length check
  if (url.length > 2048) {
    throw new Error('URL too long');
  }

  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  // Protocol whitelist - only http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsafe protocol: ${parsed.protocol}`);
  }

  // Remove credentials to prevent leakage
  parsed.username = '';
  parsed.password = '';

  // Check for dangerous patterns
  const dangerous = ['javascript:', 'data:', 'vbscript:', 'file:', 'about:'];

  const urlLower = url.toLowerCase();
  for (const pattern of dangerous) {
    if (urlLower.includes(pattern)) {
      throw new Error(`URL contains dangerous pattern: ${pattern}`);
    }
  }

  return parsed.toString();
}

/**
 * Validates if a URL belongs to a whitelisted host
 * @param url - URL to check
 * @param currentHost - Current window host for comparison
 * @returns true if URL is whitelisted
 */
export function isWhitelistedHost(url: string, currentHost: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // Check if it's the same as current host
    if (hostname === currentHost) {
      return true;
    }

    // Check against whitelist
    return (WHITELISTED_HOSTS as readonly string[]).includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Validates boolean values from IPC
 * @param value - Value to validate
 * @returns boolean
 * @throws Error if not a valid boolean
 */
export function validateBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  throw new Error('Value is not a valid boolean');
}

/**
 * Validates string values with length limits
 * @param value - Value to validate
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 * @throws Error if invalid
 */
export function validateString(value: unknown, maxLength = 1000): string {
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }

  if (value.length > maxLength) {
    throw new Error(`String exceeds maximum length (${maxLength})`);
  }

  return value;
}

/**
 * Validates that a value is a safe object (not null, not array)
 * @param value - Value to validate
 * @returns true if safe object
 */
export function isSafeObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Sanitizes HTML to prevent XSS
 * @param html - HTML string to sanitize
 * @returns Sanitized HTML
 */
export function sanitizeHTML(html: string): string {
  // Basic HTML entity encoding
  return html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates passkey authentication failure data
 * @param errorType - Error type from WebAuthn API
 * @returns Validated PasskeyFailureData object
 * @throws Error if data is invalid
 */
export function validatePasskeyFailureData(errorType: unknown): {
  errorType: string;
  timestamp: number;
} {
  // Validate error type
  const validatedErrorType = validateString(errorType, 100);

  // Whitelist of known WebAuthn error types
  const allowedErrors = [
    'NotAllowedError',
    'NotSupportedError',
    'SecurityError',
    'AbortError',
    'ConstraintError',
    'InvalidStateError',
    'UnknownError',
    'TimeoutError',
  ];

  // Allow any error type but log if unexpected
  if (!allowedErrors.includes(validatedErrorType)) {
    console.warn(`[Validator] Unexpected passkey error type: ${validatedErrorType}`);
  }

  return {
    errorType: validatedErrorType,
    timestamp: Date.now(),
  };
}

/**
 * Validates notification data before creating native notification
 * @param data - Notification data from renderer
 * @returns Validated NotificationData object
 * @throws Error if data is invalid
 */
export function validateNotificationData(data: unknown): {
  title: string;
  body?: string;
  icon?: string;
  tag?: string;
  timestamp: number;
} {
  // Type check
  if (!isSafeObject(data)) {
    throw new Error('Notification data must be a plain object');
  }

  // Validate required fields
  const title = validateString(data.title, 500);

  // Validate optional fields
  const result: {
    title: string;
    body?: string;
    icon?: string;
    tag?: string;
    timestamp: number;
  } = {
    title,
    timestamp: Date.now(),
  };

  if (data.body !== undefined && data.body !== null && data.body !== '') {
    result.body = validateString(data.body as unknown, 5000);
  }

  if (data.icon !== undefined && data.icon !== null && data.icon !== '') {
    // Validate icon URL (can be data: URL for inline images)
    result.icon = validateFaviconURL(data.icon as unknown);
  }

  if (data.tag !== undefined && data.tag !== null && data.tag !== '') {
    result.tag = validateString(data.tag as unknown, 200);
  }

  return result;
}

/**
 * Validates and converts a deep link URL to a safe Google Chat HTTPS URL.
 *
 * Accepts:
 * - gchat://room/AAAA9BixgjY/EypiKwiqrS0?cls=10
 * - https://chat.google.com/room/AAAA9BixgjY/EypiKwiqrS0?cls=10
 *
 * @param url - Raw URL from protocol handler or command line
 * @returns Sanitized https://chat.google.com/... URL
 * @throws Error if URL is invalid, not a recognized scheme, or targets a non-allowed host
 */
export function validateDeepLinkURL(url: unknown): string {
  // Type check
  if (typeof url !== 'string') {
    throw new Error('Deep link URL must be a string');
  }

  // Length check
  if (url.length > DEEP_LINK.MAX_URL_LENGTH) {
    throw new Error('Deep link URL too long');
  }

  // Empty check
  if (url.trim().length === 0) {
    throw new Error('Deep link URL cannot be empty');
  }

  let httpsUrl: string;

  // Convert gchat:// to https://chat.google.com/
  if (url.startsWith(DEEP_LINK.PREFIX)) {
    const pathAndQuery = url.slice(DEEP_LINK.PREFIX.length);
    httpsUrl = `${DEEP_LINK.TARGET_ORIGIN}/${pathAndQuery}`;
  } else if (url.startsWith('https://')) {
    httpsUrl = url;
  } else {
    throw new Error(`Unsupported deep link scheme: ${url.split(':')[0] ?? 'unknown'}`);
  }

  // Parse and validate
  let parsed: URL;
  try {
    parsed = new URL(httpsUrl);
  } catch {
    throw new Error('Invalid deep link URL format');
  }

  // Protocol must be https
  if (parsed.protocol !== 'https:') {
    throw new Error(`Deep link must use HTTPS, got: ${parsed.protocol}`);
  }

  // Host must be chat.google.com
  if (parsed.hostname !== DEEP_LINK.TARGET_HOST) {
    throw new Error(`Deep link host must be ${DEEP_LINK.TARGET_HOST}, got: ${parsed.hostname}`);
  }

  // Strip credentials
  parsed.username = '';
  parsed.password = '';

  // Validate path has an allowed prefix (or is root)
  const pathLower = parsed.pathname.toLowerCase();
  const hasAllowedPath =
    pathLower === '/' ||
    DEEP_LINK.ALLOWED_PATH_PREFIXES.some((prefix) => pathLower.startsWith(prefix));

  if (!hasAllowedPath) {
    throw new Error(`Deep link path not allowed: ${parsed.pathname}`);
  }

  return parsed.toString();
}
