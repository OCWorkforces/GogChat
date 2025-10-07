# windows/

This directory contains build scripts and configuration for creating Windows installers.

## Overview

The Windows build process uses:
- **electron-packager**: Packages the app into a Windows executable
- **Inno Setup**: Creates a professional Windows installer (.exe)

Output: `GChat-setup-win-x64-{version}.exe` installer

## Files

### installer.js
Node.js script that orchestrates the Inno Setup build process.

**Process:**
1. Loads `package.json` to get current version
2. Reads `inno-setup.iss` template file
3. Replaces `{{appVersion}}` placeholder with actual version using `utility.js`
4. Writes updated template back to `inno-setup.iss`
5. Executes Inno Setup Compiler (ISCC.exe) with the .iss script
6. Captures and logs output from ISCC
7. Reports success or failure

**Usage:**
```bash
npm run build:windows
```
(Automatically runs `npm run pack:windows` first via `prepack:windows` script)

**ISCC.exe location:**
```
C:\Program Files (x86)\Inno Setup 6\ISCC.exe
```

**Output:**
Creates installer at `dist/installers/GChat-setup-win-x64-{version}.exe`

### inno-setup.iss
Inno Setup script template that defines the installer behavior and appearance.

**Template placeholders:**
- `{{appVersion}}`: Replaced with version from package.json at build time

**Key configurations:**

#### App Metadata
- **AppId**: `{E458AEFA-2577-4543-8554-F6335BC2D994}` (unique GUID for this app)
- **AppName**: "Google Chat Electron"
- **AppPublisher**: "CCWorkforce"
- **AppExeName**: "GChat.exe"

#### Installation Settings
- **DefaultDirName**: `{autopf}\Google Chat Electron` (Program Files\Google Chat Electron)
- **PrivilegesRequired**: `admin` (requires administrator rights)
- **Architecture**: x64 only (`ArchitecturesAllowed=x64`)
- **Compression**: LZMA2 with solid compression (maximum compression)

#### Features
- **License**: Shows LICENSE.txt during installation
- **Desktop icon**: Optional (unchecked by default)
- **Start Menu**: Creates shortcuts in Start Menu group
- **Uninstaller**: Automatically created with proper registry entries
- **Launch after install**: Option to run app immediately after installation

#### Files and Directories
- **Source**: `dist/GChat-win32-x64/*` (packaged app)
- **Destination**: Program Files directory
- **Flags**: `recursesubdirs` (includes all subdirectories and files)

#### Shortcuts Created
1. Start Menu group with:
   - App shortcut
   - Uninstall shortcut
2. Desktop icon (optional, via checkbox during install)

### utility.js
Helper module for template string replacement.

**Function:**
```javascript
replace(str, patterns)
```

Replaces `{{key}}` placeholders in string with values from patterns object.

**Example:**
```javascript
replace("Version: {{appVersion}}", { appVersion: "3.0.5" })
// Returns: "Version: 3.0.5"
```

Used by `installer.js` to inject version into Inno Setup script.

### setup-icon.ico
Icon file displayed during the installation process.

**Usage:**
- Shown in installer window title bar
- Displayed on installation progress screen
- Used for installer executable icon

**Referenced in** `inno-setup.iss`:
```
SetupIconFile=setup-icon.ico
```

## Prerequisites

### 1. Inno Setup
Must be installed on the build machine:
- **Download**: https://jrsoftware.org/isdl.php
- **Version**: 6.x
- **Install location**: `C:\Program Files (x86)\Inno Setup 6\`

**Note**: This limits Windows builds to Windows machines or Wine/cross-compilation setups.

### 2. Packaged App
Before building installer, package the app:
```bash
npm run pack:windows
```
This creates `dist/GChat-win32-x64/` directory with the app.

### 3. LICENSE.txt
The installer references `../LICENSE.txt`. Ensure a LICENSE.txt file exists at the repository root.

## Build Workflow

### Complete Windows build:
```bash
npm run pack:windows    # Package app (auto-run by build:windows)
npm run build:windows   # Create installer
```

The `build:windows` script automatically runs `pack:windows` via the `prepack:windows` hook in package.json.

### Step-by-step process:
1. **TypeScript compilation**: `npm run ts`
   - Compiles `src/` to `lib/`
2. **Packaging**: electron-packager
   - Creates `dist/GChat-win32-x64/` with executable and resources
   - Includes Node.js runtime, Electron, and all dependencies
3. **Installer creation**: Inno Setup
   - Reads `inno-setup.iss` (with version injected)
   - Compresses and bundles packaged app
   - Creates `dist/installers/GChat-setup-win-x64-{version}.exe`

## Output Structure

After successful build:

```
dist/
├── GChat-win32-x64/                                  # Packaged app
│   ├── GChat.exe                                     # Main executable
│   ├── resources/
│   │   └── app.asar                                  # Application code (compressed)
│   └── (Electron runtime files)
└── installers/
    └── GChat-setup-win-x64-{version}.exe             # Installer
