# resources/icons/

This directory contains all application icons in various formats and sizes for different use cases.

## Subdirectories

### normal/
Standard application icons used for:
- App window icon
- Dock/taskbar icon (macOS/Windows/Linux)
- About panel
- Package installer icons
- .desktop file icon (Linux)

**Files:**
- `16.png`, `32.png`, `48.png`, `64.png`, `256.png` - Multiple resolutions for different contexts
- `mac.icns` - macOS icon bundle (contains multiple resolutions, used for .app bundle)
- `windows.ico` - Windows icon (multi-resolution .ico, used for .exe)
- `scalable.svg` - Vector icon (used in offline page, Linux .desktop files)

**Usage:**
```typescript
// Window icon (cross-platform)
icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'resources/icons/normal/256.png'))

// macOS .app icon (electron-packager)
--icon=./resources/icons/normal/mac.icns

// Windows .exe icon (electron-packager)
--icon=./resources/icons/normal/windows.ico
```

### badge/
Badge overlay icons displayed over the main icon to indicate unread messages (Windows-specific).

**Files:**
- `16.png`, `32.png`, `48.png`, `64.png`, `256.png` - Badge overlays at various sizes

**Usage:**
```typescript
// Windows taskbar badge overlay (features/badgeIcon.ts)
const badgeIcon = nativeImage.createFromPath(
  path.join(app.getAppPath(), 'resources/icons/badge/64.png')
);
window.setOverlayIcon(badgeIcon, 'Unread messages');
```

**Platform support:**
- **Windows**: Full support via `setOverlayIcon()` - shows small overlay on taskbar icon
- **macOS**: Not used (dock badge uses text count instead)
- **Linux**: Limited/no support

**Design:**
- Badge icons should be visually distinct from normal icons
- Typically highlight or accent color
- High contrast for visibility at small sizes

### offline/
Tray icons for the system tray (notification area).

**Files:**
- `16.png`, `32.png`, `48.png`, `64.png`, `256.png` - Tray icons at various sizes

**Usage:**
```typescript
// System tray icon (features/trayIcon.ts)
const size = is.macos ? 16 : 32;
const trayIcon = new Tray(
  nativeImage.createFromPath(
    path.join(app.getAppPath(), `resources/icons/offline/${size}.png`)
  )
);
```

**Platform-specific sizes:**
- **macOS**: 16px (Retina displays scale automatically, should be template image)
- **Windows**: 32px
- **Linux**: 32px

**Design considerations:**
- Should work on both light and dark system themes
- Simple, recognizable at very small sizes
- macOS: Consider using template images (black with alpha channel) for automatic theme adaptation

**Naming note:**
Directory named "offline" but icons are used for tray in all states (online and offline). The name is historical/semantic.

## Icon Size Guide

| Size | Primary Use |
|------|------------|
| 16px | macOS tray icon, Windows small icon |
| 32px | Windows tray icon, small app icon |
| 48px | Medium app icon, Linux panel |
| 64px | Windows badge overlay |
| 256px | Main app window icon, high-DPI displays |
| .icns | macOS app bundle (contains 16-1024px) |
| .ico | Windows executable (contains 16-256px) |
| .svg | Vector/scalable (web views, Linux) |

## Creating/Updating Icons

### Required formats for new icons:

1. **Design** at highest resolution (512px or 1024px)
2. **Export** multiple sizes:
   - PNG: 16, 32, 48, 64, 256
   - SVG: Vector version for scalability
3. **Convert** to platform formats:
   ```bash
   # macOS .icns (requires iconutil or similar)
   iconutil -c icns icon.iconset -o mac.icns

   # Windows .ico (requires ImageMagick or similar)
   magick convert 16.png 32.png 48.png 64.png 256.png windows.ico
   ```
4. **Test** on all platforms (appearance varies by OS/theme)

### Design guidelines:

- **Consistency**: All icon variants should be recognizable as the same app
- **Simplicity**: Icons are viewed at small sizes, avoid excessive detail
- **Contrast**: Ensure visibility on various backgrounds (light/dark themes)
- **Alignment**: Center icon content, use consistent padding
- **Format-specific**:
  - macOS tray: Template image (pure black + alpha) for auto theme adaptation
  - Windows badge: High contrast, simple shape (overlays on existing icon)
  - SVG: Clean, optimized vector paths

## Integration Points

### Window Icon (`src/main/windowWrapper.ts`):
```typescript
icon: nativeImage.createFromPath(path.join(app.getAppPath(), 'resources/icons/normal/256.png'))
```

### Tray Icon (`src/main/features/trayIcon.ts`):
```typescript
const size = is.macos ? 16 : 32;
const icon = `resources/icons/offline/${size}.png`;
```

### Badge Icon (`src/main/features/badgeIcon.ts`):
```typescript
// Windows only
const badgeIcon = nativeImage.createFromPath(
  path.join(app.getAppPath(), 'resources/icons/badge/64.png')
);
```

### Package Builders:
- **electron-packager**: Uses `--icon` flag pointing to `.icns` (macOS) or `.ico` (Windows)
- **electron-installer-debian**: References PNG icons in config (`debian/config.json`)

## Platform Icon Requirements

### macOS (.app bundle)
- **Format**: `.icns` file
- **Location**: `Contents/Resources/electron.icns` (auto-handled by electron-packager)
- **Sizes**: Typically 16, 32, 64, 128, 256, 512, 1024 (all @1x and @2x)
- **Tray**: 16px PNG, preferably template image

### Windows (.exe)
- **Format**: `.ico` file (embedded in executable)
- **Sizes**: 16, 32, 48, 64, 256
- **Tray**: 32px PNG (notification area)
- **Badge**: 64px PNG (taskbar overlay)

### Linux (.deb)
- **Format**: Multiple PNG files + optional SVG
- **Sizes**: 16, 32, 48, 64, 256, scalable
- **Location**: `/usr/share/icons/hicolor/{size}/apps/gchat.png`
- **Desktop file**: References icon by name or absolute path

## Troubleshooting

### Icon not showing in app:
- Check file path (use `app.getAppPath()` not relative paths)
- Verify file exists in packaged app
- Check file permissions (readable)

### Icon wrong size/blurry:
- Ensure using appropriate size for platform
- macOS: Use .icns for app icon, 16px for tray
- Windows: Use .ico for app icon, 32px for tray
- Linux: Use 256px for app icon, 32px for tray

### Tray icon not visible on dark theme:
- Use higher contrast colors
- macOS: Use template images (black + alpha)
- Test on both light and dark system themes

### Badge not showing (Windows):
- Requires Windows 7+
- Uses `setOverlayIcon()` API
- Badge must be simple, high contrast
- Maximum size typically 16x16 or 32x32 pixels
