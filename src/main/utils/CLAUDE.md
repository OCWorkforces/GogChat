# src/main/utils/

This directory contains utility modules for the main process. These utilities provide essential functionality for logging, rate limiting, and other cross-cutting concerns.

## Overview

**Purpose**: Main process utilities provide:
- **Structured logging**: Scoped loggers with consistent formatting
- **Rate limiting**: IPC flood protection and DoS prevention
- **Shared functionality**: Reusable code used across multiple features

**Security focus**: These utilities are critical for application security and stability. They prevent attack vectors like IPC flooding, provide audit trails via logging, and help track down issues in production.

## Files

### logger.ts
Structured logging utility with scoped loggers for consistent formatting and environment-aware log levels.

#### Key Exports

**LogLevel enum:**
```typescript
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}
```

**ScopedLogger class:**
```typescript
export class ScopedLogger {
  constructor(private scope: string)

  error(message: string, ...args: any[]): void
  warn(message: string, ...args: any[]): void
  info(message: string, ...args: any[]): void
  debug(message: string, ...args: any[]): void
  logError(entry: Omit<ErrorLogEntry, 'timestamp' | 'scope'>): void
  child(childScope: string): ScopedLogger
}
```

**Pre-configured loggers:**
```typescript
export const logger = {
  security: new ScopedLogger('Security'),
  performance: new ScopedLogger('Performance'),
  ipc: new ScopedLogger('IPC'),
  feature: (name: string) => new ScopedLogger(`Feature:${name}`),
  main: new ScopedLogger('Main'),
  config: new ScopedLogger('Config'),
  window: new ScopedLogger('Window'),
};
```

#### Usage Examples

**Basic logging:**
```typescript
import { logger } from './utils/logger';

// Pre-configured scoped logger
logger.security.error('Certificate validation failed', { issuer: 'Unknown' });
logger.ipc.warn('Rate limit exceeded for channel', channelName);
logger.main.info('Application started');

// Feature-specific logger
const featureLogger = logger.feature('BadgeIcon');
featureLogger.debug('Badge icon updated', { count: 5 });

// Child logger for nested scopes
const childLogger = logger.security.child('CertPinning');
childLogger.error('Invalid issuer detected');
// Outputs: [Security:CertPinning] Invalid issuer detected
```

**Structured error logging:**
```typescript
import { logger } from './utils/logger';
import type { ErrorLogEntry } from '../../shared/types';

logger.security.logError({
  level: 'error',
  message: 'SSL certificate validation failed',
  stack: error.stack,
  meta: {
    hostname: 'example.com',
    issuer: cert.issuer,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
  }
});
```

#### Configuration

**Environment-aware log levels:**
```typescript
import { configureLogging } from './utils/logger';

// Call during app initialization
configureLogging(isDev);
```

**Behavior:**
- **Development**: Console and file logs at `debug` level (verbose)
- **Production**: Console at `warn`, file at `info` (less verbose)

**Log file location:**
```typescript
import { getLogPath } from './utils/logger';

const logPath = getLogPath();
// macOS: ~/Library/Logs/GChat/main.log
// Windows: %USERPROFILE%\AppData\Roaming\GChat\logs\main.log
// Linux: ~/.config/GChat/logs/main.log
```

#### Design Principles

**Scoped logging benefits:**
1. **Traceability**: Easily identify which module produced a log
2. **Filtering**: Filter logs by scope during debugging
3. **Context**: Nested scopes provide hierarchical context
4. **Consistency**: All logs from a module use the same prefix

**Log level guidelines:**
- **ERROR**: Failures that impact functionality (user-visible errors)
- **WARN**: Issues that might cause problems (rate limits, deprecated usage)
- **INFO**: Important state changes (app started, feature initialized)
- **DEBUG**: Detailed diagnostic information (only in development)

**When to log:**
- Security events (authentication, certificate validation, permission checks)
- IPC validation failures (potential attack attempts)
- Feature initialization and lifecycle events
- Error conditions and exceptions
- Performance bottlenecks or unusual delays

**What NOT to log:**
- Sensitive user data (passwords, tokens, personal info)
- Excessive detail in production (creates noise, performance impact)
- Normal operation details (every IPC message, every poll cycle)

