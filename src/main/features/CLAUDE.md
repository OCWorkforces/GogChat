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
Manages the unread message count badge on the app icon and tray.

**Platform differences:**
- **macOS**: Uses `app.setBadgeCount()` for dock icon
- **Windows**: Uses `setOverlayIcon()` to draw count on taskbar (renders canvas with count)
- **Linux**: Limited support, attempts to use `app.setBadgeCount()`

**Data source:**
- Receives unread count from preload script via IPC (`totalUnreadCount` channel)
- Updates both app badge and tray icon tooltip

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
Intercepts clicks on external links and opens them in the default browser instead of in-app.

**Implementation:**
- Listens to `will-navigate` and `new-window` events
- Checks if URL is external (not Google Chat domain)
- Opens in default browser via `shell.openExternal()`
- Includes a toggleable guard (can be disabled via troubleshooting menu)

**Special handling:**
- Allows navigation within Google Chat domains
- Blocks popup windows (security measure)

### firstLaunch.ts
Logs the first time the application is launched.

**Implementation:**
- Uses electron-store to check if `firstLaunch` key exists
- If not set, logs to electron-log and sets flag
- Useful for analytics or first-run setup logic

### handleNotification.ts
Handles web notifications from Google Chat and converts them to native OS notifications.

**Implementation:**
- Receives notification data from preload script via IPC
- Creates native notification using Electron's Notification API
- Clicking notification brings window to focus and navigates to relevant chat

### inOnline.ts
Monitors internet connectivity and switches to offline page when disconnected.

**Two main functions:**
- `setupOfflineHandlers()`: Sets up event listeners for online/offline events
- `checkForInternet()`: Actively checks connectivity using `is-online` package

**Behavior:**
- When offline: Loads `src/offline/index.html`
- When back online: Reloads Google Chat URL
- Throttles checks to avoid excessive polling

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
Persists window position, size, and maximized state between app launches.

**Implementation:**
- On window move/resize: Debounces and saves bounds to store
- On window maximize/unmaximize: Saves state to store
- On app start: Restores bounds and maximized state from store
- Uses throttle-debounce to avoid excessive writes

**Saved data:**
```typescript
window: {
  bounds: { x, y, width, height }
  isMaximized: boolean
}
```

## Adding a New Feature

1. Create `myFeature.ts` in this directory
2. Export default function:
   ```typescript
   import { BrowserWindow } from 'electron';

   export default (window: BrowserWindow) => {
     // Feature implementation
   }
   ```
3. Import and initialize in `../index.ts`:
   ```typescript
   import myFeature from './features/myFeature';

   app.whenReady().then(() => {
     // ...
     myFeature(mainWindow);
   });
   ```
4. If feature needs configuration, add to `../config.ts` schema
5. If feature needs IPC, add handlers here and senders in `../../preload/`
