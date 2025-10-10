# src/preload/

This directory contains preload scripts that bridge the main process and renderer process. Preload scripts run in the renderer context but have access to Node.js APIs (specifically `ipcRenderer` for communication).

## Overview

**Purpose**: Preload scripts inject functionality into the Google Chat web page to:
- Extract information from the DOM (unread count, favicon)
- Monitor WebAuthn/passkey authentication failures
- Respond to keyboard shortcuts from main process
- Handle online/offline state changes

**Security context**: These scripts run with `contextIsolation: true` (enabled) using Electron's `contextBridge` API to securely expose a limited API (`window.gchat`) to the renderer process. This provides strong security by preventing the renderer from accessing Node.js APIs directly.

**Loading**: All scripts are imported via `index.ts` and bundled. The bundle is loaded by the BrowserWindow via the `preload` option in `../main/windowWrapper.ts`.

## Preload Scripts

### index.ts
Entry point that creates the secure contextBridge API and imports feature-specific preload scripts.

**Context Bridge API:**
```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { GChatBridgeAPI } from '../shared/types.js';

// Expose secure API to renderer via window.gchat
const api: GChatBridgeAPI = {
  sendUnreadCount: (count: number) => { /* with validation */ },
  sendFaviconChanged: (href: string) => { /* with validation */ },
  sendNotificationClicked: () => { /* ... */ },
  checkIfOnline: () => { /* ... */ },
  reportPasskeyFailure: (errorType: string) => { /* with validation */ },
  onSearchShortcut: (callback) => { /* returns cleanup function */ },
  onOnlineStatus: (callback) => { /* returns cleanup function */ },
};

contextBridge.exposeInMainWorld('gchat', api);
```

**Then imports feature scripts:**
```typescript
import './faviconChanged.js';
import './offline.js';
import './passkeyMonitor.js';
import './searchShortcut.js';
import './unreadCount.js';
// Note: overrideNotifications loaded separately (requires special handling)
```

All API methods include input validation using shared validators. Event listeners return cleanup functions to prevent memory leaks.

### faviconChanged.ts
Monitors changes to the page favicon, which indicates new messages in Google Chat.

**Implementation:**
- ✅ **Performance Optimized**: Uses MutationObserver (no polling overhead)
- Observes `<head>` element for childList and attribute changes
- Monitors favicon `<link>` elements (rel="icon" or rel="shortcut icon")
- Compares href with previous value to detect changes
- Sends `faviconChanged` IPC message to main process with favicon URL
- Automatic cleanup on page unload to prevent memory leaks

**Why this works:**
- Google Chat changes favicon when new messages arrive
- Different favicons indicate different app states (active, unread, etc.)
- MutationObserver provides reactive updates without polling overhead

**IPC channel:**
- `window.gchat.sendFaviconChanged(href)`

### offline.ts
Handles online/offline state transitions.

**Two-way communication:**
1. **From offline.html page**: Listens for global `app:checkIfOnline` event
   - Forwards to main process via `checkIfOnline` IPC
2. **From main process**: Listens for `onlineStatus` IPC message
   - If online: Redirects to Google Chat URL
   - If offline: Reloads offline page

**IPC channels:**
- Send: `ipcRenderer.send('checkIfOnline')`
- Receive: `ipcRenderer.on('onlineStatus', callback)`

**Flow:**
1. Internet disconnects → main process detects → loads `src/offline/index.html`
2. Offline page has "Check Connection" button → triggers `app:checkIfOnline` event
3. This script sends IPC to main → main checks connectivity
4. Main sends `onlineStatus` back → script redirects or reloads based on result

### passkeyMonitor.ts
Monitors WebAuthn/passkey authentication failures and reports them to the main process.

**Implementation:**
- Wraps `navigator.credentials.create()` and `navigator.credentials.get()` methods
- Detects passkey-related errors (NotAllowedError, NotSupportedError, SecurityError, etc.)
- Reports failure to main process via `window.gchat.reportPasskeyFailure()`
- Only reports once per session to avoid spam

**Error types monitored:**
- `NotAllowedError` - User denied permission or operation not allowed
- `NotSupportedError` - Passkeys/WebAuthn not supported
- `SecurityError` - Security policy violation
- `AbortError` - Operation was aborted
- `InvalidStateError` - Invalid state for operation

**Why needed:**
- macOS requires specific system permissions for Touch ID/passkeys
- Users need guidance when authentication fails due to missing permissions
- Main process can show helpful dialog with instructions

**IPC channel:**
- Send: `window.gchat.reportPasskeyFailure(errorType)`
- Main handler: `passkeySupport.ts` feature

**Triggered by:**
- Google Chat attempting passkey authentication
- WebAuthn API calls failing due to permissions

### searchShortcut.ts
Focuses the Google Chat search input when search shortcut is triggered.

**Implementation:**
- Listens for `searchShortcut` IPC message from main process
- Queries DOM for search input: `input[name="q"]`
- Checks if element is visible using offset/height detection
- Focuses the input if found and visible

**IPC channel:**
- Receive: `ipcRenderer.on('searchShortcut', callback)`

**Triggered by:**
- User presses Cmd/Ctrl+F
- Menu item "View > Search" in `../main/features/appMenu.ts`