#### Integration with electron-log

This utility wraps `electron-log` which provides:
- **File persistence**: Automatic rotation, max file size limits
- **Multi-transport**: Console, file, remote (if configured)
- **Cross-process**: Logs from main and renderer processes
- **Format customization**: Timestamps, levels, colors

**electron-log features:**
- Automatic log file creation
- Log rotation (prevents unbounded growth)
- Error stack trace formatting
- Object pretty-printing
- Remote logging support (disabled by default)

### rateLimiter.ts
IPC rate limiter to prevent flooding, DoS attacks, and abuse of IPC channels.

#### Key Exports

**IPCRateLimiter class:**
```typescript
export class IPCRateLimiter {
  constructor()

  // Check if message is allowed
  isAllowed(channel: string, maxPerSecond?: number): boolean

  // Get statistics for a channel
  getStats(channel: string): { messagesLastSecond: number; totalBlocked: number } | undefined

  // Get statistics for all channels
  getAllStats(): Map<string, { messagesLastSecond: number; totalBlocked: number }>

  // Reset rate limit for a channel
  reset(channel: string): void

  // Reset all rate limits
  resetAll(): void

  // Clean up and stop the rate limiter
  destroy(): void
}
```

**Singleton helpers:**
```typescript
// Get the singleton rate limiter instance
export function getRateLimiter(): IPCRateLimiter

// Destroy the rate limiter singleton
export function destroyRateLimiter(): void
```

#### How It Works

**Rate limiting algorithm:**
1. Track timestamps of recent messages per channel
2. Filter to only messages within last second (sliding window)
3. If count >= limit, block message and increment blocked counter
4. Otherwise, allow message and record timestamp

**Memory management:**
- Automatic cleanup every 60 seconds
- Removes channels with no activity in last 5 minutes
- Prevents unbounded memory growth from inactive channels

**Default rate limits** (from `../../shared/constants.ts`):
```typescript
IPC_DEFAULT: 10,           // messages per second
IPC_UNREAD_COUNT: 5,       // unread count updates
IPC_FAVICON: 5,            // favicon changes
```

#### Usage Examples

**Basic usage:**
```typescript
import { getRateLimiter } from './utils/rateLimiter';
import { IPC_CHANNELS } from '../../shared/constants';
import { ipcMain } from 'electron';

const rateLimiter = getRateLimiter();

ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, (event, count) => {
  // Check rate limit (uses default for this channel: 5 msg/sec)
  if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) {
    log.warn('[Badge] Rate limited');
    return;
  }

  // Process message
  updateBadge(count);
});
```

**Custom rate limit:**
```typescript
// Allow only 1 message per second for sensitive operation
if (!rateLimiter.isAllowed('sensitiveOperation', 1)) {
  log.warn('[Security] Rate limited');
  return;
}
```

**Monitoring and statistics:**
```typescript
// Get stats for specific channel
const stats = rateLimiter.getStats(IPC_CHANNELS.UNREAD_COUNT);
if (stats) {
  console.log(`Messages in last second: ${stats.messagesLastSecond}`);
  console.log(`Total blocked: ${stats.totalBlocked}`);
}

// Get stats for all channels
const allStats = rateLimiter.getAllStats();
for (const [channel, stats] of allStats) {
  if (stats.totalBlocked > 0) {
    log.warn(`Channel ${channel} has ${stats.totalBlocked} blocked messages`);
  }
}
```

**Testing and debugging:**
```typescript
// Reset rate limit for testing
rateLimiter.reset(IPC_CHANNELS.UNREAD_COUNT);

// Reset all rate limits
rateLimiter.resetAll();

// Clean up (typically done on app quit)
rateLimiter.destroy();
```

#### Security Considerations

**Attack vectors prevented:**

1. **IPC Flooding**:
   - Malicious/buggy renderer sends thousands of messages
   - Rate limiter blocks excessive messages
   - Prevents main process from being overwhelmed

2. **DoS (Denial of Service)**:
   - Rapid IPC messages could freeze the app
   - Rate limiting ensures app remains responsive
   - Memory cleanup prevents exhaustion

3. **Resource Exhaustion**:
   - Unbounded message queues could consume memory
   - Cleanup removes inactive channels
   - Blocked counter helps identify abuse

