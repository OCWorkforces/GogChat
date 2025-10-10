# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GChat is an Electron-based desktop application that wraps Google Chat (https://mail.google.com/chat/u/0) with native OS integrations and features. The app is built with TypeScript and currently targets macOS (both Intel x64 and Apple Silicon arm64) platforms.

**Package Manager:** This project uses `npm`. Use `npm install` for dependencies.

**Runtime Environment:**

- **Electron version**: 38.2.2 (latest stable)
- **Node.js version**: 22.19.0 (bundled with Electron 38)
- **Chromium version**: 140.0.7339.41
- **V8 version**: 14.0

## Development Commands

```bash
# Install dependencies
npm install

# Build with Rsbuild (compiles src/ to lib/)
npm run build:dev      # Development build with source maps
npm run build:prod     # Production build (minified, optimized)
npm run build:watch    # Watch mode for development

# Clean build artifacts
npm run clean:lib    # Remove lib/ directory
npm run clean:dist   # Remove dist/ directory

# Run the app in development mode
npm start            # Runs prestart (production build) then starts Electron
```

## Build and Package Commands

### macOS Intel (x64)

```bash
npm run pack:mac          # Package for macOS Intel
npm run build:mac-dmg     # Create DMG installer
```

### macOS ARM (Apple Silicon)

```bash
npm run pack:mac-arm      # Package for macOS ARM
npm run build:mac-arm-dmg # Create ARM DMG installer
```

## Build System

The application uses **Rsbuild** (powered by Rspack) as the build tool. Rsbuild provides high-performance builds that are 5-10x faster than webpack, with full TypeScript support and optimal output for Electron main process.

### Key Features

- **Fast builds**: 0.25s for development builds, 0.31s for production builds
- **Incremental builds**: 30-40% faster rebuilds in watch mode
- **Tree shaking**: Dead code elimination for smaller bundles
- **Code splitting**: Dynamic imports create separate chunks for on-demand loading (see `CODE_SPLITTING.md`)
- **TypeScript**: Native TypeScript support with type checking
- **Source maps**: Full source map support for debugging
- **Dynamic entry points**: Automatically discovers all TypeScript files
- **External dependencies**: Electron and Node.js modules marked as external

### Configuration

**Main configuration file**: `rsbuild.config.ts`

```typescript
export default defineConfig({
  source: {
    entry: {}, // Entry points added dynamically by build script
  },
  output: {
    target: 'node',
    distPath: { root: 'lib', js: '' },
    module: true, // ESM output
    externals: [
      'electron',
      /^electron\/.*/,
      /^node:.*/,
      'electron-log',
      'electron-store',
      'electron-unhandled',
      'electron-update-notifier',
      'electron-context-menu',
      'auto-launch',
    ],
  },
  tools: {
    rspack: (config) => {
      config.target = 'electron-main'; // Electron main process target
      return config;
    },
  },
});
```

### Build Script

**Build script**: `scripts/build-rsbuild.js`

The build script provides:

1. **Dynamic entry point scanning**: Automatically finds all `.ts` files in `src/` (excluding tests)
2. **Build history tracking**: Stores bundle size history in `.build-history.json`
3. **Bundle size comparison**: Shows size difference from previous build
4. **Environment support**: Development vs production builds
5. **Watch mode**: Automatic rebuilds on file changes

**Entry point discovery**:

```javascript
// Scans src/ directory recursively
// Includes: *.ts files (except *.test.ts and *.spec.ts)
// Output: lib/ directory (mirrors src/ structure)
```

**Build modes**:

- **Development** (`--dev`):
  - Source maps enabled
  - No minification
  - Fast builds (~0.25s)
  - Suitable for debugging

- **Production** (default):
  - Minification enabled
  - Tree shaking enabled
  - Optimized output (~0.31s)
  - Suitable for distribution

**Watch mode** (`--watch`):

- Monitors file changes
- Incremental rebuilds
- Faster than full rebuilds (30-40% improvement)

### Build Output

**Directory structure**:

