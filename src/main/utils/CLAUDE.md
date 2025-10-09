# src/main/utils/

This directory contains utility modules for the main process. These utilities provide essential functionality for logging, rate limiting, and other cross-cutting concerns.

## Overview

**Purpose**: Main process utilities provide:
- **Structured logging**: Scoped loggers with consistent formatting
- **Rate limiting**: IPC flood protection and DoS prevention
- **Performance optimization**: Icon caching, config caching, and performance monitoring
- **Resource management**: Package info caching, performance profiling
- **Shared functionality**: Reusable code used across multiple features

**Security focus**: These utilities are critical for application security and stability. They prevent attack vectors like IPC flooding, provide audit trails via logging, and help track down issues in production.

**Performance focus**: Caching utilities reduce file I/O and encryption overhead, improving startup time by 17-35ms with negligible memory impact (~115KB).

## Files

### Performance Optimization Utilities

The following utilities improve application startup time and runtime performance through intelligent caching and monitoring. For comprehensive technical documentation, see `PERFORMANCE_UTILITIES.md` in this directory.

**iconCache.ts** - Centralized icon loading and caching
- Eliminates 6+ redundant file I/O operations
- Pre-loads 7 common icons at startup via `warmCache()`
- Saves ~10-20ms during startup
- Memory: ~100KB (7 icons × ~14KB avg)

**packageInfo.ts** - Package.json singleton cache
- Loads package.json once, eliminates 2 duplicate reads
- Provides typed interface for type safety
- Frozen object for immutability
- Saves ~2-5ms during startup

**performanceMonitor.ts** - Startup timing tracker
- Tracks timing markers throughout app lifecycle
- Measures time between markers
- Logs comprehensive performance summary
- Negligible overhead (~0.01ms per mark)

**configProfiler.ts** - electron-store performance profiler
- Measures config read performance
- Determines if caching is beneficial
- Threshold: 0.1ms average read time
- Runs automatically in development mode

**configCache.ts** - In-memory config cache layer
- Reduces encryption/decryption overhead
- Automatic cache invalidation on writes
- Tracks hit/miss statistics
- Enabled by default, disabled in tests
- Saves ~2-5ms during startup

**Total Performance Impact**: 17-35ms faster startup with ~115KB memory overhead

For detailed API references, usage patterns, integration guides, and troubleshooting, see `PERFORMANCE_UTILITIES.md`.

---

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

### ipcHelper.ts
Factory functions for creating secure, validated IPC handlers with consistent security patterns.

#### Key Exports

**Handler configuration interfaces:**
```typescript
export interface IPCHandlerConfig<T> {
  channel: string;
  validator: (data: unknown) => T;
  handler: (data: T, event: IpcMainEvent | IpcMainInvokeEvent) => void | Promise<void>;
  rateLimit?: number;
  onError?: (error: Error, event: IpcMainEvent | IpcMainInvokeEvent) => void;
  silent?: boolean;
  description?: string;
}

export interface IPCReplyHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: T, event: IpcMainEvent) => R | Promise<R>;
  replyChannel?: string;
}

export interface IPCInvokeHandlerConfig<T, R> extends Omit<IPCHandlerConfig<T>, 'handler'> {
  handler: (data: T, event: IpcMainInvokeEvent) => R | Promise<R>;
}
```

**Factory functions:**
```typescript
// One-way communication (renderer -> main)
export function createSecureIPCHandler<T>(config: IPCHandlerConfig<T>): () => void

// Request/response with event.reply()
export function createSecureReplyHandler<T, R>(config: IPCReplyHandlerConfig<T, R>): () => void

// Promise-based request/response with ipcRenderer.invoke()
export function createSecureInvokeHandler<T, R>(config: IPCInvokeHandlerConfig<T, R>): () => void

// Broadcast to all windows
export function createBroadcastHandler<T>(config: {
  channel: string;
  validator: (data: unknown) => T;
  filter?: (window: BrowserWindow, data: T) => boolean;
}): (data: unknown) => void

// Send to specific window
export function sendToWindow<T>(
  window: BrowserWindow | null,
  channel: string,
  data: T,
  validator?: (data: T) => T
): boolean
```