### overrideNotifications.ts
Intercepts web notifications and adds click handling.

**Why needed:**
- Google Chat uses Web Notifications API
- We want to bring the app to focus when notification clicked
- Notification click events trigger `window.gchat.sendNotificationClicked()`

**Implementation:**
- **Note**: This script is loaded via a separate preload entry (not imported in index.ts)
- Uses `webPreferences.additionalPreloadScripts` to load with `contextIsolation: false`
- Saves reference to native `window.Notification` constructor
- Creates wrapper function that adds click event listener
- Sends notification clicks via the exposed `window.gchat` API

**Security consideration:**
- Loaded with `contextIsolation: false` only for this specific functionality
- Other preload scripts maintain `contextIsolation: true` for security
- Minimal attack surface (only overrides Notification API)

**IPC channel:**
- Uses: `window.gchat.sendNotificationClicked()` (exposed by main preload)

### unreadCount.ts
Extracts the unread message count from Google Chat DOM and sends to main process.

**Implementation:**
- ✅ **Performance Optimized**: Uses MutationObserver (no polling overhead)
- Observes `document.body` for childList, subtree, and characterData changes
- Queries DOM for specific data-tooltip selectors ("Chat" and "Spaces" groups)
- Finds unread count in `span[role="heading"]` next sibling
- Sums counts from all groups
- Only sends IPC when count changes (avoids spam)
- Automatic cleanup on page unload to prevent memory leaks

**Target selectors:**
```typescript
'div[data-tooltip="Chat"][role="group"]'
'div[data-tooltip="Spaces"][role="group"]'
```

**IPC channel:**
- `window.gchat.sendUnreadCount(count)`

**Used by:**
- `../main/features/badgeIcon.ts` to update dock/taskbar badge

**Note:** DOM selectors are specific to Google Chat's current structure. If Google updates their HTML, these selectors may need adjustment.

## IPC Communication Pattern

### Sending to Main Process
```typescript
import { ipcRenderer } from 'electron';

// Send event with data
ipcRenderer.send('channelName', data);
```

### Receiving from Main Process
```typescript
import { ipcRenderer } from 'electron';

// Listen for event
ipcRenderer.on('channelName', (event, data) => {
  // Handle event
});
```

### Main Process Handlers
Corresponding handlers in `../main/features/` files:
```typescript
import { ipcMain } from 'electron';

ipcMain.on('channelName', (event, data) => {
  // Handle event
  event.reply('responseChannel', result); // Optional reply
});
```

## Adding New Preload Scripts

1. Create new `.ts` file in this directory
2. Import and use `ipcRenderer` for communication
3. Add import to `index.ts`
4. Add corresponding handler in main process (if sending messages)

Example:
```typescript
// newFeature.ts
import { ipcRenderer } from 'electron';

window.addEventListener('DOMContentLoaded', () => {
  // Your DOM manipulation or monitoring logic
  ipcRenderer.send('newFeatureEvent', data);
});

// Listen for messages from main
ipcRenderer.on('triggerNewFeature', () => {
  // Respond to main process command
});
```

## Security Considerations

- **Context Isolation**: ✅ **Enabled** (`contextIsolation: true` in windowWrapper.ts)
  - Uses `contextBridge` API to expose only necessary functionality via `window.gchat`
  - Renderer process cannot directly access Node.js or Electron APIs
  - Strong security boundary between main and renderer processes
  - Exception: `overrideNotifications.ts` uses `contextIsolation: false` (loaded separately with minimal scope)
- **Node Integration**: ✅ Disabled in renderer (security best practice)
- **Sandbox Mode**: ✅ Enabled - OS-level process isolation
- **Limited API**: Only specific methods exposed via `contextBridge`
- **Input Validation**: All IPC messages validated before sending
- **No Remote Module**: Not used (deprecated and insecure)

## DOM Observation Pattern

**✅ Performance Optimization**: All DOM monitoring scripts use `MutationObserver` instead of polling intervals, providing reactive updates with minimal overhead.

**Scripts using MutationObserver:**
- **faviconChanged.ts**: Observes `<head>` for favicon changes
- **unreadCount.ts**: Observes `document.body` for unread count updates

**Why MutationObserver:**
- ✅ **Zero polling overhead**: Reactive updates only when DOM changes
- ✅ **Better performance**: No unnecessary CPU usage during idle periods
- ✅ **Immediate response**: Detects changes instantly, no 1-second delay
- ✅ **Memory efficient**: Automatic cleanup prevents leaks

**Pattern:**
```typescript
let observer: MutationObserver | null = null;

const initObserver = () => {
  // Clean up existing observer
  if (observer) {
    observer.disconnect();
  }

  // Create observer
  observer = new MutationObserver((mutations) => {
    // Handle DOM changes reactively
    processChanges();
  });

  // Observe target element
  observer.observe(targetElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
};

// Cleanup to prevent memory leaks
const cleanup = () => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
};

window.addEventListener('DOMContentLoaded', initObserver);
window.addEventListener('beforeunload', cleanup);
```

**Performance Impact:**
- Eliminates ~20ms polling overhead per second
- Reduces idle CPU usage to near zero
- Faster reaction time to DOM changes (instant vs. up to 1s delay)