**Warning signs of abuse:**
- High `totalBlocked` count (indicates persistent attempts to exceed limit)
- Many channels hitting limits simultaneously (coordinated attack)
- Rate limits triggered during normal usage (limits too strict or renderer bug)

**Logging behavior:**
- Logs warning every 10 blocked messages (avoids log spam)
- Logs debug message when removing inactive channels
- Provides visibility into rate limiting activity

#### Performance Characteristics

**Time complexity:**
- `isAllowed()`: O(n) where n = messages in last second (typically < 10)
- `cleanup()`: O(m) where m = number of channels (runs every 60s)
- `getStats()`: O(n) for specific channel
- `getAllStats()`: O(m * n) for all channels

**Memory usage:**
- ~100 bytes per message timestamp (stored for 1 second)
- ~200 bytes per channel entry
- Auto-cleanup prevents unbounded growth
- Typical memory: < 10KB for normal usage

**CPU impact:**
- Minimal: Array filtering is fast for small arrays
- Cleanup runs in background (setInterval)
- No blocking operations

#### Integration Points

**IPC Handlers** (all feature modules):
```typescript
import { getRateLimiter } from '../utils/rateLimiter';

ipcMain.on(channel, (event, data) => {
  if (!getRateLimiter().isAllowed(channel)) {
    log.warn('Rate limited');
    return;
  }
  // Handle message
});
```

**Feature Initialization** (`../index.ts`):
```typescript
// Rate limiter is created on first use (lazy initialization)
// No explicit initialization needed
```

**App Cleanup** (`../index.ts`):
```typescript
import { destroyRateLimiter } from './utils/rateLimiter';

app.on('will-quit', () => {
  destroyRateLimiter();
});
```

#### Testing

**Test file**: `rateLimiter.test.ts`

**Test coverage:**
- Basic rate limiting functionality
- Custom rate limits per channel
- Cleanup of inactive channels
- Statistics tracking
- Reset functionality
- Singleton behavior

**Running tests:**
```bash
npm test rateLimiter.test.ts
npm run test:coverage
```

## Common Patterns

### Using Logger in Features

**Pattern 1: Pre-configured logger**
```typescript
import { logger } from '../utils/logger';

export default (window: BrowserWindow) => {
  const log = logger.feature('MyFeature');

  try {
    log.info('Initializing feature');
    // Feature logic
    log.info('Feature initialized successfully');
  } catch (error) {
    log.error('Failed to initialize', error);
  }
};
```

**Pattern 2: Child logger for sub-components**
```typescript
import { logger } from '../utils/logger';

const featureLogger = logger.feature('BadgeIcon');

function updateWindowsBadge(count: number) {
  const badgeLogger = featureLogger.child('Windows');
  badgeLogger.debug('Updating Windows taskbar badge', { count });
  // Update logic
}

function updateMacBadge(count: number) {
  const badgeLogger = featureLogger.child('macOS');
  badgeLogger.debug('Updating macOS dock badge', { count });
  // Update logic
}
```

### Using Rate Limiter in IPC Handlers

**Standard pattern:**
```typescript
import { ipcMain } from 'electron';
import { getRateLimiter } from '../utils/rateLimiter';
import { IPC_CHANNELS } from '../../shared/constants';
import { validateInput } from '../../shared/validators';
import { logger } from '../utils/logger';

const log = logger.feature('MyFeature');
const rateLimiter = getRateLimiter();

ipcMain.on(IPC_CHANNELS.MY_CHANNEL, (event, data) => {
  try {
    // 1. Rate limiting
    if (!rateLimiter.isAllowed(IPC_CHANNELS.MY_CHANNEL)) {
      log.warn('Rate limited');
      return;
    }

    // 2. Input validation
    const validated = validateInput(data);

    // 3. Handle validated data
    handleData(validated);

    log.debug('Message processed successfully');
  } catch (error) {
    log.error('Failed to process message', error);
  }
});
```

**Custom rate limit for sensitive operations:**
```typescript
// Only allow 1 request per second for expensive operations
if (!rateLimiter.isAllowed('expensiveOperation', 1)) {
  log.warn('Expensive operation rate limited');
  return;
}
```

## Best Practices

### Logging Best Practices