**Handler manager:**
```typescript
export class IPCHandlerManager {
  register<T>(config: IPCHandlerConfig<T>): void
  registerReply<T, R>(config: IPCReplyHandlerConfig<T, R>): void
  registerInvoke<T, R>(config: IPCInvokeHandlerConfig<T, R>): void
  cleanup(): void
}

export function getIPCManager(): IPCHandlerManager
export function cleanupGlobalHandlers(): void
```

**Common validators:**
```typescript
export const commonValidators = {
  isObject: (data: unknown): Record<string, unknown>
  isString: (data: unknown): string
  isNumber: (data: unknown): number
  isBoolean: (data: unknown): boolean
  passthrough: <T>(data: unknown): T
}
```

#### Usage Examples

**Creating a secure IPC handler:**
```typescript
import { createSecureIPCHandler, commonValidators } from '../utils/ipcHelper';
import { IPC_CHANNELS } from '../../shared/constants';

const cleanup = createSecureIPCHandler({
  channel: IPC_CHANNELS.UNREAD_COUNT,
  validator: commonValidators.isNumber,
  handler: (count, event) => {
    updateBadge(count);
  },
  rateLimit: 5,
  description: 'Update unread count badge',
});

// Later, to cleanup:
cleanup();
```

**Using invoke handler for async responses:**
```typescript
import { createSecureInvokeHandler } from '../utils/ipcHelper';

const cleanup = createSecureInvokeHandler({
  channel: 'get-app-version',
  validator: commonValidators.passthrough,
  handler: async (data, event) => {
    return app.getVersion();
  },
  rateLimit: 10,
});
```

**Using handler manager:**
```typescript
import { getIPCManager, commonValidators } from '../utils/ipcHelper';

const manager = getIPCManager();

manager.register({
  channel: 'channel-1',
  validator: commonValidators.isString,
  handler: (data) => console.log(data),
});

manager.registerInvoke({
  channel: 'channel-2',
  validator: commonValidators.isNumber,
  handler: async (data) => data * 2,
});

// Cleanup all handlers at once
manager.cleanup();
```

**Broadcasting to all windows:**
```typescript
import { createBroadcastHandler } from '../utils/ipcHelper';

const broadcast = createBroadcastHandler({
  channel: 'settings-changed',
  validator: commonValidators.isObject,
  filter: (window, data) => !window.isDestroyed(),
});

broadcast({ theme: 'dark' });
```

#### Benefits

**Reduces boilerplate:**
- No need to manually implement rate limiting in every handler
- Validation logic centralized and reusable
- Consistent error handling across all IPC handlers

**Security by default:**
- All handlers include rate limiting
- All inputs validated before processing
- All errors caught and logged
- Type-safe validators prevent runtime errors

**Easy cleanup:**
- Each factory returns a cleanup function
- Handler manager allows batch cleanup
- Prevents memory leaks from orphaned listeners

---

### ipcDeduplicator.ts
Prevents duplicate IPC requests from being processed in quick succession. Useful for debouncing rapid state changes and preventing redundant work.

#### Key Exports

**IPCDeduplicator class:**
```typescript
export class IPCDeduplicator {
  constructor(config?: DeduplicationConfig)

  // Deduplicate a request by key
  async deduplicate<T>(key: string, fn: () => Promise<T>, windowMs?: number): Promise<T>

  // Deduplicate with custom key generation
  async deduplicateWithKey<T, A extends unknown[]>(
    keyFn: (...args: A) => string,
    fn: (...args: A) => Promise<T>,
    ...args: A
  ): Promise<T>

  // Create a deduplicated version of a function
  createDeduplicated<T, A extends unknown[]>(
    fn: (...args: A) => Promise<T>,
    keyFn: (...args: A) => string,
    windowMs?: number
  ): (...args: A) => Promise<T>

  // Cache management
  clear(key: string): void
  clearAll(): void
  getStats(): { deduplicatedCount: number; cacheHits: number; cacheMisses: number }
  getCacheSize(): number
  destroy(): void
}
```

