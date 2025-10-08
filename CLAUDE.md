# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GChat is an Electron-based desktop application that wraps Google Chat (https://mail.google.com/chat/u/0) with native OS integrations and features. The app is built with TypeScript and targets Windows, macOS (Intel and ARM), and Linux (Debian) platforms.

**Package Manager:** This project uses `pnpm` (specified version ^10.0.0). Use `pnpm install` for dependencies.

**Runtime Environment:**
- **Electron version**: 38.2.1 (latest stable)
- **Node.js version**: 22.19.0 (bundled with Electron 38)
- **Chromium version**: 140.0.7339.41
- **V8 version**: 14.0

## Development Commands

```bash
# Install dependencies
pnpm install

# Build TypeScript (compiles src/ to lib/)
npm run ts

# Clean build artifacts
npm run clean:lib    # Remove lib/ directory
npm run clean:dist   # Remove dist/ directory

# Run the app in development mode
npm start            # Runs prestart (builds TypeScript) then starts Electron
```

## Build and Package Commands

### Windows
```bash
npm run pack:windows      # Package for Windows (runs TypeScript build first)
npm run build:windows     # Create Windows installer (uses windows/installer.js)
```

### macOS Intel
```bash
npm run pack:mac          # Package for macOS Intel
npm run build:mac-zip     # Create ZIP installer
npm run build:mac-dmg     # Create DMG installer
```

### macOS ARM (Apple Silicon)
```bash
npm run pack:mac-arm      # Package for macOS ARM
npm run build:mac-arm-zip # Create ARM ZIP installer
npm run build:mac-arm-dmg # Create ARM DMG installer
```

### Linux (Debian)
```bash
npm run pack:linux        # Package for Linux
npm run build:deb         # Create .deb installer
npm run build:deb-checksum # Generate SHA512 checksums
```

## Architecture

### Core Structure

The application follows a secure Electron architecture with four main layers:

1. **Main Process** (`src/main/`) - Node.js environment, controls app lifecycle
2. **Preload Scripts** (`src/preload/`) - Secure bridge using contextBridge API with context isolation enabled
3. **Renderer Process** - Sandboxed browser context loading Google Chat web app
4. **Shared Utilities** (`src/shared/`) - Type-safe utilities used across main and preload processes

### Key Files

- **`src/main/index.ts`** - Application entry point. Initializes security features early, then loads critical and deferred features. Certificate pinning is initialized before any network requests.
- **`src/main/windowWrapper.ts`** - BrowserWindow factory with strict security settings: context isolation enabled, sandbox enabled, Node.js integration disabled, Content Security Policy enforced.
- **`src/main/config.ts`** - Encrypted electron-store configuration with AES-256-GCM encryption. Manages app settings (window state, auto-updates, launch options) and persists them securely across launches.
- **`src/environment.ts`** - Environment configuration (development mode detection, URLs). Only accessible in main process.
- **`src/urls.ts`** - Application URLs (Google Chat URL, logout URL).

### Shared Utilities (`src/shared/`)

Cross-process utilities ensuring consistency and type safety:

- **`constants.ts`** - Centralized constants (IPC channels, DOM selectors, timing values, whitelisted domains). Prevents magic strings and typos.
- **`validators.ts`** - Input validation functions for all IPC messages. Includes URL sanitization, type checking, bounds validation, HTML escaping.
- **`types.ts`** - Shared TypeScript interfaces (StoreType, GChatBridgeAPI, IPC data structures). Single source of truth for types across main/renderer.

### Security Utilities (`src/main/utils/`)

Security-critical utilities for the main process:

- **`rateLimiter.ts`** - IPC rate limiting to prevent flooding and DoS attacks. Per-channel limits with auto-cleanup. Default 10 msg/sec, stricter limits for sensitive channels.
- **`logger.ts`** - Structured logging with scoped loggers. Environment-aware log levels. Pre-configured loggers for security, performance, and IPC.

