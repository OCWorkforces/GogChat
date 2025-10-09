# src/main/features/

This directory contains modular feature implementations for the main process. Each feature is a self-contained module that exports a default function.

## Feature Pattern

All features follow this pattern:
```typescript
export default (window: BrowserWindow, ...otherParams) => {
  // Feature implementation
  // May return objects (e.g., trayIcon) or nothing
}
```

Features are initialized in `../index.ts` during `app.whenReady()`.

## Feature Modules

### aboutPanel.ts
Creates and displays a custom "About" dialog with app information. Called from the Help menu.

**Key details:**
- Uses a BrowserWindow with custom HTML content
- Modal window (blocks parent interaction)
- Displays version, homepage, and author info from package.json

### appMenu.ts
Builds the native application menu with all menu items and keyboard shortcuts.

**Menu structure:**
- **File**: Close to tray (Cmd/Ctrl+W), Relaunch, Minimize, Sign Out, Quit (Cmd/Ctrl+Q)
- **Edit**: Standard edit menu (undo, redo, cut, copy, paste, select all)
- **View**: Reload, Force reload, Search (Cmd/Ctrl+F), Copy URL, Dev tools (dev only), Fullscreen, Zoom controls
- **History**: Back (Alt+Left), Forward (Alt+Right), Home (Alt+Home)
- **Preferences**: Checkboxes for auto-updates, auto-launch, start hidden, hide menu bar, disable spell checker
- **Help**: GitHub homepage link, manual update check, troubleshooting submenu, about dialog, version display

**Preference handling:**
- All preferences read/write to electron-store (`../config.ts`)
- Changes take effect immediately (some require relaunch)
- Hide menu bar only enabled on non-macOS platforms

**Troubleshooting submenu:**
- Report issue (opens GitHub with debug info)
- Toggle external links guard
- Demo badge count (for testing)
- Show logs in file manager
- Reset and relaunch (clears store and session data)

**IPC communication:**
- Sends `searchShortcut` to renderer when Cmd/Ctrl+F pressed

### appUpdates.ts
Checks for application updates using `electron-update-notifier`.

**Behavior:**
- Only runs if `store.get('app.autoCheckForUpdates')` is true
- Checks against GitHub releases (uses package.json repository URL)
- Shows system notification if update available
- Manual check available via Help menu

### badgeIcon.ts
Manages the unread message count badge on the app icon and tray with security enhancements.

**Security features:**
- Input validation using `validateUnreadCount()` from shared validators
- Rate limiting (5 messages/second) to prevent flooding
- Error handling with try-catch blocks

**Performance optimizations:**
- Icon caching using Map<string, NativeImage> to avoid redundant file loads
- Reuses loaded icons across badge updates

**Platform differences:**
- **macOS**: Uses `app.setBadgeCount()` for dock icon
- **Windows**: Uses `setOverlayIcon()` to draw count on taskbar (renders canvas with count)
- **Linux**: Limited support, attempts to use `app.setBadgeCount()`

**Data source:**
- Receives unread count from preload script via IPC (`IPC_CHANNELS.UNREAD_COUNT`)
- Updates both app badge and tray icon tooltip

### certificatePinning.ts
Validates SSL certificates for Google domains to prevent Man-in-the-Middle (MITM) attacks.

**Security implementation:**
- Listens to `certificate-error` events from Electron
- Validates certificate issuer against trusted Google CAs:
  - Google Trust Services LLC
  - GTS Root R1, R2, R3, R4
  - GTS CA 1C3, 1D4
  - GlobalSign
- Verifies certificate validity period (not expired, not future-dated)

**Pinned domains:**
- `google.com` and all subdomains
- `mail.google.com`
- `chat.google.com`
- `accounts.google.com`
- `googleapis.com`
- `gstatic.com`
- `googleusercontent.com`

**Initialization:**
- Called early in `../index.ts` BEFORE any network requests
- Non-pinned domains are allowed through without validation

**Logging:**
- All certificate validation attempts logged
- Failed validations logged with issuer and error details

### closeToTray.ts
Prevents window from closing; hides it to tray instead.

**Implementation:**
- Intercepts `close` event on BrowserWindow
- Calls `event.preventDefault()` and `window.hide()`
- Window remains in memory, can be restored from tray

### contextMenu.ts
Enables right-click context menu with standard options (copy, paste, inspect element, etc.).

**Implementation:**
- Uses `electron-context-menu` package
- Provides default context menu for all windows
- Includes "Inspect Element" option for debugging