**Configuration:**
```typescript
export interface DeduplicationConfig {
  windowMs?: number;        // Time window (default: 100ms)
  maxCacheSize?: number;    // Max cached keys (default: 100)
  debug?: boolean;          // Enable debug logging (default: false)
}
```

**Singleton helpers:**
```typescript
export function getDeduplicator(): IPCDeduplicator
export function destroyDeduplicator(): void
```

**Common patterns:**
```typescript
export const deduplicationPatterns = {
  byChannel: (channel: string) => channel,
  byChannelAndData: (channel: string, data: unknown) => string,
  byChannelAndFirstArg: (channel: string, arg: unknown) => string,
  byWindowOperation: (operation: string, windowId?: number) => string,
  byFileOperation: (operation: string, path: string) => string,
}
```

**Helper functions:**
```typescript
export function createDeduplicatedHandler<T>(
  channel: string,
  handler: () => Promise<T>,
  windowMs?: number
): () => Promise<T>

export function withDeduplication<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>,
  keyFn: (...args: A) => string,
  windowMs?: number
): (...args: A) => Promise<T>
```

#### How It Works

**Deduplication algorithm:**
1. When a request comes in, check if there's a pending request with the same key
2. If found within the time window, return the existing promise (cache hit)
3. Otherwise, execute the function and cache the promise (cache miss)
4. Multiple requests with the same key share the same promise
5. Cache entries expire after the time window

**Memory management:**
- Automatic cleanup every 1 second
- Removes entries older than 2x the time window
- Prevents unbounded memory growth

**Statistics tracking:**
- Counts cache hits (deduplicated requests)
- Counts cache misses (new requests)
- Total deduplicated count

#### Usage Examples

**Basic deduplication:**
```typescript
import { getDeduplicator } from '../utils/ipcDeduplicator';

const deduplicator = getDeduplicator();

async function fetchUserData(userId: string) {
  return deduplicator.deduplicate(
    `fetch-user-${userId}`,
    async () => {
      // Expensive operation
      return await database.getUser(userId);
    },
    200 // 200ms window
  );
}

// Multiple calls within 200ms share the same promise:
const user1 = fetchUserData('123'); // Executes
const user2 = fetchUserData('123'); // Returns same promise (deduplicated)
const user3 = fetchUserData('123'); // Returns same promise (deduplicated)
```

**Creating a deduplicated function:**
```typescript
import { withDeduplication } from '../utils/ipcDeduplicator';

const saveSettings = withDeduplication(
  async (settings: Settings) => {
    await store.set('settings', settings);
  },
  (settings) => 'save-settings', // All calls use same key
  300 // 300ms window
);

// Rapid calls are deduplicated:
saveSettings({ theme: 'dark' });
saveSettings({ theme: 'light' }); // Deduplicated
saveSettings({ theme: 'auto' });  // Deduplicated
```

**Custom key generation:**
```typescript
import { getDeduplicator, deduplicationPatterns } from '../utils/ipcDeduplicator';

const deduplicator = getDeduplicator();

async function updateWindowBounds(windowId: number, bounds: Rectangle) {
  return deduplicator.deduplicateWithKey(
    deduplicationPatterns.byWindowOperation,
    async (op: string, id: number) => {
      await saveBoundsToStore(id, bounds);
    },
    'update-bounds',
    windowId
  );
}
```

**Monitoring statistics:**
```typescript
import { getDeduplicator } from '../utils/ipcDeduplicator';

const deduplicator = getDeduplicator();
const stats = deduplicator.getStats();

console.log(`Deduplicated: ${stats.deduplicatedCount} requests`);
console.log(`Cache hits: ${stats.cacheHits}`);
console.log(`Cache misses: ${stats.cacheMisses}`);
console.log(`Hit rate: ${(stats.cacheHits / (stats.cacheHits + stats.cacheMisses) * 100).toFixed(1)}%`);
```

#### Use Cases

