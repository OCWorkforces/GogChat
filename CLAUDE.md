# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GChat is an Electron-based desktop application that wraps Google Chat (https://mail.google.com/chat/u/0) with native OS integrations and features. The app is built with TypeScript and targets Windows, macOS (Intel and ARM), and Linux (Debian) platforms.

**Package Manager:** This project uses `pnpm` (specified version ^7.0.0). Use `pnpm install` for dependencies.

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

The application follows a standard Electron architecture with three main layers:

1. **Main Process** (`src/main/`) - Node.js environment, controls app lifecycle
2. **Preload Scripts** (`src/preload/`) - Bridge between main and renderer with limited Node.js access
3. **Renderer Process** - Loads Google Chat web app via BrowserWindow

### Key Files

- **`src/main/index.ts`** - Application entry point. Initializes all features in sequence when app is ready. This is where you'll add new feature initialization calls.
- **`src/main/windowWrapper.ts`** - BrowserWindow factory with security settings and store-based configuration (menu bar, spell checker, start hidden).
- **`src/main/config.ts`** - Typed electron-store configuration with JSON schema validation. Manages app settings (window state, auto-updates, launch options) and persists them across launches.
- **`src/environment.ts`** - Environment configuration (development mode detection, URLs). Only accessible in main process.
- **`src/urls.ts`** - Application URLs (Google Chat URL, logout URL).

### Feature System

Features live in `src/main/features/`. Each feature is a self-contained module that exports a default function, typically accepting the `mainWindow` and/or `trayIcon` as parameters. Features are initialized in `src/main/index.ts`.

**Existing features:**
- **aboutPanel** - Custom About panel with app information
- **appMenu** - Native application menu with keyboard shortcuts
- **appUpdates** - Update notification system (electron-update-notifier)
- **badgeIcon** - Badge/overlay icon for unread count (platform-specific)
- **closeToTray** - Minimize to system tray instead of closing
- **contextMenu** - Right-click context menu (electron-context-menu)
- **externalLinks** - Opens external URLs in default browser
- **firstLaunch** - Logs first launch via electron-log
- **handleNotification** - Native OS notification handling
- **inOnline** - Internet connectivity monitoring
- **openAtLogin** - Auto-launch on system startup (auto-launch)
- **reportExceptions** - Unhandled exception reporting (electron-unhandled)
- **singleInstance** - Ensures only one app instance runs (brings existing to focus)
- **trayIcon** - System tray icon with context menu
- **userAgent** - Custom User-Agent string override
- **windowState** - Persists window position/size between launches

### Preload Scripts

Preload scripts (`src/preload/`) inject functionality into the renderer process:
- **faviconChanged** - Monitors favicon changes to detect Google Chat state
- **offline** - Handles offline state UI
- **searchShortcut** - Keyboard shortcut for search functionality
- **overrideNotifications** - Intercepts web notifications for native handling
- **unreadCount** - Extracts unread message count from page

All preload scripts are imported via `src/preload/index.ts` and bundled into the renderer.

### Offline Functionality

The app includes an offline page (`src/offline/`) shown when no internet connection is detected. This is a standalone HTML/CSS/JS bundle loaded by the main process when offline.

## TypeScript Configuration

- **Target:** ES2022
- **Module:** NodeNext (ESM with Node.js resolution)
- **Output:** `lib/` directory (mirrors `src/` structure)
- **Strict mode:** Enabled
- Source maps are disabled for production

## Configuration Store Schema

The app uses `electron-store` with a typed schema. When adding new settings:
1. Update the `StoreType` interface in `src/main/config.ts`
2. Add the corresponding schema definition with type and default value
3. Access via `store.get('key.path')` and `store.set('key.path', value)`

## Security Notes

- **Context Isolation:** Disabled (legacy requirement for preload scripts)
- **Node Integration:** Disabled in renderer for security
- **Auxclick:** Disabled to prevent security exploits
- **Sandbox:** Disabled (allows preload scripts to work)
- External links are intercepted and opened in the default browser, never in-app

## Platform-Specific Considerations

- **macOS:** Uses `.icns` icon format, enforces app location via electron-util
- **Windows:** Uses `.ico` icon format, requires Inno Setup for installer
- **Linux:** Uses `.png` icon, creates `.deb` packages with electron-installer-debian
- Badge icons work differently per platform (check `badgeIcon.ts` implementation)
