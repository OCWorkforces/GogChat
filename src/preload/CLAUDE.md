# src/preload/

This directory contains preload scripts that bridge the main process and renderer process. Preload scripts run in the renderer context but have access to Node.js APIs (specifically `ipcRenderer` for communication).

## Overview

**Purpose**: Preload scripts inject functionality into the Google Chat web page to:
- Extract information from the DOM (unread count, favicon)
- Intercept web APIs (Notification API)
- Respond to keyboard shortcuts from main process
- Handle online/offline state changes

**Security context**: These scripts run with `contextIsolation: false`, which allows them to modify `window` globals. This is necessary for overriding web APIs like `window.Notification`.

**Loading**: All scripts are imported via `index.ts` and bundled. The bundle is loaded by the BrowserWindow via the `preload` option in `../main/windowWrapper.ts`.

## Preload Scripts

### index.ts
Entry point that imports all other preload scripts:
```typescript
import './faviconChanged';
import './offline';
import './searchShortcut';
import './overrideNotifications';
import './unreadCount';
```

Scripts execute immediately on import. No explicit initialization needed.

### faviconChanged.ts
Monitors changes to the page favicon, which indicates new messages in Google Chat.

**Implementation:**
- Polls every 1 second for favicon `<link>` elements (rel="icon" or rel="shortcut icon")
- Compares href with previous value to detect changes
- Sends `faviconChanged` IPC message to main process with favicon URL

**Why this works:**
- Google Chat changes favicon when new messages arrive
- Different favicons indicate different app states (active, unread, etc.)

**IPC channel:**
- `ipcRenderer.send('faviconChanged', href)`

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
- Native Electron notification handling provides better OS integration

**Implementation:**
- Saves reference to native `window.Notification` constructor
- Creates wrapper function with same signature
- Adds click event listener that sends `notificationClicked` IPC
- Replaces `window.Notification` with wrapper (preserves `requestPermission` and `permission` property)

**Important:**
- Must use ES5 function syntax (not arrow function) for proper `this` binding
- Requires `contextIsolation: false` to override `window.Notification`
- Wrapper maintains full API compatibility with Web Notifications API

**IPC channel:**
- `ipcRenderer.send('notificationClicked')`

### unreadCount.ts
Extracts the unread message count from Google Chat DOM and sends to main process.

**Implementation:**
- Polls every 1 second after DOMContentLoaded
- Queries DOM for specific data-tooltip selectors ("Chat" and "Spaces" groups)
- Finds unread count in `span[role="heading"]` next sibling
- Sums counts from all groups
- Only sends IPC when count changes (avoids spam)

**Target selectors:**
```typescript
'div[data-tooltip="Chat"][role="group"]'
'div[data-tooltip="Spaces"][role="group"]'
```

**IPC channel:**
- `ipcRenderer.send('unreadCount', count)`

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

- **Context Isolation**: Disabled (`contextIsolation: false` in windowWrapper.ts)
  - Allows access to `window` object for overriding APIs
  - Trade-off: Slightly less secure but necessary for notification override
- **Node Integration**: Disabled in renderer (security best practice)
- **Limited API**: Only `ipcRenderer` is used from Node.js APIs
- **No Remote Module**: Not used (deprecated and insecure)

## DOM Polling Pattern

Several scripts use polling (setInterval) to monitor DOM changes:
- **faviconChanged**: 1 second interval
- **unreadCount**: 1 second interval

**Why polling instead of MutationObserver:**
- Simpler implementation
- Google Chat's DOM structure is complex and changes frequently
- 1-second polling is performant enough for these use cases
- Avoids issues with observing dynamic content

**Pattern:**
```typescript
let interval: NodeJS.Timeout;
window.addEventListener('DOMContentLoaded', () => {
  clearInterval(interval);
  interval = setInterval(pollFunction, 1000);
});
```

Clear interval before setting to avoid duplicate timers if DOMContentLoaded fires multiple times.