**Window state saving:**
- User resizes window rapidly → multiple resize events
- Deduplication ensures only last resize is saved
- Reduces disk I/O operations

**Badge count updates:**
- Google Chat sends rapid unread count changes
- Deduplication batches updates automatically
- Prevents excessive badge icon rendering

**Configuration changes:**
- Settings UI triggers rapid updates (e.g., slider movements)
- Deduplication saves only final value
- Improves UI responsiveness

**Search queries:**
- User types rapidly in search box
- Each keystroke triggers search
- Deduplication ensures only final query executes

#### Performance Characteristics

**Time complexity:**
- `deduplicate()`: O(1) hash map lookup
- `cleanup()`: O(n) where n = cached entries
- Very fast for typical use cases

**Memory usage:**
- ~200 bytes per cached promise
- Default max: 100 entries = ~20KB
- Auto-cleanup prevents growth

**Best practices:**
- Use short time windows (50-300ms) for UI operations
- Use longer windows (500-1000ms) for expensive operations
- Monitor statistics to tune window sizes
- Clear cache when feature is disabled/destroyed

---

### platform.ts
Platform detection and utilities for cross-platform functionality.

#### Key Exports

**Platform detection:**
```typescript
export type Platform = 'darwin' | 'win32' | 'linux';

export const platform = {
  isMac: boolean,
  isWindows: boolean,
  isLinux: boolean,
  name: Platform,
  config: PlatformConfig,
}

export interface PlatformConfig {
  supportsOverlayIcon: boolean;
  supportsDockBadge: boolean;
  supportsTaskbarBadge: boolean;
  supportsTrayIcon: boolean;
  supportsAutoLaunch: boolean;
  supportsSpellChecker: boolean;
  defaultIconFormat: 'ico' | 'icns' | 'png';
  trayIconSize: { width: number; height: number };
}
```

**PlatformUtils class:**
```typescript
export class PlatformUtils {
  getAppIconPath(): string
  getTrayIconPath(): string
  createTrayIcon(): Tray
  setBadge(window: BrowserWindow, count: number): void
  clearBadge(window: BrowserWindow): void
  getShortcuts(): Record<string, string>
  applyWindowOptions(options: Electron.BrowserWindowConstructorOptions): void
  isFeatureSupported(feature: keyof PlatformConfig): boolean
  getPlatformInfo(): Record<string, unknown>
}

export function getPlatformUtils(): PlatformUtils
```

**Utility functions:**
```typescript
export function enforceMacOSAppLocation(): void
export function openNewGitHubIssue(options: {
  repoUrl: string;
  body?: string;
  title?: string;
  labels?: string[];
}): void
export function debugInfo(): string
export function isFirstAppLaunch(store: Store<StoreType>): boolean
export function getAppPath(): string
export function isPackaged(): boolean
export function isDevelopment(): boolean
```

**Feature support checks:**
```typescript
export const supports = {
  overlayIcon: () => boolean,
  dockBadge: () => boolean,
  taskbarBadge: () => boolean,
  trayIcon: () => boolean,
  autoLaunch: () => boolean,
  spellChecker: () => boolean,
}
```

#### Usage Examples

**Platform-specific badge handling:**
```typescript
import { getPlatformUtils } from '../utils/platform';

const platformUtils = getPlatformUtils();

// Set badge count (automatically handles platform differences)
platformUtils.setBadge(mainWindow, 5);

// Clear badge
platformUtils.clearBadge(mainWindow);
```

**Creating tray icon:**
```typescript
import { getPlatformUtils } from '../utils/platform';

const platformUtils = getPlatformUtils();
const tray = platformUtils.createTrayIcon();

// Tray is automatically configured for the current platform
```

**Platform-specific keyboard shortcuts:**
```typescript
import { getPlatformUtils } from '../utils/platform';

const platformUtils = getPlatformUtils();
const shortcuts = platformUtils.getShortcuts();

console.log(shortcuts.quit);        // 'Cmd+Q' on macOS, 'Ctrl+Q' elsewhere
console.log(shortcuts.preferences); // 'Cmd+,' on macOS, 'Ctrl+,' elsewhere
```

