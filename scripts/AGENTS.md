# scripts/ — Build & Development Tools

**Generated:** 2026-04-30 | **Commit:** 315722d

Build system, linting, and development tooling. Dual-build architecture is the most critical component — main outputs ESM, preload outputs CJS (required by `sandbox: true`).

## FILES

| File                             | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `build-rsbuild.js`               | Dual-build orchestrator: ESM main + CJS preload        |
| `lint.sh`                        | Combined ESLint + Prettier runner (uses `bunx`)        |
| `notarize.cjs`                   | Apple notarization hook (electron-builder `afterSign`) |
| `after-pack.cjs`                 | ARM64 binary stripping + locale removal                |
| `remove-locales.js`              | Removes non-EN locales from asar                       |
| `generate-google-chat-icons.mjs` | Generates all icon variants via `sharp` + SVG math     |
| `install-hooks.sh`               | Installs git pre-push hook                             |
| `hooks/pre-push`                 | Blocks push if lint fails (no `--fix` — user must fix) |

## DUAL-BUILD ARCHITECTURE

`build-rsbuild.js` runs TWO Rsbuild passes:

1. **Main** — ESM, `electron-main` target, output `lib/main/*.js` + `lib/chunks/*.chunk.js`
2. **Preload** — CJS, `electron-renderer` target, `cleanDistPath: false` (MANDATORY — prevents wiping pass 1)

Pass 1 also includes `copyOfflineAssets()` which copies `src/offline/index.html` + `index.css` to `lib/offline/`. Entry scanning: all `src/**/*.ts` except `*.test.ts`; preload split by `src/preload/**` path.

## BUILD HISTORY

`.build-history.json` tracks last 20 builds (size, chunk count, trends, diff from previous).

## NOTARIZATION

Requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`. Uses `notarytool` (NOT `altool`). Bundle ID: `com.ocworkforcess.${appName.toLowerCase()}`. Gracefully skips when `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## AFTER-PACK HOOK

macOS ARM64 only. Strips debug symbols from Electron Framework + 4 Helpers + main executable. Removes non-`en.lproj`/`en-US.lproj`/`en_US.lproj` locales. Reports final bundle size in MB.

## ICON GENERATOR

`bun scripts/generate-google-chat-icons.mjs` — outputs `resources/icons/{tray,normal,badge,offline}/*.png` + `mac.icns` via `sharp` + `iconutil`. Uses `APP_GEOMETRY` + `TRAY_GEOMETRY` constants for SVG math, `buildBadgeDot()` for notification dot, `buildMultiColorContent()` for 4-color treatment, `generateIcns()` (macOS-only via `iconutil`).

## ANTI-PATTERNS

- **NEVER** remove `cleanDistPath: false` from preload config
- **NEVER** change preload to ESM — sandbox requires CJS
- **NEVER** run electron-builder without building first
- **NEVER** skip `--fix` when lint fails before push
- **NEVER** modify `copyOfflineAssets()` output paths — `src/offline/index.html` references `../../lib/offline/index.js`
