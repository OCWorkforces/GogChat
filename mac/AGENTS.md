# mac/ — macOS DMG Build Support

**Generated:** 2026-04-18 | **Commit:** 95610f8

DMG build support. Pipeline managed by `build-macOS-dmg.sh` at project root, which calls `electron-builder`.

## WHERE TO LOOK

| Task | Command | Notes |
| --- | --- | --- |
| Build DMG | `bun run build:mac` | Calls `build-macOS-dmg.sh --environment production` (arm64) |
| Build DMG (dev) | `bun run build:mac:dev` | `--environment develop` |
| Pack only (no DMG) | `bun run pack:mac:arm64` | `.app` without DMG |
| DMG config | `electron-builder.yml` | Compression, icon, window layout |
| Build logic | `build-macOS-dmg.sh` | clean → build → package → checksum |
| Code signing | `--enable-code-sign` flag | Requires CSC_LINK + credentials |

## BUILD PIPELINE

```
build-macOS-dmg.sh:
  1. Unmount stale DMG volumes
  2. Clean ./dist and ./lib
  3. bun run build:prod (Rsbuild dual-build → lib/)
  4. export BUILD_ENV="${ENVIRONMENT}"
  5. bunx electron-builder --mac --arm64 --config electron-builder.yml
```

## ARTIFACT NAMING

`${productName}-v${version}-macOS-${arch}-${env.BUILD_ENV}.${ext}` — e.g. `GogChat-v3.7.6-macOS-arm64-production.dmg`.

**Do not call electron-builder directly** without exporting `BUILD_ENV` — artifact names will be malformed.

## CODE SIGNING

Opt-in via `--enable-code-sign`. Without it, `CSC_IDENTITY_AUTO_DISCOVERY=false` and signing is skipped.
With flag: merges `electron-builder.yml` + `electron-builder.sign.yml` (adds hardenedRuntime + entitlements).

**Hardened Runtime Team ID mismatch**: Without signing, hardenedRuntime causes ad-hoc signature mismatch with pre-signed Electron Framework. Dual-config approach handles this automatically.

## ANTI-PATTERNS

- **NEVER** call `electron-builder` without `export BUILD_ENV=...`
- **NEVER** modify a DMG while mounted
- **NEVER** skip `-force` on `hdiutil detach`
- **NEVER** run pack steps without `bun run build:prod` first