### Feature System

Features live in `src/main/features/`. Each feature is a self-contained module that exports a default function, typically accepting the `mainWindow` and/or `trayIcon` as parameters. Features are initialized in `src/main/index.ts`.

**Existing features:**
- **aboutPanel** - Custom About panel with app information
- **appMenu** - Native application menu with keyboard shortcuts
- **appUpdates** - Update notification system (electron-update-notifier)
- **badgeIcon** - Badge/overlay icon for unread count with caching (platform-specific)
- **certificatePinning** - SSL certificate validation for Google domains to prevent MITM attacks
- **closeToTray** - Minimize to system tray instead of closing
- **contextMenu** - Right-click context menu (electron-context-menu)
- **externalLinks** - Opens external URLs in default browser with URL sanitization
- **firstLaunch** - Logs first launch via electron-log
- **handleNotification** - Native OS notification handling with rate limiting
- **inOnline** - Internet connectivity monitoring with rate limiting
- **openAtLogin** - Auto-launch on system startup (auto-launch)
- **reportExceptions** - Unhandled exception reporting (electron-unhandled)
- **singleInstance** - Ensures only one app instance runs (brings existing to focus)
- **trayIcon** - System tray icon with context menu
- **userAgent** - Custom User-Agent string override
- **windowState** - Persists window position/size between launches with debouncing

### Preload Scripts

Preload scripts (`src/preload/`) provide a secure bridge between renderer and main process using Electron's `contextBridge` API. With context isolation enabled, the renderer cannot directly access Node.js or Electron APIs.

**`src/preload/index.ts`** exposes the `window.gchat` API to the renderer:
```typescript
window.gchat {
  sendUnreadCount(count: number)      // Send unread count to main process
  sendFaviconChanged(href: string)    // Send favicon URL to main process
  sendNotificationClicked()           // Notify main that notification was clicked
  checkIfOnline()                     // Request online status check
  onSearchShortcut(callback)          // Register search shortcut handler
  onOnlineStatus(callback)            // Register online/offline status handler
}
```

**Individual preload modules:**
- **faviconChanged** - Uses MutationObserver to monitor favicon changes (no polling)
- **offline** - Listens for online/offline status via contextBridge API
- **searchShortcut** - Keyboard shortcut for search functionality with cleanup
- **unreadCount** - Uses MutationObserver to extract unread message count (no polling)

All IPC messages are validated before sending to the main process using shared validators from `src/shared/validators.ts`. Event listeners are properly cleaned up to prevent memory leaks.

### Offline Functionality

The app includes an offline page (`src/offline/`) shown when no internet connection is detected. This is a standalone HTML/CSS/JS bundle loaded by the main process when offline.

## TypeScript Configuration

- **Target:** ES2022
- **Module:** NodeNext (ESM with Node.js resolution)
- **Output:** `lib/` directory (mirrors `src/` structure)
- **Strict mode:** Enabled
- **Source maps:** Enabled for debugging

## Configuration Store Schema

The app uses `electron-store` with AES-256-GCM encryption and typed schema validation. All configuration data is encrypted at rest using a key derived from app-specific data.

When adding new settings:
1. Update the `StoreType` interface in `src/shared/types.ts`
2. Add the corresponding schema definition with type and default value in `src/main/config.ts`
3. Access via `store.get('key.path')` and `store.set('key.path', value)`

**Current schema structure:**
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

## Performance Optimizations

The application implements multiple caching and monitoring strategies to improve startup time and runtime performance.

### Caching System

**Icon Cache** (`src/main/utils/iconCache.ts`):
- Centralized icon loading eliminates 6+ redundant file I/O operations
- Pre-loads 7 common icons at startup via `warmCache()`
- Map-based caching with NativeImage storage
- **Impact:** ~10-20ms faster startup, ~100KB memory