```
lib/
├── main/
│   ├── index.js
│   ├── windowWrapper.js
│   ├── config.js
│   ├── features/
│   │   ├── badgeIcon.js
│   │   ├── trayIcon.js
│   │   └── ...
│   └── utils/
│       ├── logger.js
│       ├── rateLimiter.js
│       └── ...
├── preload/
│   ├── index.js
│   └── modules/
│       └── ...
├── shared/
│   ├── constants.js
│   ├── validators.js
│   └── types.js
├── chunks/                  (Async chunks from dynamic imports)
│   ├── 65.js               (contextMenu feature)
│   ├── 705.js              (firstLaunch feature)
│   └── 879.js              (appUpdates feature)
└── offline/
    └── ...
```

**Bundle sizes** (typical production build):

- Total output: ~1.04 MB
- JavaScript: ~187 KB
- Source maps: ~857 KB (not included in distribution)

### Build History

Build statistics are stored in `.build-history.json`:

```json
{
  "builds": [
    {
      "timestamp": "2025-10-10T...",
      "mode": "production",
      "totalSize": 187428,
      "fileCount": 46,
      "duration": 312,
      "success": true
    }
  ]
}
```

**Tracked metrics**:

- Total bundle size (bytes)
- Number of files compiled
- Build duration (milliseconds)
- Build mode (development/production)
- Success/failure status

### Adding New Source Files

No configuration changes needed. The build system automatically:

1. Discovers new `.ts` files in `src/`
2. Compiles them to corresponding `.js` files in `lib/`
3. Maintains directory structure

**Example**:

```
src/main/features/myNewFeature.ts  →  lib/main/features/myNewFeature.js
```

### Migrating from esbuild

The project has fully migrated from esbuild to Rsbuild. Legacy esbuild scripts are kept as backup:

- `npm run build:esbuild:dev` - Old dev build (do not use)
- `npm run build:esbuild:prod` - Old prod build (do not use)
- `npm run build:esbuild:watch` - Old watch mode (do not use)

**Use Rsbuild scripts instead**:

- `npm run build:dev`
- `npm run build:prod`
- `npm run build:watch`

### Code Splitting

The build system supports **code splitting via dynamic imports** to improve startup performance. Non-critical features are lazy-loaded using `import()` syntax:

```typescript
// Deferred features loaded on-demand
await Promise.all([
  import('./features/openAtLogin.js').then((m) => m.default(window)),
  import('./features/appUpdates.js').then((m) => m.default()),
  import('./features/contextMenu.js').then((m) => m.default()),
  // ...
]);
```

**Benefits:**
- Smaller initial bundle (~51KB vs ~54KB)
- Faster app startup (UI ready before all features loaded)
- Better caching (chunks cached independently)

**Output:** Async chunks are placed in `lib/chunks/` directory and automatically included in packaged apps (asar archives).

**For detailed information**, see `CODE_SPLITTING.md`

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
- **passkeySupport** - Passkey/WebAuthn authentication support with macOS permissions guidance (macOS only)
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
  reportPasskeyFailure(errorType)     // Report passkey/WebAuthn authentication failure
  onSearchShortcut(callback)          // Register search shortcut handler
  onOnlineStatus(callback)            // Register online/offline status handler
}
```

**Individual preload modules:**

- **faviconChanged** - Uses MutationObserver to monitor favicon changes (no polling)
- **offline** - Listens for online/offline status via contextBridge API
- **passkeyMonitor** - Monitors WebAuthn/passkey authentication failures
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
  bounds: {
    (x, y, width, height);
  }
  isMaximized: boolean;
}
app: {
  autoCheckForUpdates: boolean;
  autoLaunchAtLogin: boolean;
  startHidden: boolean;
  hideMenuBar: boolean;
  disableSpellChecker: boolean;
  suppressPasskeyDialog: boolean;
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

**Current platform support: macOS only (Intel x64 and Apple Silicon arm64)**

- **macOS:** Uses `.icns` icon format for app bundle
- Badge icons use `app.setBadgeCount()` for dock badge
- Tray icons are 16px PNG (Retina displays handle scaling)
- DMG installers created via `hdiutil` (see `mac/` directory)
- Passkey/WebAuthn support with system permissions guidance
