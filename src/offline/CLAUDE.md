# src/offline/

This directory contains the offline page that is displayed when the app cannot connect to the internet.

## Overview

When the main process detects no internet connectivity (via `../main/features/inOnline.ts`), it loads this self-contained HTML page instead of Google Chat. This provides a user-friendly experience when offline and allows automatic retry attempts.

## Files

### index.html
Static HTML page displayed during offline state.

**Structure:**
- Google Chat logo from `resources/icons/normal/scalable.svg`
- "Failed to load webpage :(" message
- **Retry button**: Triggers connectivity check
- **Fallback link**: Direct link to Google Chat (in case the app's check fails but browser works)

**Content Security Policy:**
```
default-src 'unsafe-inline' 'self';
style-src 'unsafe-inline' 'self'
```
- Only allows loading resources from app itself
- `unsafe-inline` needed for inline styles
- No external resources (works completely offline)

**Script loading:**
- Loads compiled `lib/offline/index.js` (TypeScript output)
- Uses `async` attribute for non-blocking load

### index.css
Styles for the offline page (simple, self-contained CSS).

### index.ts
JavaScript logic for the offline page.

**Features:**
1. **Manual retry**: "Retry" button triggers connectivity check
2. **Automatic retry**: Checks every 60 seconds automatically
3. **Retry limit**: Stops after 100 automatic attempts (prevents infinite loops)

**Implementation details:**
```typescript
const checkIsOnline = () => {
  // Stop auto-retry after 100 attempts
  if (attemptCount > MAX_AUTO_ATTEMPT_COUNT) {
    clearInterval(interval);
  }

  // Update button state
  btn.disabled = true;
  btn.innerText = 'Checking...';

  // Dispatch global event (no direct IPC access)
  window.dispatchEvent(new Event('app:checkIfOnline'));

  attemptCount++;
}
```

**Communication mechanism:**
- This script runs in pure browser context (no Node.js access)
- Cannot use `ipcRenderer` directly
- Uses global `window.dispatchEvent()` to send event
- The preload script (`../preload/offline.ts`) listens for this event and forwards to main process via IPC

**Event flow:**
1. User clicks "Retry" or auto-retry timer fires
2. `checkIsOnline()` dispatches `app:checkIfOnline` event
3. `../preload/offline.ts` catches event and sends IPC to main
4. `../main/features/inOnline.ts` checks actual connectivity
5. Main sends `onlineStatus` back to preload
6. Preload redirects to Google Chat if online, or reloads page if still offline

**Auto-retry behavior:**
- Checks every 60 seconds (60000ms)
- Maximum 100 attempts (100 minutes)
- After limit reached, user must manually click "Retry"
- Button shows "Checking..." state during connectivity test

## Design Considerations

### Why a separate HTML page?
- Cannot rely on Google Chat page when offline
- Provides clear feedback to user
- Allows retry mechanism without complex state management
- Self-contained (no external dependencies)

### Why no direct IPC access?
- Security: Offline page is a simple HTML document, not a trusted web app
- Architecture: Keeps offline page simple and isolated
- Solution: Uses preload script as bridge (preload has IPC access)

### Why automatic retry?
- User experience: App automatically reconnects when internet returns
- Common scenario: Brief internet outages (Wi-Fi reconnecting, etc.)
- Limit prevents battery drain from infinite retries

### Why 60-second interval?
- Balance between responsiveness and resource usage
- Connectivity issues typically last minutes, not seconds
- Reduces unnecessary checks while still being reasonably responsive

## Modifying the Offline Page

### Changing appearance:
- Edit `index.html` for structure
- Edit `index.css` for styling
- Logo path: `../../resources/icons/normal/scalable.svg`

### Changing retry behavior:
- Edit `index.ts`
- `MAX_AUTO_ATTEMPT_COUNT`: Maximum automatic retries (default 100)
- `setInterval(checkIsOnline, 1000 * 60)`: Retry interval in milliseconds (default 60s)

### Adding functionality:
- Keep it simple (this is an offline page, no complex logic needed)
- No external resources (must work without internet)
- Use `window.dispatchEvent()` to communicate with preload script
- Add corresponding listener in `../preload/offline.ts` if needed

## Integration Points

**Main Process (`../main/features/inOnline.ts`):**
- Detects offline state
- Loads this page: `window.loadFile('lib/offline/index.html')`
- Listens for `checkIfOnline` IPC from preload
- Responds with `onlineStatus` IPC message

**Preload Script (`../preload/offline.ts`):**
- Bridges offline page and main process
- Listens for `app:checkIfOnline` global event
- Sends IPC to main process
- Receives `onlineStatus` and redirects accordingly

**Build Process:**
- TypeScript (`index.ts`) compiles to `lib/offline/index.js`
- HTML and CSS copied as-is (no processing needed)
- All resources must be in `lib/` or `resources/` (within app package)
