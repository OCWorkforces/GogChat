# mac/

This directory contains build scripts for creating macOS installers (both Intel and Apple Silicon).

## Overview

macOS builds support two architectures:
- **x64**: Intel processors
- **arm64**: Apple Silicon (M1/M2/M3+)

Installer format:
- **DMG**: Disk image with drag-to-Applications interface (standard macOS distribution format)

## Scripts

### installer-dmg.sh
Creates a DMG disk image for Intel Macs.

**Process:**
1. Extracts version from `package.json`
2. Creates temporary uncompressed DMG from `.app` bundle
3. Mounts the temporary DMG
4. Adds symlink to `/Applications` folder (enables drag-to-install UX)
5. Unmounts temporary DMG
6. Converts to compressed DMG with maximum compression
7. Cleans up temporary DMG
8. Output: `dist/Google Chat-v{version}.dmg`

**Usage:**
```bash
npm run build:mac-dmg
```

**hdiutil commands:**
- `create`: Create DMG from folder
  - `-format UDRW`: Read/write format (temporary)
  - `-fs HFS+`: macOS filesystem
  - `-size 500m`: 500MB initial size
- `attach`: Mount DMG
  - `-readwrite`: Allow modifications
  - `-noverify`: Skip verification (faster)
  - `-noautoopen`: Don't open Finder window
- `detach`: Unmount DMG
- `convert`: Compress DMG
  - `-format UDZO`: Compressed read-only format
  - `-imagekey zlib-level=9`: Maximum zlib compression

### installer-arm-dmg.sh
Creates a DMG disk image for Apple Silicon Macs.

**Process:**
Identical to `installer-dmg.sh` but uses:
- Source: `dist/Google Chat-darwin-arm64/`
- Output: `dist/Google Chat-v{version}-arm64.dmg`

**Usage:**
```bash
npm run build:mac-arm-dmg
```

## Prerequisites

Before running these scripts:

1. **Package the app:**
   ```bash
   # Intel
   npm run pack:mac

   # Apple Silicon
   npm run pack:mac-arm
   ```
   This creates the `.app` bundle in `dist/` directory.

2. **macOS tools:**
   - `hdiutil`: Built into macOS (for DMG creation)
   - Bash shell (default on macOS)

## Build Workflow

### Complete Intel build:
```bash
npm run pack:mac        # Creates .app bundle
npm run build:mac-dmg   # Creates DMG installer
```

### Complete Apple Silicon build:
```bash
npm run pack:mac-arm        # Creates .app bundle
npm run build:mac-arm-dmg   # Creates DMG installer
```

### All installers:
```bash
# Intel
npm run pack:mac && npm run build:mac-dmg

# ARM
npm run pack:mac-arm && npm run build:mac-arm-dmg
```

## Output Locations

After successful build:

```
dist/
├── Google Chat-darwin-x64/              # Packaged app (Intel)
│   └── Google Chat.app
├── Google Chat-darwin-arm64/            # Packaged app (ARM)
│   └── Google Chat.app
├── Google Chat-v{version}.dmg           # Intel DMG installer
└── Google Chat-v{version}-arm64.dmg     # ARM DMG installer
```

## DMG Disk Image Details

### Why Applications symlink?
The symlink allows users to install by dragging the `.app` to the Applications folder:
1. User opens DMG (mounts it)
2. Finder shows window with `GChat.app` and `Applications` shortcut
3. User drags `GChat.app` to `Applications` shortcut
4. App is installed to `/Applications/GChat.app`

This is the standard macOS installation UX for drag-to-install apps.

### Volume settings:
- **Volume name**: "GChat {version}" (shown in Finder sidebar when mounted)
- **Filesystem**: HFS+ (macOS Extended)
- **Format**: UDZO (compressed, read-only)
- **Compression**: zlib level 9 (maximum)

### Size:
- Initial: 500MB (generous to ensure .app fits)
- Final: Compressed to actual size (~100-200MB typically)

## Troubleshooting

### Script fails at "Creating temporary DMG":
- Check that source directory exists: `dist/Google Chat-darwin-{arch}/Google Chat.app`
- Run `npm run pack:mac` or `npm run pack:mac-arm` first

### "Resource busy" error during unmount:
- Finder or another process has the DMG open
- Close all Finder windows showing the DMG
- Try: `hdiutil detach /Volumes/GChat* -force`

### Version extraction fails:
- Ensure `package.json` has valid `"version": "x.y.z"` field
- Check that sed commands work with your version format

### Permission denied:
- Make scripts executable: `chmod +x mac/*.sh`

## Distribution Considerations

### Code Signing (not implemented):
These scripts do NOT sign the app. For public distribution, you should:
```bash
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" "Google Chat.app"
```

### Notarization (not implemented):
For macOS 10.15+, apps should be notarized:
```bash
xcrun notarytool submit "Google Chat.dmg" --apple-id your@email.com --password app-specific-password --team-id TEAMID
xcrun stapler staple "Google Chat.dmg"
```

### Universal binary (not implemented):
Could create a single universal binary supporting both Intel and ARM:
```bash
electron-packager . --platform=darwin --arch=universal
```
This would combine both architectures into one larger `.app` bundle.

## Modifying Scripts

### Change output directory:
Edit `OUT_DIR` variable in scripts.

### Change DMG appearance:
Add custom background image:
```bash
# After mounting temp DMG, before unmounting:
cp background.png "$MOUNT_DIR/.background/background.png"
# Then set Finder view options with AppleScript
```

### Adjust compression:
Change `-imagekey zlib-level=9` to lower number (faster but larger file).

### Change initial DMG size:
Edit `-size 500m` to larger/smaller value (must fit uncompressed .app).