**Package Info Cache** (`src/main/utils/packageInfo.ts`):
- Singleton pattern loads package.json once
- Frozen object for immutability, typed interface for safety
- Eliminates 2 duplicate synchronous file reads
- **Impact:** ~2-5ms faster startup, ~1KB memory

**Config Cache** (`src/main/utils/configCache.ts`):
- In-memory cache layer for electron-store
- Reduces encryption/decryption overhead
- Automatic invalidation on writes (maintains consistency)
- Hit/miss statistics tracking
- Enabled by default, disabled in test environment
- **Impact:** ~2-5ms faster startup, ~5KB memory

### Performance Monitoring

**Performance Monitor** (`src/main/utils/performanceMonitor.ts`):
- Tracks timing markers throughout app lifecycle
- Measures time between key milestones
- Logs comprehensive startup performance summary
- Negligible overhead (~0.01ms per mark)

**Config Profiler** (`src/main/utils/configProfiler.ts`):
- Profiles electron-store read performance
- Determines if caching provides measurable benefit
- Runs automatically in development mode
- Threshold: 0.1ms average read time

### Optimization Results

- **Total startup improvement:** 17-35ms
- **Total memory overhead:** ~115KB (negligible)
- **Test coverage:** All optimizations unit tested
- **Production ready:** Enabled by default with safety checks

For detailed documentation, see:
- `PERFORMANCE_OPTIMIZATIONS.md` - Implementation guide and metrics
- `src/main/utils/PERFORMANCE_UTILITIES.md` - API references and usage patterns
- `src/main/utils/CLAUDE.md` - Integration with existing utilities

## Security Architecture

This application implements defense-in-depth security with multiple layers:

### Process Isolation
- **Context Isolation:** ✅ Enabled - Renderer cannot access Node.js APIs directly
- **Sandbox Mode:** ✅ Enabled - OS-level process isolation for renderer
- **Node Integration:** ✅ Disabled - Renderer cannot require Node.js modules
- **Auxclick:** ✅ Disabled - Prevents middle-click exploits

### Content Security Policy (CSP)
Strict CSP enforced via webRequest.onHeadersReceived:
- Script sources restricted to Google domains only
- `object-src 'none'` blocks plugins
- Inline scripts/eval allowed only where required by Google Chat
- Frame sources limited to Google domains

### Input Validation & Sanitization
- All IPC messages validated using `src/shared/validators.ts`
- URL sanitization with protocol whitelist (http/https only)
- Numeric bounds checking and NaN protection
- HTML entity encoding for string outputs

### Rate Limiting
- IPC rate limiter prevents flooding and DoS attacks
- Per-channel limits: default 10 msg/sec, stricter for sensitive channels
- Auto-cleanup prevents memory leaks

### External Content Handling
- URLs validated before opening with `shell.openExternal()`
- Protocol whitelist enforcement
- Credential stripping (removes username/password)
- Dangerous patterns blocked (javascript:, data:, file:, vbscript:)

### Certificate Pinning
- SSL certificate validation for all Google domains
- Trusted issuers: Google Trust Services (GTS), GlobalSign
- Certificate validity period verification
- Prevents Man-in-the-Middle attacks

### Data Encryption at Rest
- All configuration data encrypted with AES-256-GCM
- Encryption key derived from app-specific data
- Protects user preferences and window state

### Permission Management
- Restrictive permission handler
- Only allows: notifications, media, mediaKeySystem, geolocation
- All other permissions denied by default
- All requests logged for audit

For complete security details, see `SECURITY.md` in the repository root.

## Platform-Specific Considerations

- **macOS:** Uses `.icns` icon format, enforces app location via electron-util
- **Windows:** Uses `.ico` icon format, requires Inno Setup for installer
- **Linux:** Uses `.png` icon, creates `.deb` packages with electron-installer-debian
- Badge icons work differently per platform (check `badgeIcon.ts` implementation)