### externalLinks.ts
Intercepts clicks on external links and opens them in the default browser with URL sanitization.

**Security features:**
- URL validation using `validateExternalURL()` from shared validators
- Protocol whitelist enforcement (http/https only)
- Credential stripping (removes username/password from URLs)
- Dangerous pattern blocking:
  - `javascript:` URIs
  - `data:` URIs
  - `vbscript:` URIs
  - `file:` URIs
  - `about:` URIs
- Domain whitelist for Google services using `WHITELISTED_HOSTS` constant

**Implementation:**
- Listens to `will-navigate` and `new-window` events
- Checks if URL is external (not in whitelist)
- Sanitizes URL before opening
- Opens in default browser via `shell.openExternal()` in `setImmediate()`
- Includes a toggleable guard (can be disabled via troubleshooting menu)

**Special handling:**
- Allows navigation within Google Chat domains
- Blocks popup windows (security measure)
- All validation failures logged

### firstLaunch.ts
Logs the first time the application is launched.

**Implementation:**
- Uses electron-store to check if `firstLaunch` key exists
- If not set, logs to electron-log and sets flag
- Useful for analytics or first-run setup logic

### handleNotification.ts
Handles web notifications from Google Chat and converts them to native OS notifications with rate limiting.

**Security features:**
- Rate limiting (5 messages/second) to prevent notification flooding
- Error handling with try-catch blocks
- Uses IPC constants from shared module

**Implementation:**
- Receives notification data from preload script via IPC (`IPC_CHANNELS.NOTIFICATION_CLICKED`)
- Creates native notification using Electron's Notification API
- Clicking notification brings window to focus and navigates to relevant chat
- All errors logged for debugging

### inOnline.ts
Monitors internet connectivity and switches to offline page when disconnected with rate limiting.

**Security features:**
- Rate limiting (1 message/second) for online status checks
- Error handling with try-catch blocks
- Timeout parameter with proper type annotation

**Two main functions:**
- `setupOfflineHandlers()`: Sets up event listeners for online/offline events
- `checkForInternet()`: Actively checks connectivity using `is-online` package

**Behavior:**
- When offline: Loads `src/offline/index.html`
- When back online: Reloads Google Chat URL
- Throttles checks to avoid excessive polling
- Uses timing constants from shared module (CONNECTIVITY_CHECK_FAST/SLOW)
- All errors logged for debugging

### openAtLogin.ts
Configures the app to launch automatically on system startup.

**Implementation:**
- Uses `auto-launch` package (cross-platform)
- Exports `autoLaunch()` function that creates AutoLaunch instance
- Default feature initializer checks `store.get('app.autoLaunchAtLogin')`
- Can be toggled via Preferences menu

**Launch behavior:**
- On auto-launch, app starts with `--hidden` flag if `startHidden` is true
- The flag is filtered out during manual relaunch to ensure window shows

### reportExceptions.ts
Sets up global error handling for unhandled exceptions and promise rejections.

**Implementation:**
- Uses `electron-unhandled` package
- Logs all errors via electron-log
- Shows error dialog to user (configurable)
- Initialized early in `../index.ts` to catch startup errors

### singleInstance.ts
Ensures only one instance of the app runs at a time.

**Two exported functions:**
- `enforceSingleInstance()`: Returns false if another instance is already running
- `restoreFirstInstance()`: Callback to restore window when second instance attempts to launch

**Behavior:**
- If second instance launched, first instance window is restored and focused
- Second instance exits immediately
- Uses Electron's `app.requestSingleInstanceLock()`

### trayIcon.ts
Creates the system tray icon with context menu.

**Icon selection:**
- macOS: 16px icon (Retina displays handle scaling)
- Windows/Linux: 32px icon

**Click behavior:**
- **Windows**: Single click toggles window visibility
- **macOS**: Click handled by context menu only (OS convention)

**Context menu:**
- Toggle: Shows/hides window
- Quit: Forces app exit

**Platform-specific toggle logic:**
- Windows: Hides if visible OR focused
- macOS: Hides only if visible AND focused (stricter condition)

### userAgent.ts
Overrides the default Electron User-Agent string.

**Purpose:**
- Some web apps block Electron user agents
- Custom UA string makes the app appear as a regular browser
- Necessary for full Google Chat functionality

**Implementation:**
- Sets a Chrome-like User-Agent via `app.userAgentFallback`
- Must be called before window creation

### windowState.ts
Persists window position, size, and maximized state between app launches with performance optimizations.

