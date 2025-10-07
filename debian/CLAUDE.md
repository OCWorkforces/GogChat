# debian/

This directory contains configuration and scripts for creating Debian/Ubuntu `.deb` package installers.

## Overview

The Debian build process uses:
- **electron-packager**: Packages the app for Linux x64
- **electron-installer-debian**: Creates `.deb` package from packaged app

Output: `GChat_amd64.deb` package compatible with Debian, Ubuntu, and derivatives.

## Files

### config.json
Configuration file for `electron-installer-debian`.

**Structure:**
```json
{
  "src": "./dist/GChat-linux-x64",          // Packaged app directory
  "dest": "./dist/installers/",             // Output directory for .deb
  "options": {
    "productName": "Google Chat",           // Display name
    "icon": { ... },                        // Icon paths (multiple sizes)
    "categories": [...],                    // .desktop file categories
    "scripts": {
      "postrm": "debian/scripts/post-remove.sh"  // Post-removal script
    }
  }
}
```

**Icon configuration:**
Multiple icon sizes for different contexts:
- `16x16`: Panel indicators, small icons
- `32x32`: Menus, small toolbar
- `48x48`: Default application icon
- `64x64`: Large icons
- `256x256`: High-resolution displays
- `scalable`: SVG for any size

All icons reference `resources/icons/normal/` directory.

**Categories:**
- `Social`: Social networking application
- `Communication`: Communication/messaging app
- `Network`: Network-dependent application

These categories determine where the app appears in application menus (GNOME, KDE, etc.).

**Post-removal script:**
- Runs after package is uninstalled
- Only executes on `--purge` (complete removal)
- Cleans up user data and configuration

### scripts/post-remove.sh
Bash script that runs after package removal.

**Behavior:**
- Only runs when user specifies `--purge` flag: `sudo apt remove --purge gchat`
- On regular uninstall (`apt remove`), script exits early
- On upgrade, script exits early (preserves user data)

**Cleanup actions:**
1. **Detects user home directory**:
   - Normal user: `~`
   - Root/sudo: Resolves to actual user's home via `$SUDO_USER`

2. **Removes autostart config**:
   - File: `~/.config/autostart/GChat.desktop`
   - Prevents app from auto-starting on next login

3. **Removes app cache/data**:
   - Directory: `~/.config/GChat/`
   - Includes electron-store data, logs, cache, etc.

**Why conditional execution?**
- Package upgrades trigger removal of old version
- Don't want to delete user data during upgrade
- Only purge data when user explicitly requests it

**Safety:**
- Uses `set -e` (exit on error)
- Only removes specific directories (not recursive from /)
- Logs all actions for troubleshooting

## Prerequisites

### 1. electron-installer-debian
Optional dependency, must be installed:
```bash
npm install  # Includes optionalDependencies
# or
npm install electron-installer-debian
```

**Note**: Only needed on Linux build machines, hence optional.

### 2. Packaged App
Before building .deb, package the app:
```bash
npm run pack:linux
```
This creates `dist/GChat-linux-x64/` directory.

### 3. Icon Files
All referenced icons must exist in `resources/icons/normal/`.

## Build Workflow

### Complete Debian build:
```bash
npm run pack:linux        # Package app for Linux
npm run build:deb         # Create .deb package
npm run build:deb-checksum # Generate SHA512 checksums
```

### Step-by-step process:
1. **TypeScript compilation**: `npm run ts`
   - Compiles `src/` to `lib/`
2. **Packaging**: electron-packager
   - Creates `dist/GChat-linux-x64/` with binary and resources
3. **Debian package creation**: electron-installer-debian
   - Reads `debian/config.json`
   - Creates control file, changelog, copyright
   - Packages app into `dist/installers/GChat_amd64.deb`
4. **Checksum generation**: (optional)
   - Creates SHA512 hash of .deb file
   - Output: `dist/installers/GChat-deb-SHA512.txt`

## Output Structure

After successful build:

```
dist/
├── GChat-linux-x64/                      # Packaged app
│   ├── gchat                             # Executable binary
│   └── resources/
│       └── app.asar                      # Application code
└── installers/
    ├── GChat_amd64.deb                   # Debian package
    └── GChat-deb-SHA512.txt              # Checksum (if generated)
```

## Package Details

### Installation locations (after .deb install):
- **Binary**: `/usr/lib/GChat/gchat`
- **Icons**: `/usr/share/icons/hicolor/{size}/apps/gchat.png`
- **Desktop file**: `/usr/share/applications/gchat.desktop`
- **Symlink**: `/usr/bin/gchat` → `/usr/lib/GChat/gchat`

