# src/shared/

This directory contains shared code used across both the main process and preload scripts. These modules ensure consistency, type safety, and security across process boundaries.

## Overview

**Purpose**: Shared utilities provide:
- **Type safety**: TypeScript interfaces and types for IPC communication
- **Constants**: Centralized values to prevent typos and magic strings
- **Validation**: Input sanitization for all IPC messages and external data
- **Security**: Defense against injection attacks, XSS, and malicious input

**Usage context**:
- Main process: Uses all modules for validation and type checking
- Preload scripts: Uses constants and types for IPC communication
- Both processes: Share the same definitions, ensuring compatibility

## Files

### constants.ts
Centralized constants for IPC channels, DOM selectors, timing values, and configuration.

**Key exports:**

#### IPC_CHANNELS
Channel names for inter-process communication. Using constants prevents typos and makes refactoring easier.

```typescript
export const IPC_CHANNELS = {
  // From renderer to main
  UNREAD_COUNT: 'unreadCount',
  FAVICON_CHANGED: 'faviconChanged',
  NOTIFICATION_CLICKED: 'notificationClicked',
  CHECK_IF_ONLINE: 'checkIfOnline',
  PASSKEY_AUTH_FAILED: 'passkeyAuthFailed',  // WebAuthn/passkey auth failure

  // From main to renderer
  SEARCH_SHORTCUT: 'searchShortcut',
  ONLINE_STATUS: 'onlineStatus',
} as const;
```

**Usage:**
```typescript
// Preload script
import { IPC_CHANNELS } from '../shared/constants';
ipcRenderer.send(IPC_CHANNELS.UNREAD_COUNT, count);

// Main process
import { IPC_CHANNELS } from '../../shared/constants';
ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, (event, count) => { ... });
```

#### SELECTORS
DOM selectors for Google Chat elements. These may need updating if Google changes their HTML structure.

```typescript
export const SELECTORS = {
  CHAT_GROUP: 'div[data-tooltip="Chat"][role="group"]',
  SPACES_GROUP: 'div[data-tooltip="Spaces"][role="group"]',
  UNREAD_HEADING: 'span[role="heading"]',
  SEARCH_INPUT: 'input[name="q"]',
  FAVICON_ICON: 'link[rel="icon"]',
  FAVICON_SHORTCUT: 'link[rel="shortcut icon"]',
} as const;
```

**Used by**: Preload scripts that extract data from Google Chat DOM

#### TIMING
Timing constants for polling intervals, throttling, and timeouts. Centralized to maintain consistency.

```typescript
export const TIMING = {
  // Polling intervals (in milliseconds)
  FAVICON_POLL: 1000,
  UNREAD_COUNT_POLL: 1000,

  // Debounce/throttle delays
  WINDOW_STATE_SAVE: 500,

  // Timeouts
  CONNECTIVITY_CHECK: 5000,
  CONNECTIVITY_CHECK_FAST: 3000,

  // Re-guard timer for external links
  EXTERNAL_LINKS_REGUARD: 5 * 60 * 1000, // 5 minutes
} as const;
```

#### RATE_LIMITS
Rate limiting configuration for IPC channels. Prevents flooding and DoS attacks.

```typescript
export const RATE_LIMITS = {
  IPC_DEFAULT: 10,        // messages per second
  IPC_UNREAD_COUNT: 5,
  IPC_FAVICON: 5,
} as const;
```

#### BADGE
Badge icon configuration and limits.

```typescript
export const BADGE = {
  MAX_COUNT: 9999,
  CACHE_LIMIT: 99,  // Cache icons for counts 0-99
} as const;
```

#### WHITELISTED_HOSTS
Allowed domains for navigation. External URLs are blocked unless whitelisted.

```typescript
export const WHITELISTED_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'chat.google.com',
  'mail.google.com',
] as const;
```

**Security impact**: Only these domains can be navigated within the app window. All other URLs open in external browser.

#### FAVICON_PATTERNS
Regex patterns for detecting Google Chat state from favicon.

```typescript
export const FAVICON_PATTERNS = {
  NORMAL: /favicon_chat_r2|favicon_chat_new_non_notif_r2/,
  BADGE: /favicon_chat_new_notif_r2/,
} as const;
```

### types.ts
TypeScript type definitions shared across processes. Single source of truth for all data structures.