```

## Inno Setup Details

### Installation Flow
1. User runs installer
2. Shows license agreement (LICENSE.txt)
3. Selects installation directory (default: Program Files)
4. Optional: Create desktop icon checkbox
5. Installs files to selected directory
6. Creates Start Menu shortcuts
7. Registers uninstaller in Windows registry
8. Optional: Launch app immediately

### Registry Entries
Inno Setup automatically creates registry entries for:
- **Uninstall information**: `HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{AppId}`
- Includes app name, version, publisher, uninstall command

### Uninstaller
Automatically generated and includes:
- Removal of all installed files
- Removal of Start Menu shortcuts
- Removal of desktop icon (if created)
- Removal of registry entries
- Optional: Remove user data (currently disabled)

## Customization

### Change installer appearance:
Edit `inno-setup.iss`:
```ini
WizardStyle=modern              ; Modern Windows 11 style
SetupIconFile=setup-icon.ico    ; Installer icon
```

### Add custom wizard pages:
Add `[Code]` section to `inno-setup.iss` with Pascal script.

### Change installation options:
Edit `[Tasks]` section:
```ini
[Tasks]
Name: "desktopicon"; Description: "Create Desktop Icon"; Flags: unchecked
Name: "quicklaunchicon"; Description: "Create Quick Launch Icon"; Flags: unchecked
```

### Include additional files:
Add to `[Files]` section:
```ini
Source: "README.txt"; DestDir: "{app}"; Flags: ignoreversion
```

### Add registry keys:
Add to `[Registry]` section:
```ini
Root: HKCU; Subkey: "Software\GChat"; ValueType: string; ValueName: "Version"; ValueData: "{#AppVersion}"
```

## Troubleshooting

### "ISCC.exe not found":
- Install Inno Setup 6 from https://jrsoftware.org/isdl.php
- Verify installation path: `C:\Program Files (x86)\Inno Setup 6\`
- Or update path in `installer.js` if installed elsewhere

### "Source directory not found":
- Run `npm run pack:windows` first
- Check that `dist/GChat-win32-x64/` exists

### "LICENSE.txt not found":
- Ensure LICENSE.txt exists at repository root
- Or remove/comment LicenseFile line in inno-setup.iss

### Version not updated in installer:
- Delete `inno-setup.iss` and regenerate
- Or manually update version in the file

### Installer fails silently:
- Check `dist/installers/Setup-*.log` for detailed error messages
- Inno Setup creates logs when `SetupLogging=yes` is enabled

### "Access denied" during install:
- Installer requires admin rights (`PrivilegesRequired=admin`)
- Right-click installer → "Run as administrator"

## Distribution Considerations

### Code Signing (not implemented):
For production releases, sign the installer:
```bash
signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com GChat-setup-win-x64-{version}.exe
```

Benefits:
- Removes Windows SmartScreen warnings
- Shows publisher name
- Increases user trust

### SmartScreen:
Unsigned installers trigger Windows SmartScreen:
- "Windows protected your PC" warning
- User must click "More info" → "Run anyway"
- Resolved by code signing

### Auto-updates:
Current setup does not include auto-update functionality. Consider:
- **electron-builder** (alternative to electron-packager) with built-in auto-update
- **Squirrel.Windows** for auto-update support
- Custom update server with manual download/install

### Silent installation:
Installer supports silent mode:
```bash
GChat-setup-win-x64-{version}.exe /SILENT        # Show progress
GChat-setup-win-x64-{version}.exe /VERYSILENT    # No UI
```

## Cross-platform Building

**Current limitation**: Must build on Windows due to Inno Setup requirement.

**Alternatives for Linux/Mac builds**:
1. **Wine**: Run ISCC.exe through Wine (complex, unreliable)
2. **electron-builder**: Replace electron-packager + Inno Setup with electron-builder (supports all platforms)
3. **CI/CD**: Use Windows runner in GitHub Actions/GitLab CI
4. **Virtual machine**: Build in Windows VM on Mac/Linux host