**Performance optimizations:**
- Debounce on close event (100ms) to avoid immediate writes
- Throttle on resize/move events (uses `TIMING.WINDOW_STATE_SAVE` constant)
- Checks `isDestroyed()` before accessing window to prevent errors
- Reduces disk I/O operations

**Error handling:**
- All window operations wrapped in try-catch blocks
- Errors logged for debugging
- Graceful degradation if state restoration fails

**Implementation:**
- On window move/resize: Throttles and saves bounds to encrypted store
- On window maximize/unmaximize: Saves state immediately
- On window close: Debounced save to avoid blocking
- On app start: Restores bounds and maximized state from store
- Uses throttle-debounce package for rate control

**Saved data:**
```typescript
window: {
  bounds: { x, y, width, height }
  isMaximized: boolean
}
```

## Feature Management System

### featureManager.ts
Centralized feature lifecycle manager for organizing feature initialization, dependencies, and cleanup.

**Purpose**: Provides structured feature management with:
- Priority-based initialization (critical features first)
- Dependency resolution (ensures features initialize in correct order)
- State tracking (initialized, failed, disabled)
- Performance monitoring (tracks initialization time)
- Cleanup coordination (reverse-order cleanup)

#### Key Exports

**FeatureManager class:**
```typescript
export class FeatureManager {
  register(config: FeatureConfig): void
  registerAll(configs: FeatureConfig[]): void
  setContext(context: FeatureContext): void
  async initialize(priority?: FeaturePriority): Promise<void>
  async initializeCritical(): Promise<void>
  initializeDeferred(): void
  async enableFeature(name: string): Promise<void>
  async disableFeature(name: string): Promise<void>
  getFeatureState(name: string): FeatureState | undefined
  isInitialized(name: string): boolean
  getStatus(): Record<string, {...}>
  getStatistics(): { total, initialized, failed, disabled, totalInitTime }
  async cleanup(): Promise<void>
  reset(): void
}

export function getFeatureManager(): FeatureManager
```

**Feature priority levels:**
```typescript
export enum FeaturePriority {
  CRITICAL = 0,   // Security and core functionality (blocks app ready)
  HIGH = 1,       // User-facing critical features (blocks app ready)
  MEDIUM = 2,     // Standard features (blocks app ready)
  LOW = 3,        // Nice-to-have features (blocks app ready)
  DEFERRED = 4,   // Loaded asynchronously after app ready
}
```

**Feature states:**
```typescript
export enum FeatureState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  FAILED = 'failed',
  DISABLED = 'disabled',
}
```

**Feature configuration:**
```typescript
export interface FeatureConfig {
  name: string;
  description?: string;
  priority: FeaturePriority;
  enabled?: boolean;
  dependencies?: string[];  // Other feature names
  initialize: (context: FeatureContext) => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
  onError?: (error: Error) => void;
}

export interface FeatureContext {
  mainWindow: BrowserWindow | null;
  trayIcon: Tray | null;
  isFirstLaunch?: boolean;
  isDevelopment?: boolean;
}
```

**Helper functions:**
```typescript
export function createFeature(
  name: string,
  priority: FeaturePriority,
  initialize: (context: FeatureContext) => Promise<void> | void,
  options?: {...}
): FeatureConfig

export function setupFeatureLifecycle(manager?: FeatureManager): void
```

#### Usage Examples

**Basic setup:**
```typescript
import { getFeatureManager, FeaturePriority, createFeature } from './features/featureManager';

const manager = getFeatureManager();

// Register features
manager.registerAll([
  createFeature('certificate-pinning', FeaturePriority.CRITICAL, async (ctx) => {
    await setupCertificatePinning();
  }),

  createFeature('tray-icon', FeaturePriority.HIGH, (ctx) => {
    ctx.trayIcon = createTrayIcon();
  }),

  createFeature('auto-updates', FeaturePriority.DEFERRED, async (ctx) => {
    await checkForUpdates();
  }, {
    description: 'Check for application updates',
    dependencies: ['tray-icon'],  // Requires tray icon
    cleanup: async () => {
      await cancelUpdateCheck();
    },
  }),
]);

// Set context
manager.setContext({
  mainWindow: window,
  trayIcon: null,
  isFirstLaunch: true,
  isDevelopment: !app.isPackaged,
});

// Initialize critical features (blocking)
await manager.initializeCritical();

// Initialize deferred features (non-blocking)
manager.initializeDeferred();

// Setup lifecycle hooks
setupFeatureLifecycle(manager);
```