**Key exports:**

#### IconType
```typescript
export type IconType = 'offline' | 'normal' | 'badge';
```

#### IPC Data Structures
```typescript
export interface UnreadCountData {
  count: number;
  timestamp: number;
}

export interface FaviconData {
  href: string;
  type: IconType;
  timestamp: number;
}

export interface OnlineStatusData {
  online: boolean;
  timestamp: number;
}

export interface PasskeyFailureData {
  errorType: string;  // WebAuthn error type (NotAllowedError, NotSupportedError, etc.)
  timestamp: number;
}
```

**Usage**: Ensures type safety for all IPC communications. Both sender and receiver use the same types.

#### Configuration Types
```typescript
export interface WindowBounds {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
}

export interface WindowState {
  bounds: WindowBounds;
  isMaximized: boolean;
}

export interface AppConfig {
  autoCheckForUpdates: boolean;
  autoLaunchAtLogin: boolean;
  startHidden: boolean;
  hideMenuBar: boolean;
  disableSpellChecker: boolean;
  suppressPasskeyDialog: boolean;  // Don't show passkey permissions dialog (macOS)
}

export interface StoreType {
  window: WindowState;
  app: AppConfig;
}
```

**Usage**: Used by `electron-store` for schema validation and type-safe configuration access.

#### Context Bridge API
```typescript
export interface GChatBridgeAPI {
  // Send messages to main process
  sendUnreadCount: (count: number) => void;
  sendFaviconChanged: (href: string) => void;
  sendNotificationClicked: () => void;
  checkIfOnline: () => void;
  reportPasskeyFailure: (errorType: string) => void;

  // Receive messages from main process
  onSearchShortcut: (callback: () => void) => () => void;
  onOnlineStatus: (callback: (online: boolean) => void) => () => void;
}

declare global {
  interface Window {
    gchat: GChatBridgeAPI;
  }
}
```

**Usage**: Defines the API exposed to renderer via `contextBridge`. Preload scripts implement this interface, renderer consumes it.

#### Utility Types
```typescript
export interface RateLimitEntry {
  timestamps: number[];
  blocked: number;
}

export interface BadgeIconCacheEntry {
  icon: Electron.NativeImage;
  count: number;
  timestamp: number;
}

export interface LinkValidationResult {
  valid: boolean;
  sanitizedURL?: string;
  reason?: string;
}

export interface ErrorLogEntry {
  timestamp: number;
  level: 'error' | 'warn' | 'info' | 'debug';
  scope: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

export interface PerformanceMetrics {
  startupTime?: number;
  ipcMessageCount: number;
  memoryUsage?: NodeJS.MemoryUsage;
  domObserverCount: number;
}
```

### validators.ts
Input validation and sanitization functions. **Critical for security** - all IPC messages and external data must be validated.

**Key functions:**

#### validateUnreadCount(count: unknown): number
Validates and sanitizes unread count values from renderer.

**Validation rules:**
- Type: Must be number or string convertible to number
- Range: 0 to BADGE.MAX_COUNT (9999)
- Format: No NaN, must be finite, floor to integer
- Security: Prevents negative values, overflow, and non-numeric input

**Example:**
```typescript
import { validateUnreadCount } from '../../shared/validators';

ipcMain.on('unreadCount', (event, count) => {
  try {
    const validCount = validateUnreadCount(count);
    updateBadge(validCount);
  } catch (error) {
    log.error('[Badge] Invalid count:', error);
  }
});
```

#### validateFaviconURL(href: unknown): string
Validates and sanitizes favicon URLs.

**Validation rules:**
- Type: Must be string
- Length: Maximum 2048 characters (prevents DoS)
- Format: Valid URL format
- Protocol: Only http, https, or data (inline images)
- Security: Prevents empty URLs, malformed URLs, and excessive length

**Example:**
```typescript
const validURL = validateFaviconURL(href);
```

#### validateExternalURL(url: unknown): string
Validates and sanitizes external URLs before opening with `shell.openExternal()`.

**Validation rules:**
- Type: Must be string
- Length: Maximum 2048 characters
- Format: Valid URL format
- Protocol whitelist: **Only http and https allowed**
- Credential stripping: Removes username/password to prevent leakage
- Pattern blocking: Rejects dangerous patterns (javascript:, data:, vbscript:, file:, about:)