1. **Use appropriate log levels**:
   - ERROR: User-impacting failures
   - WARN: Potential issues (rate limits, validation failures)
   - INFO: State changes (initialization, shutdown)
   - DEBUG: Detailed diagnostics (development only)

2. **Use scoped loggers**:
   - Create feature-specific loggers
   - Use child loggers for sub-components
   - Consistent scope naming (FeatureName, Component:SubComponent)

3. **Include context**:
   - Add relevant data to log messages
   - Use structured logging (objects, not string concatenation)
   - Include error stacks for exceptions

4. **Avoid sensitive data**:
   - Never log passwords, tokens, or personal info
   - Be careful with URLs (may contain credentials)
   - Sanitize user input before logging

5. **Performance considerations**:
   - Avoid logging in tight loops
   - Use DEBUG level for verbose output
   - Consider impact of logging on production performance

### Rate Limiting Best Practices

1. **Always rate limit IPC handlers**:
   - Prevents flooding attacks
   - Ensures app responsiveness
   - Detects renderer bugs early

2. **Choose appropriate limits**:
   - 10 msg/sec for non-critical channels (default)
   - 5 msg/sec for frequent updates (unread count, favicon)
   - 1 msg/sec for expensive operations
   - Higher limits only if justified by use case

3. **Log rate limit events**:
   - Warn when limits are hit (potential attack or bug)
   - Include channel name and blocked count
   - Monitor for patterns of abuse

4. **Test rate limits**:
   - Verify limits are effective but not too strict
   - Ensure normal usage doesn't trigger limits
   - Test with realistic message frequencies

5. **Monitor in production**:
   - Track `totalBlocked` counts
   - Investigate channels with high block counts
   - Adjust limits if needed based on real usage

## Adding New Utilities

When adding a new utility module:

1. **Create file** in this directory (`src/main/utils/`)
2. **Export class/functions** with clear API
3. **Add types** from `../../shared/types.ts` if needed
4. **Write tests** in `*.test.ts` file
5. **Document** usage in this CLAUDE.md file
6. **Import in features** as needed

**Example structure:**
```typescript
// myUtility.ts
import log from 'electron-log';
import type { MyUtilityConfig } from '../../shared/types';

export class MyUtility {
  constructor(config: MyUtilityConfig) {
    // Initialize
  }

  public doSomething(): void {
    // Implementation
  }
}

// Singleton pattern (if appropriate)
let instance: MyUtility | null = null;

export function getMyUtility(config?: MyUtilityConfig): MyUtility {
  if (!instance) {
    instance = new MyUtility(config || defaultConfig);
  }
  return instance;
}

export function destroyMyUtility(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
}
```

## Testing

**Test files:**
- `logger.test.ts` - Tests for logging functionality
- `rateLimiter.test.ts` - Tests for rate limiting

**Running tests:**
```bash
npm test                     # Run all tests
npm test utils/              # Run all utils tests
npm test rateLimiter.test   # Run specific test
npm run test:coverage        # Generate coverage report
```

**Coverage expectations:**
- 90%+ line coverage for utility modules
- All public methods tested
- Edge cases covered (error conditions, boundary values)
- Performance characteristics validated

## Troubleshooting

### Logger Issues

**Logs not appearing:**
- Check log level configuration
- Verify `configureLogging()` was called
- Check log file location with `getLogPath()`

**Too much logging:**
- Reduce log level in production (WARN or INFO)
- Remove DEBUG logs from hot paths
- Use conditional logging for verbose output

**Log file too large:**
- electron-log auto-rotates (default 1MB max size)
- Check for excessive logging in production
- Consider reducing log retention

### Rate Limiter Issues

**False positives (legitimate traffic blocked):**
- Increase rate limit for that channel
- Check if renderer is sending too frequently
- Review polling intervals (may be too aggressive)

**Not blocking abuse:**
- Lower rate limit for sensitive channels
- Check if attacker is using different channels
- Monitor `getAllStats()` for patterns

**Memory leak:**
- Verify cleanup interval is running
- Check for channels that never go inactive
- Monitor memory usage over time

**Performance impact:**
- Rate limiting is very fast (< 1ms per check)
- If slow, check for extremely high message frequency
- Consider reducing cleanup frequency if needed
