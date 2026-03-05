# OpenGChat — Project Knowledge Base

**Generated:** 2026-02-24
**Commit:** 563a52c
**Branch:** upstream

## OVERVIEW

Electron desktop wrapper for Google Chat (`https://mail.google.com/chat/u/0`). TypeScript throughout. macOS only (Apple Silicon arm64). Built with Rsbuild (Rspack). **NOT a typical Electron app** — dual-build system outputs ESM for main process and CJS for preload (required by `sandbox: true`). Electron 40.6.0 / Node.js 24.13.0 / Chromium-based.

## STRUCTURE

```
OpenGChat/
├── src/
│   ├── main/           # Electron main process (Node.js env, ESM output)
│   │   ├── index.ts    # App entry: feature manager with phased init (security→critical→ui→deferred)
│   │   ├── windowWrapper.ts  # BrowserWindow factory (sandbox:true, contextIsolation:true)
│   │   ├── config.ts   # AES-256-GCM encrypted electron-store
│   │   ├── features/   # 18 lazy-loaded feature modules
│   │   └── utils/      # 13 security/perf utility modules
│   ├── preload/        # contextBridge scripts (CJS output — sandbox: true)
│   ├── shared/         # Cross-process contracts: types, constants, validators
│   ├── offline/        # Standalone offline page (no IPC access)
│   └── urls.ts         # Google Chat URL constants
├── scripts/
│   ├── build-rsbuild.js  # Dual-build (main=ESM, preload=CJS)
│   ├── lint.sh         # Combined ESLint + Prettier
│   └── notarize.js     # Apple notarization hook
├── rsbuild.config.js   # ESM config; preload build overrides to CJS
├── tests/              # Vitest (unit) + Playwright (integration/e2e/perf)
├── mac/                # DMG build documentation → see mac/AGENTS.md
├── resources/          # Icons (.icns, .png, .svg)
└── lib/                # Build output (gitignored)
    ├── main/           # ESM .js files
    ├── preload/        # CJS .js files
    ├── chunks/         # Dynamic import chunks (deferred features)
    └── offline/
```

## WHERE TO LOOK

| Task              | Location                                         | Notes                          |
| ----------------- | ------------------------------------------------ | ------------------------------ |
| App init order    | `src/main/index.ts`                              | Security → critical → deferred |
| Add new feature   | `src/main/features/`                             | See `features/AGENTS.md`       |
| IPC channel names | `src/shared/constants.ts`                        | `IPC_CHANNELS` const           |
| Input validation  | `src/shared/validators.ts`                       | All IPC must go through here   |
| Config schema     | `src/shared/types.ts` + `src/main/config.ts`     | Update both                    |
| window.gchat API  | `src/preload/index.ts` + `src/shared/types.ts`   | `GChatBridgeAPI`               |
| Build system      | `scripts/build-rsbuild.js` + `rsbuild.config.js` | Dual-pass                      |
| DMG packaging     | `mac/`                                           | See `mac/AGENTS.md`            |
| Test helpers      | `tests/helpers/electron-test.ts`                 | Playwright fixtures            |
| Electron mocks    | `tests/mocks/electron.ts`                        | For unit tests                 |
| Log files         | `~/Library/Logs/GChat/main.log`                  | macOS path                     |

## CRITICAL BUILD ARCHITECTURE

Two separate Rsbuild passes in `scripts/build-rsbuild.js`:

1. **Main build** — ESM, `electron-main` target, all `src/**/*.ts` except preload
2. **Preload build** — CJS, `electron-renderer` target, `cleanDistPath: false`

**`cleanDistPath: false` on preload is mandatory** — without it, pass 2 wipes pass 1's output.

Preload MUST be CJS because `sandbox: true` in BrowserWindow prevents ESM module loading.

## INIT ORDER IN `src/main/index.ts`