**Priority-based initialization:**
```typescript
// Initialize only critical features (security, core)
await manager.initialize(FeaturePriority.CRITICAL);

// Initialize all features up to a priority level
for (let priority = FeaturePriority.CRITICAL; priority <= FeaturePriority.MEDIUM; priority++) {
  await manager.initialize(priority);
}
```

**Feature with dependencies:**
```typescript
manager.register({
  name: 'badge-icon',
  priority: FeaturePriority.HIGH,
  dependencies: ['tray-icon'],  // Requires tray icon to be initialized first
  initialize: async (ctx) => {
    if (ctx.trayIcon) {
      setupBadgeIcon(ctx.mainWindow, ctx.trayIcon);
    }
  },
});
```

**Monitoring feature status:**
```typescript
// Check individual feature
if (manager.isInitialized('certificate-pinning')) {
  console.log('Certificate pinning is active');
}

// Get all feature states
const status = manager.getStatus();
console.log(status);
// {
//   'certificate-pinning': { state: 'initialized', priority: 'CRITICAL', initTime: 15 },
//   'tray-icon': { state: 'initialized', priority: 'HIGH', initTime: 8 },
//   'auto-updates': { state: 'failed', error: 'Network error', priority: 'DEFERRED' }
// }

// Get statistics
const stats = manager.getStatistics();
console.log(`${stats.initialized}/${stats.total} features initialized in ${stats.totalInitTime}ms`);
```

**Dynamic feature management:**
```typescript
// Disable a feature at runtime
await manager.disableFeature('auto-updates');

// Re-enable a feature
await manager.enableFeature('auto-updates');
```

**Custom error handling:**
```typescript
manager.register({
  name: 'analytics',
  priority: FeaturePriority.LOW,
  initialize: async (ctx) => {
    await initAnalytics();
  },
  onError: (error) => {
    // Custom error handling
    console.error('Analytics failed, continuing without it:', error);
    // Could send to error tracking service
  },
});
```

#### Benefits

**Organized initialization:**
- Features load in priority order (critical → deferred)
- Dependencies automatically resolved
- Clear initialization sequence

**Error resilience:**
- Non-critical feature failures don't crash the app
- Failed features logged with details
- Custom error handlers for recovery

**Performance tracking:**
- Initialization time measured per feature
- Total startup time calculated
- Slow features identified

**Easy testing:**
- Enable/disable features dynamically
- Mock context for unit tests
- Reset manager between tests

**Maintainability:**
- Centralized feature registry
- Self-documenting dependencies
- Consistent initialization pattern

#### Migration Guide

**Before (manual initialization):**
```typescript
app.whenReady().then(() => {
  try {
    setupCertificatePinning();
    const tray = createTrayIcon();
    setupBadgeIcon(window, tray);

    setImmediate(() => {
      checkForUpdates();
      setupContextMenu();
    });
  } catch (error) {
    console.error('Failed to initialize:', error);
  }
});
```

**After (using FeatureManager):**
```typescript
import { getFeatureManager, FeaturePriority, createFeature, setupFeatureLifecycle } from './features/featureManager';

const manager = getFeatureManager();

manager.registerAll([
  createFeature('certificate-pinning', FeaturePriority.CRITICAL, () => setupCertificatePinning()),
  createFeature('tray-icon', FeaturePriority.HIGH, (ctx) => { ctx.trayIcon = createTrayIcon(); }),
  createFeature('badge-icon', FeaturePriority.HIGH, (ctx) => setupBadgeIcon(ctx.mainWindow, ctx.trayIcon), {
    dependencies: ['tray-icon'],
  }),
  createFeature('auto-updates', FeaturePriority.DEFERRED, () => checkForUpdates()),
  createFeature('context-menu', FeaturePriority.DEFERRED, () => setupContextMenu()),
]);

app.whenReady().then(async () => {
  manager.setContext({ mainWindow: window, trayIcon: null });

  await manager.initializeCritical();
  manager.initializeDeferred();

  setupFeatureLifecycle(manager);
});
```

#### Best Practices

**Assign correct priorities:**
- **CRITICAL**: Certificate pinning, security features, core IPC handlers
- **HIGH**: Tray icon, menu, window state, user-facing features
- **MEDIUM**: Badge icons, notifications, external links
- **LOW**: Context menu, spell checker, keyboard shortcuts
- **DEFERRED**: Auto-updates, first launch logging, analytics

