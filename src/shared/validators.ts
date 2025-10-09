/**
 * Input validation utilities for IPC messages and user input
 * These validators prevent injection attacks and ensure data integrity
 */

import { BADGE, WHITELISTED_HOSTS } from './constants.js';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    return WHITELISTED_HOSTS.includes(hostname as any);
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
 * Message logging validators
 */

/**
 * Validates message type
 * @param type - Message type to validate
 * @returns Validated message type
 * @throws Error if invalid
 */
export function validateMessageType(
  type: unknown
): 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown' {
  const validTypes = ['text', 'image', 'file', 'reaction', 'system', 'unknown'];

  if (typeof type !== 'string') {
    throw new Error('Message type must be a string');
  }

  if (!validTypes.includes(type)) {
    throw new Error(`Invalid message type: ${type}`);
  }

  return type as 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';
}

/**
 * Validates conversation type
 * @param type - Conversation type to validate
 * @returns Validated conversation type
 * @throws Error if invalid
 */
export function validateConversationType(type: unknown): 'direct' | 'group' | 'space' {
  const validTypes = ['direct', 'group', 'space'];

  if (typeof type !== 'string') {
    throw new Error('Conversation type must be a string');
  }

  if (!validTypes.includes(type)) {
    throw new Error(`Invalid conversation type: ${type}`);
  }

  return type as 'direct' | 'group' | 'space';
}

/**
 * Validates ISO 8601 timestamp string
 * @param timestamp - Timestamp to validate
 * @returns Validated timestamp string
 * @throws Error if invalid
 */
export function validateTimestamp(timestamp: unknown): string {
  if (typeof timestamp !== 'string') {
    throw new Error('Timestamp must be a string');
  }

  // Try parsing as ISO 8601
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) {
    throw new Error('Invalid timestamp format (must be ISO 8601)');
  }

  // Check if timestamp is in reasonable range (not in far future or past)
  const now = Date.now();
  const timestampMs = date.getTime();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;

  if (timestampMs > now + oneYearMs) {
    throw new Error('Timestamp is too far in the future');
  }

  if (timestampMs < now - 10 * oneYearMs) {
    throw new Error('Timestamp is too far in the past');
  }

  return timestamp;
}

/**
 * Validates message data from renderer
 * @param data - Message data to validate
 * @returns Validated message data
 * @throws Error if data is invalid
 */
export function validateMessageData(data: unknown): {
  messageId: string;
  content: string;
  sender: string;
  timestamp: string;
  conversationId: string;
  conversationName: string;
  conversationType: 'direct' | 'group' | 'space';
  messageType: 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';
  isOutgoing: boolean;
  receiverName?: string;
  participants?: string[];
  attachmentUrl?: string;
  attachmentName?: string;
  reactionType?: string;
} {
  // Type check
  if (!isSafeObject(data)) {
    throw new Error('Message data must be a plain object');
  }

  // Validate required fields
  const messageId = validateString(data.messageId, 500);
  const content = validateString(data.content, 50000); // 50KB max
  const sender = validateString(data.sender, 500);
  const timestamp = validateTimestamp(data.timestamp);
  const conversationId = validateString(data.conversationId, 500);
  const conversationName = validateString(data.conversationName, 500);
  const conversationType = validateConversationType(data.conversationType);
  const messageType = validateMessageType(data.messageType);
  const isOutgoing = validateBoolean(data.isOutgoing);

  // Validate optional fields
  const result: {
    messageId: string;
    content: string;
    sender: string;
    timestamp: string;
    conversationId: string;
    conversationName: string;
    conversationType: 'direct' | 'group' | 'space';
    messageType: 'text' | 'image' | 'file' | 'reaction' | 'system' | 'unknown';
    isOutgoing: boolean;
    receiverName?: string;
    participants?: string[];
    attachmentUrl?: string;
    attachmentName?: string;
    reactionType?: string;
  } = {
    messageId,
    content: sanitizeHTML(content), // Sanitize content to prevent XSS
    sender: sanitizeHTML(sender),
    timestamp,
    conversationId,
    conversationName: sanitizeHTML(conversationName),
    conversationType,
    messageType,
    isOutgoing,
  };

  // Optional fields
  if (data.receiverName !== undefined && data.receiverName !== null) {
    result.receiverName = sanitizeHTML(validateString(data.receiverName as unknown, 500));
  }

  if (data.participants !== undefined && data.participants !== null) {
    if (!Array.isArray(data.participants)) {
      throw new Error('Participants must be an array');
    }
    result.participants = (data.participants as unknown[]).map((p) =>
      sanitizeHTML(validateString(p, 500))
    );
  }

  if (data.attachmentUrl !== undefined && data.attachmentUrl !== null) {
    result.attachmentUrl = validateExternalURL(data.attachmentUrl as unknown);
  }

  if (data.attachmentName !== undefined && data.attachmentName !== null) {
    result.attachmentName = sanitizeHTML(validateString(data.attachmentName as unknown, 500));
  }

  if (data.reactionType !== undefined && data.reactionType !== null) {
    result.reactionType = validateString(data.reactionType as unknown, 100);
  }

  return result;
}