```
1. setupCertificatePinning()      ← BEFORE any network (app not ready yet)
2. reportExceptions()             ← catch startup errors
3. enforceSingleInstance()        ← exits if duplicate
4. app.whenReady() — critical path:
   userAgent → windowWrapper → offlineHandlers → connectivity
   → trayIcon → appMenu → singleInstance restore → windowState
   → externalLinks → notifications → badgeIcon → closeToTray
5. setImmediate() — deferred:
   openAtLogin → appUpdates → contextMenu → firstLaunch → badgeIcons
```

## CONVENTIONS

- **Package manager**: `bun` only (no yarn/pnpm/npm)
- **Node version**: 24.13.0+ (engineStrict enforced)
- **New source files**: Zero config needed — build auto-discovers `*.ts` in `src/`
- **New settings**: Update `StoreType` in `shared/types.ts` → add schema in `config.ts`
- **IPC handler pattern**: rate limit → validate → handle → catch (see `src/main/AGENTS.md`)
- **Feature priority**: SECURITY→CRITICAL→UI→DEFERRED phases via featureManager
- **Singletons**: All util managers expose `getXxx()` factory + `destroyXxx()` cleanup
- **TypeScript strict**: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`

## ANTI-PATTERNS

- **Never** skip rate limiting in IPC handlers
- **Never** use `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never** add feature logic directly in `index.ts` — create `features/myFeature.ts`
- **Never** hardcode IPC channel strings — use `IPC_CHANNELS` from `shared/constants.ts`
- **Never** call `setInterval`/`setTimeout` without tracking via `resourceCleanup.ts`
- **Never** modify preload build to output ESM — `sandbox: true` requires CJS
- **Never** remove `cleanDistPath: false` from preload build config
- **Never** open external URLs with `shell.openExternal()` without `validateExternalURL()` first
- **Never** use bare `setTimeout`/`setInterval` — always use `createTrackedTimeout`/`createTrackedInterval`

## SECURITY LAYERS (defense-in-depth)

- `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false` in BrowserWindow
- All IPC: `rateLimiter.isAllowed()` + `validators.ts` + try-catch
- Certificate pinning for all Google domains (initialized at module level, before app.ready)
- AES-256-GCM encrypted `electron-store` for config
- URL whitelist enforcement for navigation + `shell.openExternal()`
- CSP via `webRequest.onHeadersReceived` — strips COEP/COOP headers
- Permission handler: only notifications, media, mediaKeySystem, geolocation

## COMMANDS

````bash
```bash
bun install
bun run build:dev      # dev build (~0.25s)
bun run build:prod     # prod build (~0.31s)
bun run build:watch    # watch mode
bun run build:analyze  # bundle analysis (ANALYZE=true)
bun run start          # prod build + launch Electron
bun run test           # all tests (Vitest + Playwright)
bun run test:run       # Vitest single run
bun run test:coverage  # coverage report
bun run build:mac      # ARM64 DMG (production)
````

## NOTES

- Platform: **macOS only** (Apple Silicon arm64; M1 or later)
- Electron 40.6.0 / Node.js 24.13.0 / Chromium-based
- Dynamic imports in `index.ts` → deferred features land in `lib/chunks/` (not `lib/main/`)
- `overrideNotifications.ts` preload loaded with `contextIsolation: false` (intentional exception)
- Google Chat DOM selectors in `shared/constants.ts` `SELECTORS` — may break if Google updates HTML
- Config encrypted at `~/Library/Application Support/GChat/` (macOS)
- Build history tracked in `.build-history.json` (last 20 builds)
- Unit tests colocated with source (`*.test.ts`); integration/e2e in `tests/`

## COMPLEXITY CENTERS (500+ lines)

| File                                | Lines | Purpose                                      |
| ----------------------------------- | ----- | -------------------------------------------- |
| `src/main/index.ts`                 | 619   | App entry, feature registration, phased init |
| `src/main/utils/featureManager.ts`  | 566   | Feature lifecycle, dependency resolution     |
| `tests/mocks/electron.ts`           | 546   | Complete Electron mock for unit tests        |
| `src/main/utils/resourceCleanup.ts` | 442   | Tracked intervals/timeouts/listeners         |
