# mac/ — macOS DMG Build Scripts

**Generated:** 2026-02-22
**Commit:** c51faed
**Branch:** upstream

## OVERVIEW

DMG installers for GChat Electron app. Intel x64 + Apple Silicon arm64.

## STRUCTURE

```
mac/
├── installer-dmg.sh      # Intel x64 DMG
├── installer-arm-dmg.sh  # Apple Silicon arm64 DMG
└── CLAUDE.md             # Full docs (hdiutil details, troubleshooting)
```

## WHERE TO LOOK

| Task            | File                   | Notes                                     |
| --------------- | ---------------------- | ----------------------------------------- |
| Build Intel DMG | `installer-dmg.sh`     | Requires `dist/Google Chat-darwin-x64/`   |
| Build ARM DMG   | `installer-arm-dmg.sh` | Requires `dist/Google Chat-darwin-arm64/` |
| hdiutil options | `CLAUDE.md`            | Compression, format, troubleshooting      |
| Code signing    | `CLAUDE.md`            | Notarization, universal binary            |

## COMMANDS

```bash
# Prerequisites (from project root)
npm run pack:mac        # Creates Intel .app bundle
npm run pack:mac-arm    # Creates ARM .app bundle

# Run scripts directly
./mac/installer-dmg.sh      # Intel DMG → dist/Google Chat-v{version}.dmg
./mac/installer-arm-dmg.sh  # ARM DMG → dist/Google Chat-v{version}-arm64.dmg
```

## CONVENTIONS

- **Version extraction**: `grep '"version"' package.json | sed` — requires `"version": "x.y.z"` format
- **Output naming**: `Google Chat-v{VERSION}.dmg` / `Google Chat-v{VERSION}-arm64.dmg`
- **Volume name**: `Google Chat {VERSION}`
- **DMG size**: 500MB initial, compressed to actual
- **Compression**: zlib-level=9 (maximum)

## ANTI-PATTERNS

- **NEVER** run scripts without `npm run pack:*` first — `.app` bundle must exist
- **NEVER** modify DMG while mounted — will get "Resource busy"
- **NEVER** skip `-force` on unmount — Finder may hold handles

## OUTPUT

```
dist/
├── Google Chat-v{version}.dmg        # Intel
└── Google Chat-v{version}-arm64.dmg  # Apple Silicon
```

## NOTES

- Scripts run from project root (use `./mac/script.sh` or `npm run`)
- Applications symlink enables drag-to-install UX
- Code signing/notarization NOT implemented — see CLAUDE.md for manual steps