### .desktop file:
Generated automatically by electron-installer-debian:
```ini
[Desktop Entry]
Name=Google Chat
Exec=/usr/bin/gchat %U
Terminal=false
Type=Application
Icon=gchat
Categories=Social;Communication;Network;
```

Allows launching from:
- Application menu/launcher
- Command line: `gchat`
- File manager (via .desktop file)

### Package metadata:
- **Name**: gchat (lowercase, from productName)
- **Architecture**: amd64 (x86_64)
- **Section**: utils
- **Priority**: optional
- **Depends**: Automatically detected (libgconf-2-4, etc.)

### Scripts in package:
- **postinst**: (auto-generated) Registers icons, updates desktop database
- **prerm**: (auto-generated) Cleanup before removal
- **postrm**: Custom script from `scripts/post-remove.sh`

## Installation and Usage

### Install package:
```bash
sudo dpkg -i GChat_amd64.deb
# or
sudo apt install ./GChat_amd64.deb  # Resolves dependencies
```

### Launch app:
```bash
gchat                              # Command line
# or click icon in application menu
```

### Verify installation:
```bash
dpkg -l | grep gchat              # List installed package
dpkg -L gchat                     # List installed files
```

### Remove package:
```bash
sudo apt remove gchat             # Remove app, keep user data
sudo apt remove --purge gchat     # Remove app and user data
```

## Customization

### Change package name:
Edit `config.json`:
```json
"name": "gchat-electron"
```

### Add dependencies:
Edit `config.json`:
```json
"depends": [
  "libnotify4",
  "libappindicator3-1"
]
```

### Change installation directory:
Edit `config.json`:
```json
"bin": "my-app"                   // Executable name
```

### Add custom scripts:
Edit `config.json`:
```json
"scripts": {
  "postinst": "debian/scripts/post-install.sh",
  "prerm": "debian/scripts/pre-remove.sh",
  "postrm": "debian/scripts/post-remove.sh"
}
```

### Modify desktop file:
Edit `config.json`:
```json
"desktopTemplate": "debian/gchat.desktop.ejs"
```

Then create EJS template with custom fields.

## Troubleshooting

### "electron-installer-debian not found":
- Install: `npm install electron-installer-debian`
- Or add to `dependencies` instead of `optionalDependencies`

### "Source directory not found":
- Run `npm run pack:linux` first
- Check that `dist/GChat-linux-x64/` exists

### Icons not showing after install:
- Run: `sudo update-icon-cache /usr/share/icons/hicolor/`
- Or re-login (cache refresh)

### Permission errors during install:
- Use `sudo apt install` instead of `dpkg -i`
- Or fix dependencies: `sudo apt install -f`

### Post-removal script fails:
- Check script permissions: `chmod +x debian/scripts/post-remove.sh`
- View errors: `sudo apt remove --purge gchat 2>&1 | less`

### Wrong architecture:
- Package is x64/amd64 only
- For arm64: Change electron-packager arch and update config.json

## Distribution Considerations

### Repository hosting:
To create an APT repository:
1. Sign .deb with GPG key
2. Create Packages index: `dpkg-scanpackages . /dev/null | gzip > Packages.gz`
3. Host on web server
4. Users add repo: `sudo add-apt-repository "deb [trusted=yes] https://your-repo.com/ /"`

### Snap/Flatpak alternatives:
Consider modern packaging formats:
- **Snap**: Universal, sandboxed, auto-updates
- **Flatpak**: Universal, sandboxed, FreeDesktop standard
- **AppImage**: Single-file, no installation required

### Launchpad PPA:
For Ubuntu/Debian official repositories:
1. Create Launchpad account
2. Create PPA
3. Upload source package (not binary)
4. Launchpad builds for all Ubuntu versions

### Dependencies:
Current package doesn't specify explicit dependencies (relies on auto-detection).
Consider adding for better compatibility:
```json
"depends": [
  "libgtk-3-0",
  "libnotify4",
  "libnss3",
  "libxss1",
  "libxtst6",
  "libappindicator3-1"
]
```

## Post-removal Script Safety

The `post-remove.sh` script is designed to be safe:

1. **Idempotent**: Can run multiple times without error
2. **User-aware**: Detects correct home directory even under sudo
3. **Conditional**: Only runs on explicit purge
4. **Targeted**: Only removes app-specific files, never system files
5. **Logged**: Prints all actions for debugging

**What it removes:**
- `~/.config/GChat/` - App configuration and data
- `~/.config/autostart/GChat.desktop` - Autostart entry

**What it preserves:**
- System files
- Other applications' data
- User's personal files