**Applying platform-specific window options:**
```typescript
import { getPlatformUtils } from '../utils/platform';

const platformUtils = getPlatformUtils();
const options: BrowserWindowConstructorOptions = {
  width: 800,
  height: 600,
};

platformUtils.applyWindowOptions(options);
// macOS: Adds titleBarStyle, trafficLightPosition
// Windows: Adds autoHideMenuBar
// Linux: Adds icon
```

**Checking feature support:**
```typescript
import { supports } from '../utils/platform';

if (supports.dockBadge()) {
  // Use dock badge (macOS only)
  app.dock.setBadge('5');
} else if (supports.overlayIcon()) {
  // Use overlay icon (Windows only)
  window.setOverlayIcon(icon, 'description');
}
```

**Getting debug information:**
```typescript
import { debugInfo } from '../utils/platform';

const info = debugInfo();
// Returns formatted string with:
// - App name and version
// - Electron/Chrome/Node/V8 versions
// - Platform and architecture
// - Memory usage
```

#### Platform Differences

**Badge/Overlay Icons:**
- **macOS**: Uses `app.dock.setBadge()` for dock badge
- **Windows**: Uses `window.setOverlayIcon()` for taskbar overlay
- **Linux**: Limited support, attempts `app.setBadgeCount()`

**Tray Icons:**
- **macOS**: 16x16 template PNG (auto-adapts to dark/light mode)
- **Windows**: 16x16 ICO format
- **Linux**: 16x16 PNG format

**Window Decorations:**
- **macOS**: Hidden inset title bar with custom traffic light position
- **Windows**: Auto-hide menu bar enabled by default
- **Linux**: Custom icon path required

**Keyboard Shortcuts:**
- **macOS**: Uses `Cmd` modifier
- **Windows/Linux**: Uses `Ctrl` modifier

---

### resourceCleanup.ts
Manages cleanup of resources when windows close or the app quits. Prevents memory leaks and ensures graceful shutdown.

#### Key Exports

**ResourceCleanupManager class:**
```typescript
export class ResourceCleanupManager {
  registerTask(task: CleanupTask): void
  registerTasks(tasks: CleanupTask[]): void
  trackInterval(interval: NodeJS.Timeout): void
  trackTimeout(timeout: NodeJS.Timeout): void
  trackListener(target: EventTarget, event: string, handler: EventHandler): void
  async cleanup(config?: CleanupConfig): Promise<void>
  reset(): void
}

export interface CleanupTask {
  name: string;
  cleanup: () => void | Promise<void>;
  critical?: boolean;
}

export interface CleanupConfig {
  window?: BrowserWindow;
  includeGlobalResources?: boolean;
  logDetails?: boolean;
}
```

**Singleton helpers:**
```typescript
export function getCleanupManager(): ResourceCleanupManager
export function setupWindowCleanup(window: BrowserWindow): void
export function setupAppCleanup(): void
```

**Tracked resource helpers:**
```typescript
export function createTrackedInterval(
  callback: () => void,
  delay: number,
  name?: string
): NodeJS.Timeout

export function createTrackedTimeout(
  callback: () => void,
  delay: number,
  name?: string
): NodeJS.Timeout

export function addTrackedListener(
  target: EventTarget,
  event: string,
  handler: EventHandler,
  name?: string
): void

export function registerCleanupTask(
  name: string,
  cleanup: () => void | Promise<void>,
  critical?: boolean
): void
```

#### How It Works

**Resource tracking:**
- Maintains sets/arrays of intervals, timeouts, and event listeners
- Each resource is tracked when created
- All tracked resources are cleaned up together

**Cleanup phases:**
1. **Intervals**: Clear all tracked intervals
2. **Timeouts**: Clear all tracked timeouts
3. **Event listeners**: Remove all tracked listeners
4. **Registered tasks**: Execute custom cleanup functions
5. **Global resources** (optional): IPC handlers, rate limiter, caches, etc.

