# scripts/ — Build & Development Tools

**Generated:** 2026-03-18
**Parent docs:** `../AGENTS.md` (project)

## OVERVIEW

Build system, linting, and development tooling. The dual-build architecture is the most critical component — main process outputs ESM, preload outputs CJS (required by `sandbox: true`).

## FILES

| File                                    | Purpose                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `build-rsbuild.js`                      | Dual-build orchestrator: ESM main + CJS preload                  |
| `lint.sh`                               | Combined ESLint + Prettier runner                                |
| `notarize.cjs`                          | Apple notarization hook for electron-builder `afterSign`         |
| `after-pack.cjs`                        | electron-builder `afterPack` hook: strips debug symbols, removes non-EN locales from Electron Framework, reports final bundle size |
| `remove-locales.js`                     | Removes non-EN locales from asar for size reduction              |
| `generate-google-chat-icons.mjs`        | Generates all icon variants (tray/normal/badge/offline PNGs + `mac.icns`) using `sharp` + SVG path math |
| `install-hooks.sh`                      | Installs git pre-push hook                                       |
| `hooks/pre-push`                        | Git hook that blocks push if lint fails                          |

## CRITICAL: DUAL-BUILD ARCHITECTURE

`build-rsbuild.js` runs TWO Rsbuild passes:

```
Pass 1: Main process (ESM)
  - Target: electron-main
  - Output: lib/main/*.js (ESM modules)
  - Code splitting: lib/chunks/*.chunk.js for deferred features

Pass 2: Preload scripts (CJS)
  - Target: electron-renderer
  - Output: lib/preload/*.js (CommonJS)
  - MANDATORY: cleanDistPath: false (prevents wiping Pass 1 output)
```

**Why CJS for preload?** Electron's `sandbox: true` blocks ESM module loading. Preload scripts MUST be CommonJS.

## BUILD SCRIPT DETAILS (`build-rsbuild.js`)

**Entry Point Scanning:**

- Scans `src/**/*.ts` recursively
- Excludes `*.test.ts`, `*.spec.ts`
- Splits entries: `src/preload/**` → preload build, everything else → main build

**Watch Mode:**

```bash
bun run build:watch  # Starts both builds with watch enabled
```

**Build History:**

- `.build-history.json` tracks last 20 builds
- Records: size, chunk count, individual chunk sizes, trends
- Shows diff from previous build

## LINTING (`lint.sh`)

```bash
./scripts/lint.sh           # Check only
./scripts/lint.sh --fix     # Auto-fix issues
```

Runs ESLint + Prettier. Pre-push hook calls this automatically.

## NOTARIZATION (`notarize.cjs`)

Called by electron-builder's `afterSign` hook. Requirements:

- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

Gracefully skips when `CSC_IDENTITY_AUTO_DISCOVERY=false` (local dev builds).

## AFTER-PACK HOOK (`after-pack.cjs`)

Called by electron-builder's `afterPack` hook. **macOS ARM64 only** — skips silently on other architectures.

Operations (in order):
1. Remove `.DS_Store` and AppleDouble `._*` files
2. Strip debug symbols from Electron Framework binary (`strip -x -S`)
3. Strip 4 Electron Helper app binaries
4. Strip main executable
5. Remove non-`en.lproj` locale folders from Electron Framework resources
6. Report final `.app` bundle size

Arch detection: `context.arch === 3` (enum) or `"arm64"` (string).

## ICON GENERATOR (`generate-google-chat-icons.mjs`)

Standalone ESM script. Run manually when icon assets need regeneration.

```bash
bun scripts/generate-google-chat-icons.mjs
```

Outputs:
- `resources/icons/tray/iconTemplate.png` + `@2x.png` — macOS Template (monochrome, system-tinted)
- `resources/icons/normal/{16,32,48,64,256}.png` + `scalable.svg` + `mac.icns`
- `resources/icons/badge/{16,32,48,64,256}.png` — red notification dot variant
- `resources/icons/offline/{16,32,48,64,256}.png` — greyed-out variant

Uses `sharp` for SVG→PNG rasterization and macOS `iconutil` for `.icns` generation (macOS only — `.icns` step skipped elsewhere).

## COMMANDS

```bash
bun run build:dev      # Dev build (~0.25s)
bun run build:prod     # Production build (~0.31s)
bun run build:watch    # Watch mode
bun run build:analyze  # Bundle analysis (ANALYZE=true)
bun run lint:all       # ESLint + Prettier check
bun run lint:all:fix   # Auto-fix linting issues
bun run hooks:install  # Install git pre-push hook
```

## ANTI-PATTERNS

- **NEVER** remove `cleanDistPath: false` from preload build config — wipes main output
- **NEVER** change preload output to ESM — sandbox:true requires CJS
- **NEVER** run electron-builder without building first — stale lib/ causes runtime errors
- **NEVER** skip `--fix` when lint fails before push — hook blocks push
