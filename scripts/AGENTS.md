# scripts/ — Build & Development Tools

**Generated:** 2026-03-11
**Parent docs:** `../AGENTS.md` (project)

## OVERVIEW

Build system, linting, and development tooling. The dual-build architecture is the most critical component — main process outputs ESM, preload outputs CJS (required by `sandbox: true`).

## FILES

| File                | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `build-rsbuild.js`  | Dual-build orchestrator: ESM main + CJS preload        |
| `lint.sh`           | Combined ESLint + Prettier runner                      |
| `notarize.js`       | Apple notarization hook for electron-builder afterSign |
| `remove-locales.js` | Removes non-EN locales from asar for size reduction    |
| `install-hooks.sh`  | Installs git pre-push hook                             |
| `hooks/pre-push`    | Git hook that blocks push if lint fails                |

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

## NOTARIZATION (`notarize.js`)

Called by electron-builder's `afterSign` hook. Requirements:

- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`

Gracefully skips when `CSC_IDENTITY_AUTO_DISCOVERY=false` (local dev builds).

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
