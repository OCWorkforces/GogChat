# src/main/

This directory contains the main Electron process code that runs in the Node.js environment with full system access.

## Overview

The main process is responsible for:
- Creating and managing BrowserWindow instances with security configurations
- Application lifecycle management
- Native OS integrations (tray, menu, notifications)
- Persisting encrypted application state and configuration
- Initializing all application features (security-critical features first)
- Input validation and rate limiting for all IPC communications
- Certificate pinning and SSL validation

## Key Files

### index.ts
The application entry point. Execution flow:
1. **Security initialization (before app ready)**:
   - `setupCertificatePinning()` - Initialized BEFORE any network requests
   - `reportExceptions()` - Sets up unhandled error reporting
2. **Single instance enforcement**: `enforceSingleInstance()` ensures only one app runs
3. **App ready event - Critical path** (blocks until complete):
   - User agent override
   - Window creation via `windowWrapper()` with security settings
   - Offline handlers setup
   - Internet connectivity check
   - Tray icon creation
   - Menu setup
   - Single instance restoration handler
   - Window state persistence
   - External links handling (with URL sanitization)
   - Notification handling (with rate limiting)
   - Badge icons (with caching and rate limiting)
   - Close to tray behavior
4. **Deferred features** (loaded asynchronously via `setImmediate`):
   - Auto-launch configuration
   - Update notifier
   - Context menu
   - First launch logging
   - macOS app location enforcement

**Performance optimization**: Non-critical features are deferred to improve startup time. Critical security features load first.

**When adding new features**:
- Security-critical features should be initialized early (before or during app ready)
- UI-critical features go in the main app ready flow
- Non-critical features should be deferred using `setImmediate`
- Always pass `mainWindow` and/or `trayIcon` as needed
- Add proper error handling with try-catch

### windowWrapper.ts
Factory function that creates and configures the main BrowserWindow with strict security settings:

**Security settings** (webPreferences):
- **Context isolation**: ✅ Enabled - Renderer cannot access Node.js APIs directly
- **Sandbox**: ✅ Enabled - OS-level process isolation
- **Node integration**: ✅ Disabled - Renderer cannot require Node.js modules
- **Web security**: ✅ Enabled - Enforces same-origin policy
- **Allow insecure content**: ✅ Disabled - Blocks mixed content
- **Auxclick**: ✅ Disabled - Prevents middle-click exploits

**Content Security Policy**:
- Enforced via `webRequest.onHeadersReceived` hook
- Strict policy with Google domain whitelist
- Inline scripts/eval allowed only where required by Google Chat

**Permission handler**:
- Only allows: notifications, media, mediaKeySystem, geolocation
- All other permissions denied by default
- All requests logged for security audit

**Store integration**: Reads settings from encrypted electron-store (menu bar visibility, start hidden, spell checker)

**Window properties**: Min size 480x570, centered, custom icon per platform

**Show timing**: Window shows on `ready-to-show` unless `startHidden` is true

**To modify window behavior**: Edit this file. The window is created once and reused throughout the app lifetime.

### config.ts
Encrypted configuration store using `electron-store` with AES-256-GCM encryption and JSON schema validation.

**Security features**:
- All data encrypted at rest using AES-256-GCM
- Encryption key derived from app-specific data (app name + user data path)
- Protects user preferences and window state from unauthorized access

**Current schema structure**:
```typescript
window: {
  bounds: { x, y, width, height }
  isMaximized: boolean
}
app: {
  autoCheckForUpdates: boolean
  autoLaunchAtLogin: boolean
  startHidden: boolean
  hideMenuBar: boolean
  disableSpellChecker: boolean
}
```

**To add new settings**:
1. Update `StoreType` interface in `../../shared/types.ts`
2. Add schema definition in this file with type and default value
3. Access via `store.get('section.key')` or `store.set('section.key', value)`

The store automatically encrypts, persists to disk, and validates against the schema.

## features/
See `features/CLAUDE.md` for detailed documentation of all feature modules.

## Common Patterns

### Adding a New Feature
1. Create new file in `features/` (e.g., `myFeature.ts`)
2. Export default function accepting required parameters (typically `mainWindow: BrowserWindow`)
3. Import in `index.ts` and call in appropriate initialization phase:
   - Security-critical: Before or during app ready
   - UI-critical: In app ready chain
   - Non-critical: In `setImmediate` callback
4. If feature needs configuration, update `StoreType` in `../../shared/types.ts` and schema in `config.ts`
5. Add proper error handling with try-catch blocks

### Accessing Configuration
```typescript
import store from './config';

const value = store.get('app.autoCheckForUpdates');
store.set('app.startHidden', true);
```

### IPC Communication with Renderer (SECURE PATTERN)
Always validate input and apply rate limiting:
```typescript
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { validateUnreadCount } from '../../shared/validators';
import { rateLimiter } from './utils/rateLimiter';
import log from 'electron-log';

ipcMain.on(IPC_CHANNELS.UNREAD_COUNT, (event, count) => {
  try {
    // Rate limiting
    if (!rateLimiter.isAllowed(IPC_CHANNELS.UNREAD_COUNT)) {
      log.warn('[Feature] Rate limited');
      return;
    }

    // Input validation
    const validatedCount = validateUnreadCount(count);

    // Handle validated data
    updateBadge(validatedCount);
  } catch (error) {
    log.error('[Feature] Validation failed:', error);
  }
});
```

**Security requirements for IPC handlers**:
1. Use constants from `../../shared/constants.ts` for channel names
2. Apply rate limiting using `rateLimiter.isAllowed()`
3. Validate all input using validators from `../../shared/validators.ts`
4. Wrap in try-catch for error handling
5. Log security events (rate limits, validation failures)

### Window Lifecycle
- The `mainWindow` variable is global and maintained throughout app lifetime
- On close-to-tray, window is hidden but not destroyed
- On activate (macOS), window is shown again
- On `window-all-closed`, app exits immediately

## utils/
Utility modules for main process:

### rateLimiter.ts
IPC rate limiting to prevent flooding and DoS attacks:
```typescript
import { rateLimiter } from './utils/rateLimiter';

if (!rateLimiter.isAllowed('channel-name', 5)) {
  // Rate limited, reject request
  return;
}
```

### logger.ts
Structured logging with scoped loggers:
```typescript
import { logger } from './utils/logger';

logger.security.error('Certificate validation failed');
logger.ipc.warn('Rate limit exceeded');
logger.feature('MyFeature').info('Feature initialized');
```