**Security rationale:**
- Prevents XSS via javascript: URLs
- Blocks local file access via file: URLs
- Prevents data exfiltration via credentials in URL
- Protects against protocol handler exploits

**Example:**
```typescript
import { validateExternalURL } from '../../shared/validators';

try {
  const safeURL = validateExternalURL(url);
  shell.openExternal(safeURL);
} catch (error) {
  log.error('[ExternalLinks] Unsafe URL blocked:', error);
}
```

#### isWhitelistedHost(url: string, currentHost: string): boolean
Checks if a URL belongs to a whitelisted domain.

**Usage:**
```typescript
const isInternal = isWhitelistedHost(targetURL, window.location.hostname);
if (!isInternal) {
  // Open in external browser
  shell.openExternal(validateExternalURL(targetURL));
}
```

#### validateBoolean(value: unknown): boolean
Validates boolean values from IPC or user input.

**Accepts:**
- `true` / `false` (boolean)
- `"true"` / `"false"` (string, case-insensitive)
- `1` / `0` (number)

**Throws**: Error if value cannot be converted to boolean

#### validateString(value: unknown, maxLength = 1000): string
Validates string values with configurable length limit.

**Validation:**
- Type check
- Length limit (default 1000, configurable)
- Returns original string if valid

**Security**: Prevents DoS via excessive string length

#### isSafeObject(value: unknown): boolean
Type guard for safe plain objects (not null, not array, not custom class).

**Usage:**
```typescript
if (isSafeObject(data)) {
  // Safe to access properties
  const value = data.someProperty;
}
```

**Security**: Prevents prototype pollution and unexpected object types

#### sanitizeHTML(html: string): string
Escapes HTML entities to prevent XSS.

**Encoding:**
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#x27;`
- `/` → `&#x2F;`

**Usage:**
```typescript
const safeHTML = sanitizeHTML(userInput);
element.textContent = safeHTML; // Safe to insert
```

**Note**: This is basic escaping. For complex HTML rendering, consider using a proper sanitization library.

#### validatePasskeyFailureData(errorType: unknown): PasskeyFailureData
Validates passkey/WebAuthn error data from the renderer process.

**Validation:**
- Type: String, max 100 characters
- Whitelist: Known WebAuthn error types (NotAllowedError, NotSupportedError, SecurityError, AbortError, InvalidStateError)
- Logging: Warns on unexpected error types but allows them (for forward compatibility)
- Security: Prevents injection attacks and validates length

**Returns:**
```typescript
{
  errorType: string,
  timestamp: number  // Auto-generated
}
```

**Usage:**
```typescript
import { validatePasskeyFailureData } from '../../shared/validators';

ipcMain.on(IPC_CHANNELS.PASSKEY_AUTH_FAILED, (event, errorType) => {
  try {
    const validated = validatePasskeyFailureData(errorType);
    handlePasskeyFailure(validated);
  } catch (error) {
    log.error('[Passkey] Validation failed:', error);
  }
});
```

## Security Architecture

### Defense Layers

1. **Input Validation**
   - All IPC messages validated before use
   - Type checking, range checking, format validation
   - Rejects malformed or malicious input

2. **Output Sanitization**
   - URLs sanitized before opening
   - HTML escaped before rendering
   - Credentials stripped from URLs

3. **Protocol Whitelisting**
   - Only http/https for external URLs
   - Only http/https/data for favicons
   - Blocks dangerous protocols (javascript:, file:, etc.)

4. **Length Limits**
   - Strings limited to prevent DoS
   - Numeric values bounded to safe ranges
   - Cache limits prevent memory exhaustion

5. **Pattern Blocking**
   - Dangerous URL patterns rejected
   - Suspicious input logged and blocked
   - Rate limiting prevents flooding

### Common Attack Vectors (Mitigated)

**XSS (Cross-Site Scripting)**:
- `sanitizeHTML()` escapes all HTML entities
- URL validation blocks `javascript:` and `data:` URLs
- Content Security Policy enforced in renderer

**Injection Attacks**:
- All inputs validated with strict type checking
- No eval() or dynamic code execution
- SQL/NoSQL not used (electron-store is key-value)