**Cleanup triggers:**
- **Window close**: Cleanup window-specific resources
- **App quit**: Cleanup all resources including global ones
- **Manual**: Via `cleanup()` method

**Concurrent cleanup protection:**
- Prevents multiple concurrent cleanup operations
- Returns existing promise if cleanup is already in progress

#### Usage Examples

**Setting up window cleanup:**
```typescript
import { setupWindowCleanup } from '../utils/resourceCleanup';

const mainWindow = new BrowserWindow({ ... });
setupWindowCleanup(mainWindow);

// Cleanup happens automatically when window closes
```

**Setting up app-level cleanup:**
```typescript
import { setupAppCleanup } from '../utils/resourceCleanup';

app.whenReady().then(() => {
  setupAppCleanup();
  // Cleanup happens automatically on app quit
});
```

**Tracking intervals:**
```typescript
import { createTrackedInterval } from '../utils/resourceCleanup';

// Instead of setInterval:
const interval = createTrackedInterval(
  () => console.log('Polling...'),
  1000,
  'Polling interval'
);

// Automatically cleaned up on window close or app quit
```

**Tracking event listeners:**
```typescript
import { addTrackedListener } from '../utils/resourceCleanup';

// Instead of window.on:
addTrackedListener(
  mainWindow,
  'resize',
  handleResize,
  'Window resize handler'
);

// Automatically removed on cleanup
```

**Registering custom cleanup tasks:**
```typescript
import { registerCleanupTask } from '../utils/resourceCleanup';

registerCleanupTask(
  'Close database connection',
  async () => {
    await database.close();
  },
  true // critical task
);
```

**Using the manager directly:**
```typescript
import { getCleanupManager } from '../utils/resourceCleanup';

const manager = getCleanupManager();

// Register multiple tasks
manager.registerTasks([
  {
    name: 'Task 1',
    cleanup: () => console.log('Cleanup 1'),
  },
  {
    name: 'Task 2',
    cleanup: async () => {
      await asyncCleanup();
    },
    critical: true,
  },
]);

// Manual cleanup
await manager.cleanup({
  includeGlobalResources: true,
  logDetails: true,
});
```

#### What Gets Cleaned Up

**Window-specific resources:**
- IPC listeners (all channels)
- Web contents session cache
- Web contents storage data (cookies, localStorage, sessionStorage)
- Tracked intervals/timeouts
- Tracked event listeners
- Custom cleanup tasks

**Global resources** (when `includeGlobalResources: true`):
- IPC handlers (via `cleanupGlobalHandlers()`)
- Rate limiter (via `destroyRateLimiter()`)
- Deduplicator (via `destroyDeduplicator()`)
- Icon cache (via `getIconCache().clear()`)
- Config cache (via `clearConfigCache()`)

#### Best Practices

**Use tracked resource helpers:**
```typescript
// Good:
createTrackedInterval(callback, 1000, 'My interval');

// Avoid:
setInterval(callback, 1000); // Won't be cleaned up
```

**Register cleanup for external resources:**
```typescript
registerCleanupTask('Database', async () => {
  await db.close();
}, true);
```

**Mark critical tasks:**
```typescript
{
  name: 'Save user data',
  cleanup: async () => await saveData(),
  critical: true, // Errors logged as errors, not debug
}
```

**Setup early:**
```typescript
app.whenReady().then(() => {
  const window = createWindow();
  setupWindowCleanup(window); // Setup immediately after window creation
  setupAppCleanup();          // Setup once per app
});
```

#### Performance Characteristics

**Cleanup time:**
- Synchronous cleanup: < 10ms for typical resources
- Async cleanup: Depends on task complexity
- All cleanup tasks run in parallel

**Memory leak prevention:**
- Intervals/timeouts: Cleared to prevent background execution
- Event listeners: Removed to prevent memory retention
- IPC handlers: Removed to prevent orphaned listeners
- Caches: Cleared to release memory

**Graceful shutdown:**
- `before-quit` event prevented until cleanup completes
- All async tasks awaited
- Errors logged but don't block shutdown
- `app.exit()` called after cleanup

---

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
