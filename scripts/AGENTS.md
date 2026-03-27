# scripts/ — Build & Development Tools

**Generated:** 2026-03-27

Build system, linting, and development tooling. Dual-build architecture is the most critical component — main outputs ESM, preload outputs CJS (required by `sandbox: true`).

## FILES

| File                             | Purpose                                                |
| -------------------------------- | ------------------------------------------------------ |
| `build-rsbuild.js`               | Dual-build orchestrator: ESM main + CJS preload        |
| `lint.sh`                        | Combined ESLint + Prettier runner                      |
| `notarize.cjs`                   | Apple notarization hook (electron-builder `afterSign`) |
| `after-pack.cjs`                 | ARM64 binary stripping + locale removal                |
| `remove-locales.js`              | Removes non-EN locales from asar                       |
| `generate-google-chat-icons.mjs` | Generates all icon variants via `sharp` + SVG math     |
| `install-hooks.sh`               | Installs git pre-push hook                             |
| `hooks/pre-push`                 | Blocks push if lint fails                              |

## DUAL-BUILD ARCHITECTURE

`build-rsbuild.js` runs TWO Rsbuild passes:

1. **Main** — ESM, `electron-main` target, output `lib/main/*.js` + `lib/chunks/*.chunk.js`
2. **Preload** — CJS, `electron-renderer` target, `cleanDistPath: false` (MANDATORY — prevents wiping pass 1)

Preload MUST be CJS because `sandbox: true` blocks ESM. Entry scanning: all `src/**/*.ts` except `*.test.ts`; preload split by `src/preload/**` path.

## BUILD HISTORY

`.build-history.json` tracks last 20 builds (size, chunk count, trends, diff from previous).

## NOTARIZATION

Requires `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`. Gracefully skips when `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## AFTER-PACK HOOK

macOS ARM64 only. Strip debug symbols from Electron Framework + 4 Helpers + main executable. Remove non-`en.lproj` locale folders.

## ICON GENERATOR

`bun scripts/generate-google-chat-icons.mjs` — outputs `resources/icons/{tray,normal,badge,offline}/*.png` + `mac.icns` via `sharp` + `iconutil`.

## ANTI-PATTERNS

- **NEVER** remove `cleanDistPath: false` from preload config
- **NEVER** change preload to ESM — sandbox requires CJS
- **NEVER** run electron-builder without building first
- **NEVER** skip `--fix` when lint fails before push
