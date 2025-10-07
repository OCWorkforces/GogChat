# resources/

This directory contains static assets bundled with the application (icons, images, etc.).

## Structure

```
resources/
└── icons/          # Application icons for various contexts
    ├── badge/      # Badge overlay icons (Windows taskbar badges)
    ├── normal/     # Standard app icons (all platforms)
    └── offline/    # Tray icons for offline/default state
```

## Usage

Resources are accessed at runtime using `app.getAppPath()`:

```typescript
import { app, nativeImage } from 'electron';
import path from 'path';

const iconPath = path.join(app.getAppPath(), 'resources/icons/normal/256.png');
const icon = nativeImage.createFromPath(iconPath);
```

## Icons Directory

See `icons/CLAUDE.md` for detailed documentation of icon usage and formats.

## Adding New Resources

1. Place files in appropriate subdirectory
2. Commit to git (resources are bundled with the app)
3. Reference using `app.getAppPath()` in code
4. Consider platform-specific requirements (e.g., .ico for Windows, .icns for macOS)

**Important:**
- Keep file sizes reasonable (bundled with every app download)
- Use appropriate formats for each platform
- Test that resources load correctly on all target platforms

## Platform-Specific Considerations

### macOS
- App icon: `.icns` format (includes multiple resolutions)
- Tray icon: 16px PNG (Retina displays handle scaling automatically)
- Color: Template images (black with alpha) for proper light/dark mode support

### Windows
- App icon: `.ico` format (includes multiple sizes)
- Tray icon: 32px PNG
- Badge overlay: 16px PNG (drawn on taskbar icon)

### Linux
- App icon: Multiple PNG sizes + scalable SVG
- Tray icon: 32px PNG
- .desktop file references icon by absolute path

## Build Integration

Resources are copied during the packaging process:
- `electron-packager` includes `resources/` directory automatically
- No build step needed (static assets)
- Final location in packaged app: `app.asar/resources/` or unpacked

## Security Notes

- Resources are part of the app bundle (trusted content)
- No user-generated content in this directory
- CSP (Content Security Policy) allows loading from `'self'` origin