**Declare dependencies:**
```typescript
// Good: Explicit dependency
createFeature('badge-icon', FeaturePriority.HIGH, (ctx) => {
  setupBadgeIcon(ctx.trayIcon);
}, {
  dependencies: ['tray-icon'],  // Wait for tray icon
});

// Bad: Hidden dependency (might fail if tray not ready)
createFeature('badge-icon', FeaturePriority.HIGH, (ctx) => {
  setupBadgeIcon(ctx.trayIcon);  // ctx.trayIcon might be null!
});
```

**Provide cleanup handlers:**
```typescript
createFeature('polling-service', FeaturePriority.MEDIUM, () => {
  const interval = setInterval(poll, 1000);
}, {
  cleanup: () => {
    clearInterval(interval);  // Cleanup on app quit
  },
});
```

**Use context for shared state:**
```typescript
// Share tray icon via context
createFeature('tray-icon', FeaturePriority.HIGH, (ctx) => {
  ctx.trayIcon = createTrayIcon();  // Store in context
});

createFeature('badge-icon', FeaturePriority.HIGH, (ctx) => {
  if (ctx.trayIcon) {  // Access from context
    setupBadgeIcon(ctx.trayIcon);
  }
}, {
  dependencies: ['tray-icon'],
});
```

**Handle errors gracefully:**
```typescript
createFeature('optional-analytics', FeaturePriority.DEFERRED, async () => {
  await initAnalytics();
}, {
  onError: (error) => {
    // Log but don't block app
    console.warn('Analytics unavailable:', error.message);
  },
});
```

#### Integration with Existing Code

The feature manager can be adopted incrementally:

1. **Start with critical features**: Migrate security features first
2. **Add high-priority features**: Window, tray, menu
3. **Migrate deferred features**: Updates, analytics
4. **Remove manual initialization**: Delete old app.whenReady() code
5. **Add lifecycle hooks**: Use setupFeatureLifecycle()

**Coexistence pattern:**
```typescript
// Old features (still manual)
app.whenReady().then(() => {
  setupLegacyFeature();

  // New features (using manager)
  const manager = getFeatureManager();
  manager.register(...);
  manager.setContext(...);
  await manager.initialize();
});
```

---

## Adding a New Feature

1. Create `myFeature.ts` in this directory
2. Export default function with error handling:
   ```typescript
   import { BrowserWindow } from 'electron';
   import { ipcMain } from 'electron';
   import log from 'electron-log';
   import { IPC_CHANNELS } from '../../shared/constants';
   import { validateInput } from '../../shared/validators';
   import { rateLimiter } from '../utils/rateLimiter';

   export default (window: BrowserWindow) => {
     try {
       // Feature implementation

       // If using IPC, follow secure pattern:
       ipcMain.on(IPC_CHANNELS.MY_CHANNEL, (event, data) => {
         try {
           // Rate limiting
           if (!rateLimiter.isAllowed(IPC_CHANNELS.MY_CHANNEL)) {
             log.warn('[MyFeature] Rate limited');
             return;
           }

           // Input validation
           const validated = validateInput(data);

           // Handle validated data
           handleData(validated);
         } catch (error) {
           log.error('[MyFeature] Failed:', error);
         }
       });

       log.info('[MyFeature] Initialized');
     } catch (error) {
       log.error('[MyFeature] Initialization failed:', error);
     }
   }
   ```
3. Import and initialize in `../index.ts` in the appropriate phase:
   ```typescript
   import myFeature from './features/myFeature';

   app.whenReady().then(() => {
     // Critical features
     myFeature(mainWindow);

     // Or defer non-critical features:
     setImmediate(() => {
       if (!mainWindow) return;
       myFeature(mainWindow);
     });
   });
   ```
4. If feature needs configuration:
   - Update `StoreType` in `../../shared/types.ts`
   - Add schema in `../config.ts`
5. If feature needs IPC:
   - Add channel constant to `../../shared/constants.ts`
   - Add validator to `../../shared/validators.ts` if needed
   - Add sender in `../../preload/index.ts` with validation
6. If feature needs new types:
   - Add to `../../shared/types.ts` for cross-process types

**Security checklist for new features:**
- [ ] All IPC handlers use rate limiting
- [ ] All inputs validated before use
- [ ] All errors handled with try-catch
- [ ] All operations logged appropriately
- [ ] No eval() or dangerous functions
- [ ] External URLs sanitized before opening
- [ ] File paths validated before access