**DoS (Denial of Service)**:
- String length limits prevent memory exhaustion
- Rate limiting prevents IPC flooding
- Cache size limits prevent unbounded growth

**Path Traversal**:
- URL validation blocks `file:` protocol
- No file paths accepted from renderer
- Resources loaded from trusted locations only

**Prototype Pollution**:
- `isSafeObject()` validates plain objects only
- No deep merging of untrusted objects
- Strict type checking on all inputs

## Adding New Types/Validators

### When to add a new type:

1. New IPC message format
2. New configuration field
3. New data structure shared between processes
4. New API exposed via contextBridge

**Process:**
1. Add interface/type to `types.ts`
2. Add corresponding validator to `validators.ts`
3. Add constants (if needed) to `constants.ts`
4. Update IPC handlers to use new validator
5. Add tests for validator (see `validators.test.ts`)

**Example:**
```typescript
// types.ts
export interface NewFeatureData {
  value: string;
  enabled: boolean;
  count: number;
}

// validators.ts
export function validateNewFeatureData(data: unknown): NewFeatureData {
  if (!isSafeObject(data)) {
    throw new Error('NewFeatureData must be an object');
  }

  return {
    value: validateString(data.value, 500),
    enabled: validateBoolean(data.enabled),
    count: validateUnreadCount(data.count),
  };
}

// constants.ts
export const IPC_CHANNELS = {
  // ... existing channels
  NEW_FEATURE: 'newFeature',
} as const;

// Main process handler
import { IPC_CHANNELS } from '../../shared/constants';
import { validateNewFeatureData } from '../../shared/validators';

ipcMain.on(IPC_CHANNELS.NEW_FEATURE, (event, data) => {
  try {
    const validated = validateNewFeatureData(data);
    handleNewFeature(validated);
  } catch (error) {
    log.error('[NewFeature] Validation failed:', error);
  }
});
```

## Testing

All validators have comprehensive test coverage in `*.test.ts` files:
- `constants.test.ts` - Validates constant values and structure
- `validators.test.ts` - Tests all validation functions with valid/invalid inputs

**Running tests:**
```bash
npm test                    # Run all tests
npm test validators.test    # Run specific test file
npm run test:coverage       # Generate coverage report
```

**Writing new tests:**
```typescript
import { describe, it, expect } from 'vitest';
import { validateNewFeature } from './validators';

describe('validateNewFeature', () => {
  it('should accept valid input', () => {
    expect(validateNewFeature({ value: 'test' })).toEqual({ value: 'test' });
  });

  it('should reject invalid input', () => {
    expect(() => validateNewFeature(null)).toThrow();
    expect(() => validateNewFeature({ value: 123 })).toThrow();
  });

  it('should sanitize input', () => {
    expect(validateNewFeature({ value: '  test  ' })).toEqual({ value: 'test' });
  });
});
```

## Best Practices

### For validators:
1. **Always validate type first** - prevents type confusion attacks
2. **Apply length limits** - prevents DoS
3. **Sanitize output** - remove dangerous characters/patterns
4. **Log validation failures** - helps detect attack attempts
5. **Throw descriptive errors** - aids debugging
6. **Use existing validators** - compose complex validators from simple ones

### For types:
1. **Use strict types** - avoid `any`, prefer specific types
2. **Document fields** - add JSDoc comments
3. **Use readonly** - prevent accidental mutations
4. **Use const assertions** - for constant objects (as const)
5. **Export all types** - for use in other modules

### For constants:
1. **Use UPPER_CASE** - for true constants
2. **Use as const** - for type literals
3. **Group related constants** - in objects
4. **Document magic numbers** - explain why that value
5. **Never hardcode values** - use constants instead

## Integration Points

**Main Process:**
- All IPC handlers use validators from this directory
- Configuration store uses StoreType from types.ts
- Features use constants for consistent values

**Preload Scripts:**
- Use IPC_CHANNELS for consistent channel names
- Use SELECTORS for DOM queries
- Use types for type-safe IPC sending

**Build Process:**
- TypeScript compiles all files to `lib/shared/`
- Both main and preload bundles include shared code
- Tests run during `npm test`

**Security:**
- All external input validated before use
- No eval() or dynamic code execution
- Rate limiting applied to all IPC channels
- URLs sanitized before opening externally
