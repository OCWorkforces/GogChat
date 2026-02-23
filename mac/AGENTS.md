# mac/ — macOS DMG Build Support

**Updated:** 2026-02-23
**Branch:** upstream

## OVERVIEW

This directory contains support files for macOS DMG builds. The build pipeline is managed entirely by `build-macOS-dmg.sh` at the project root, which internally calls `electron-builder`.

Legacy manual DMG scripts (`installer-dmg.sh`, `installer-arm-dmg.sh`) have been removed. All DMG creation is now handled by electron-builder.

## STRUCTURE

```
mac/
└── AGENTS.md   # This file
```

## WHERE TO LOOK

| Task                  | File / Command                              | Notes                                            |
| --------------------- | ------------------------------------------- | ------------------------------------------------ |
| Build DMG (both)      | `npm run build:mac`                         | Calls `build-macOS-dmg.sh --environment production` |
| Build DMG (Intel)     | `npm run build:mac:x64`                     | x64 only                                         |
| Build DMG (ARM)       | `npm run build:mac:arm64`                   | arm64 only                                       |
| Dev build (both)      | `npm run build:mac:dev`                     | `--environment develop`                          |
| Pack only (no DMG)    | `npm run pack:mac:x64` / `pack:mac:arm64`   | Creates `.app` without DMG                       |
| DMG configuration     | `electron-builder.yml`                      | Compression, icon, window layout, artifact names |
| Build logic           | `build-macOS-dmg.sh`                        | Bash script: clean → build → package → checksum  |
| Artifact naming       | `electron-builder.yml` `artifactName`       | Uses `${env.BUILD_ENV}` for environment suffix   |
| Code signing          | `build-macOS-dmg.sh` + `electron-builder.yml` | See notarization section below                 |

## COMMANDS

```bash
# From project root

# Production DMG (both architectures)
npm run build:mac

# Production DMG (single architecture)
npm run build:mac:x64
npm run build:mac:arm64

# Dev DMG (for testing, uses --environment develop)
npm run build:mac:dev

# Pack only (creates .app bundle, no DMG) — used for smoke-testing packaging
npm run pack:mac:x64
npm run pack:mac:arm64
```

## HOW THE BUILD PIPELINE WORKS

```
build-macOS-dmg.sh
  ├── 1. Unmount any stale DMG volumes (hdiutil detach)
  ├── 2. Clean ./dist and ./lib
  ├── 3. npm run build:prod  (Rsbuild: ESM main + CJS preload → lib/)
  ├── 4. export BUILD_ENV="${ENVIRONMENT}"
  └── 5. npx electron-builder --mac --{arch} --config electron-builder.yml
           └── Creates: dist/Google Chat-v{VERSION}-macOS-{arch}-{BUILD_ENV}.dmg
```

## ARTIFACT NAMING

Artifacts follow this pattern (defined in `electron-builder.yml`):

```
${productName}-v${version}-macOS-${arch}-${env.BUILD_ENV}.${ext}
```

Example: `Google Chat-v3.3.6-macOS-x64-production.dmg`

`BUILD_ENV` is exported by `build-macOS-dmg.sh` before invoking electron-builder. **Do not call electron-builder directly without exporting this variable** — artifact names will be malformed.

## COMPRESSION

`electron-builder.yml` uses `compression: maximum` (LZMA). Produces 10-20% smaller DMGs than `normal`.

## CODE SIGNING / NOTARIZATION

Code signing and notarization require an Apple Developer ID certificate. The build script sets `CSC_IDENTITY_AUTO_DISCOVERY=false` by default to skip signing during local development.

To enable signing, set the following environment variables before running the build:

```bash
export CSC_LINK="/path/to/Developer ID Application cert.p12"
export CSC_KEY_PASSWORD="your-cert-password"
export APPLE_ID="your@appleid.com"
export APPLE_TEAM_ID="YOURTEAMID"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
```

See `scripts/notarize.js` for the notarization hook (invoked by electron-builder's `afterSign`).

## ANTI-PATTERNS

- **NEVER** call `electron-builder` directly without `export BUILD_ENV=...` — artifact names will contain empty env segment
- **NEVER** modify a DMG while it is mounted — will get "Resource busy" error
- **NEVER** skip `-force` on `hdiutil detach` — Finder may hold volume handles
- **NEVER** run pack steps without building first (`npm run build:prod`) — stale or missing `lib/` output
