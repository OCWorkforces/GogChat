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
| Build DMG (both)      | `bun run build:mac`                         | Calls `build-macOS-dmg.sh --environment production` |
| Build DMG (Intel)     | `bun run build:mac:x64`                     | x64 only                                         |
| Build DMG (ARM)       | `bun run build:mac:arm64`                   | arm64 only                                       |
| Dev build (both)      | `bun run build:mac:dev`                     | `--environment develop`                          |
| Pack only (no DMG)    | `bun run pack:mac:x64` / `pack:mac:arm64`   | Creates `.app` without DMG                       |
| DMG configuration     | `electron-builder.yml`                      | Compression, icon, window layout, artifact names |
| Build logic           | `build-macOS-dmg.sh`                        | Bash script: clean → build → package → checksum  |
| Artifact naming       | `electron-builder.yml` `artifactName`       | Uses `${env.BUILD_ENV}` for environment suffix   |
| Code signing          | `build-macOS-dmg.sh` + `electron-builder.yml` | See notarization section below                 |

## COMMANDS

```bash
# From project root

# Production DMG (both architectures)
bun run build:mac

# Production DMG (single architecture)
bun run build:mac:x64
bun run build:mac:arm64

# Dev DMG (for testing, uses --environment develop)
bun run build:mac:dev

# Pack only (creates .app bundle, no DMG) — used for smoke-testing packaging
bun run pack:mac:x64
bun run pack:mac:arm64
```

## HOW THE BUILD PIPELINE WORKS

```
build-macOS-dmg.sh
  ├── 1. Unmount any stale DMG volumes (hdiutil detach)
  ├── 2. Clean ./dist and ./lib
  ├── 3. bun run build:prod  (Rsbuild: ESM main + CJS preload → lib/)
  ├── 4. export BUILD_ENV="${ENVIRONMENT}"
  └── 5. bunx electron-builder --mac --{arch} --config electron-builder.yml
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
Code signing is **opt-in** via the `--enable-code-sign` flag. Without it, `CSC_IDENTITY_AUTO_DISCOVERY=false` is always set and signing is skipped — safe for local development and CI without credentials.

```bash
# Without flag: signing skipped (default)
bash build-macOS-dmg.sh --environment production --arch x64
# → ⚠ Code signing: disabled (pass --enable-code-sign to enable)

# With flag: signing attempted (requires CSC_LINK + credentials)
bash build-macOS-dmg.sh --environment production --enable-code-sign
```

To enable signing, set the following environment variables **before** passing `--enable-code-sign`:

```bash
export CSC_LINK="/path/to/Developer ID Application cert.p12"
export CSC_KEY_PASSWORD="your-cert-password"
export APPLE_ID="your@appleid.com"
export APPLE_TEAM_ID="YOURTEAMID"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
```

See `scripts/notarize.js` for the notarization hook (invoked by electron-builder's `afterSign`).


## HARDENED RUNTIME AND TEAM ID MISMATCH

`hardenedRuntime: true` requires proper code signing. The Electron Framework comes pre-signed with Apple's platform Team ID. If you enable hardened runtime without code signing, the app binary gets an ad-hoc signature (no Team ID), causing a mismatch:

```
Termination Reason: Namespace DYLD, Code 1, Library missing
Library not loaded: @rpath/Electron Framework.framework/Electron Framework
Reason: code signature ... not valid for use in process:
        mapping process and mapped file (non-platform) have different Team IDs
```

The build script handles this automatically using a dual-config approach:
- **With `--enable-code-sign`**: Merges `electron-builder.yml` + `electron-builder.sign.yml` (adds hardenedRuntime + entitlements)
- **Without flag**: Uses only `electron-builder.yml` (no hardenedRuntime, avoids Team ID mismatch)

The `electron-builder.sign.yml` file contains only the code signing extensions:
```yaml
mac:
  hardenedRuntime: true
  entitlements: entitlements.mac.plist
  entitlementsInherit: entitlements.mac.inherit.plist
```

## ANTI-PATTERNS

- **NEVER** call `electron-builder` directly without `export BUILD_ENV=...` — artifact names will contain empty env segment
- **NEVER** modify a DMG while it is mounted — will get "Resource busy" error
- **NEVER** skip `-force` on `hdiutil detach` — Finder may hold volume handles
- **NEVER** run pack steps without building first (`bun run build:prod`) — stale or missing `lib/` output
