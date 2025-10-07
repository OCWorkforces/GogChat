# src/main/

This directory contains the main Electron process code that runs in the Node.js environment with full system access.

## Overview

The main process is responsible for:
- Creating and managing BrowserWindow instances
- Application lifecycle management
- Native OS integrations (tray, menu, notifications)
- Persisting application state and configuration
- Initializing all application features

## Key Files

### index.ts
The application entry point. Execution flow:
1. **Early initialization**: `reportExceptions()` sets up unhandled error reporting
2. **Single instance enforcement**: `enforceSingleInstance()` ensures only one app runs
3. **App ready event**: When Electron is ready, features are initialized in this order:
   - User agent override
   - Window creation via `windowWrapper()`
   - Offline handlers setup
   - Tray icon creation
   - First launch logging
   - Menu setup
   - Single instance restoration handler
   - Window state persistence
   - Auto-launch configuration
   - Update notifier
   - Context menu
   - Badge icons
   - Close to tray behavior
   - External links handling
   - Notification handling
   - macOS app location enforcement

**When adding new features**: Import the feature module and call it in the `app.whenReady()` chain. Pass `mainWindow` and/or `trayIcon` as needed.

### windowWrapper.ts
Factory function that creates and configures the main BrowserWindow. Key configurations:
- **Security settings**: Context isolation off (legacy), node integration off, sandbox off, Auxclick disabled
- **Preload script**: Loads `lib/preload/index.js` to bridge main and renderer
- **Store integration**: Reads settings from electron-store (menu bar visibility, start hidden, spell checker)
- **Window properties**: Min size 480x570, centered, custom icon per platform
- **Show timing**: Window only shows on `ready-to-show` unless `startHidden` is true

**To modify window behavior**: Edit this file. The window is created once and reused throughout the app lifetime.

### config.ts
Typed configuration store using `electron-store` with JSON schema validation.

**Current schema structure**:
```
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
1. Update `StoreType` interface with new property
2. Add schema definition with type and default value
3. Access via `store.get('section.key')` or `store.set('section.key', value)`

The store automatically persists to disk and validates against the schema.

## features/
See `features/CLAUDE.md` for detailed documentation of all feature modules.

## Common Patterns

### Adding a New Feature
1. Create new file in `features/` (e.g., `myFeature.ts`)
2. Export default function accepting required parameters (typically `mainWindow: BrowserWindow`)
3. Import in `index.ts` and call in `app.whenReady()` chain
4. If feature needs configuration, add to `config.ts` schema

### Accessing Configuration
```typescript
import store from './config';

const value = store.get('app.autoCheckForUpdates');
store.set('app.startHidden', true);
```

### IPC Communication with Renderer
Use `ipcMain` to receive messages from renderer (sent via preload scripts):
```typescript
import { ipcMain } from 'electron';

ipcMain.on('channel-name', (event, data) => {
  // Handle message
  event.reply('response-channel', result);
});
```

### Window Lifecycle
- The `mainWindow` variable is global and maintained throughout app lifetime
- On close-to-tray, window is hidden but not destroyed
- On activate (macOS), window is shown again
- On `window-all-closed`, app exits immediately
