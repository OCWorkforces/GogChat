# GogChat — Project Knowledge Base

**Generated:** 2026-03-25
**Commit:** c0f61d9
**Branch:** electrobun-engine

## OVERVIEW

Electron desktop wrapper for GogChat (`https://mail.google.com/chat/u/0`). TypeScript throughout. macOS only (Apple Silicon arm64). Built with Rsbuild (Rspack). **NOT a typical Electron app** — dual-build system outputs ESM for main process and CJS for preload (required by `sandbox: true`). Supports **multi-account sessions** via per-account BrowserWindow partitions. Electron 41 / Node.js 22+ / Chromium-based.

## STRUCTURE

```
GogChat/
, 
├── src/
│   ├── main/           # Electron main process (Node.js env, ESM output)
│   │   ├── index.ts    # App entry: featureManager + phased init (security→critical→ui→deferred)
│   │   ├── windowWrapper.ts  # BrowserWindow factory with partition support
│   │   ├── config.ts   # AES-256-GCM encrypted electron-store (SafeStorage-backed)
│   │   ├── features/   # 20 lazy-loaded feature modules
│   │   └── utils/      # 15 security/perf/utility modules
│   ├── preload/        # contextBridge scripts (CJS output — sandbox: true)
│   ├── shared/         # Cross-process contracts: types, constants, validators
│   ├── environment.ts  # Frozen app config (isDev, appUrl, logoutUrl)
│   ├── urls.ts         # GogChat URL constants
│   └── offline/        # Standalone offline fallback page (no IPC access)
├── scripts/
│   ├── build-rsbuild.js  # Dual-build (main=ESM, preload=CJS)
│   ├── lint.sh         # Combined ESLint + Prettier
│   ├── notarize.cjs    # Apple notarization hook
│   └── after-pack.cjs  # ARM64 binary stripping + locale removal
├── rsbuild.config.js   # ESM config; preload build overrides to CJS
├── .github/workflows/  # PR checks (typecheck+test) + release builds
├── tests/              # Vitest (unit) + Playwright (integration/e2e/performance)
├── mac/                # DMG build documentation → see mac/AGENTS.md
├── resources/          # Icons (.icns, .png, .svg)
└── lib/                # Build output (gitignored)
    ├── main/           # ESM .js files
    ├── preload/        # CJS .js files
    ├── chunks/         # Dynamic import chunks (deferred features)
    └── offline/
```

## WHERE TO LOOK

| Task               | Location                                         | Notes                           |
| ------------------ | ------------------------------------------------ | ------------------------------- |
| App init order     | `src/main/index.ts`                              | Security → critical → deferred  |
| Multi-account mgr  | `src/main/utils/accountWindowManager.ts`         | Per-account windows + bootstrap |
| Add new feature    | `src/main/features/`                             | See `features/AGENTS.md`        |
| IPC channel names  | `src/shared/constants.ts`                        | `IPC_CHANNELS` const            |
| Input validation   | `src/shared/validators.ts`                       | All IPC must go through here    |
| Config schema      | `src/shared/types.ts` + `src/main/config.ts`     | Update both                     |
| Encryption keys    | `src/main/utils/encryptionKey.ts`                | SafeStorage + legacy migration  |
| window.gogchat API | `src/preload/index.ts` + `src/shared/types.ts`   | `GogChatBridgeAPI`              |
| Build system       | `scripts/build-rsbuild.js` + `rsbuild.config.js` | Dual-pass                       |
| CI/CD              | `.github/workflows/`                              | pr-check + release              |
| DMG packaging      | `mac/`                                           | See `mac/AGENTS.md`             |
| Test helpers       | `tests/helpers/electron-test.ts`                 | Playwright fixtures             |
| Electron mocks     | `tests/mocks/electron.ts`                        | For unit tests                  |
| Log files          | `~/Library/Logs/GogChat/main.log`                | macOS path                      |

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
4. featureManager.registerAll([...])  ← register all 20 features with phase + lazy import
5. setupDeepLinkListener()        ← before app.ready (open-url event)
6. app.whenReady():
   initializeStore() → initializeErrorHandler()
   featureManager.initializePhase('security') → 'critical'
   initializeStore()              ← re-init for SafeStorage (requires app.ready)
   accountWindowManager → createAccountWindow(url, 0) → markAsBootstrap(0)
   featureManager.updateContext({ mainWindow, accountWindowManager })
   iconCache.warmCache()
   featureManager.initializePhase('ui'):
     singleInstance → deepLinkHandler → bootstrapPromotion
7. setImmediate() — deferred (non-blocking):
   trayIcon → appMenu → badgeIcons → windowState → passkeySupport
   → handleNotification → inOnline → externalLinks → closeToTray
   → openAtLogin → appUpdates → contextMenu → firstLaunch
   → enforceMacOSAppLocation
   → cache warming → perf metrics

Shutdown: before-quit → event.preventDefault() → async cleanup → app.exit()
```

## CONVENTIONS

- **Package manager**: `bun` only (no yarn/pnpm/npm)
- **Node version**: >=22.0.0 (engineStrict enforced)
- **TypeScript**: 6.0+ with strict mode (`noUncheckedIndexedAccess`, `noImplicitOverride`, `noImplicitReturns`)
- **New source files**: Zero config needed — build auto-discovers `*.ts` in `src/`
- **New settings**: Update `StoreType` in `shared/types.ts` → add schema in `config.ts`
- **IPC handler pattern**: rate limit → validate → handle → catch (see `src/main/AGENTS.md`)
- **Feature priority**: SECURITY→CRITICAL→UI→DEFERRED phases via featureManager
- **Feature dependencies**: Declared in feature config; featureManager resolves via topological sort
- **Singletons**: All util managers expose `getXxx()` factory + `destroyXxx()` cleanup
- **Multi-account**: Per-account BrowserWindows with `persist:account-N` session partitions
- **Bootstrap windows**: Temporary login windows promoted via `bootstrapPromotion.ts` after auth
- **Encryption**: SafeStorage (macOS Keychain) with legacy deterministic key fallback + migration

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
- **Never** interrupt a bootstrap window mid-auth-flow with `loadURL` — check `isGoogleAuthUrl()` first
- **Never** destroy a window without unregistering from `accountWindowManager`

## SECURITY LAYERS (defense-in-depth)

- `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false` in BrowserWindow
- Per-account `persist:account-N` session partitions for cookie isolation
- All IPC: `rateLimiter.isAllowed()` + `validators.ts` + try-catch
- Certificate pinning for all Google domains (kill switch via `app.disableCertPinning` config)
- SafeStorage-backed encryption keys (macOS Keychain) with legacy key migration
- AES-256-GCM encrypted `electron-store` for config
- URL whitelist enforcement for navigation + `shell.openExternal()`
- CSP via `webRequest.onHeadersReceived` — strips COEP/COOP/frame-ancestors for benign hosts
- Permission handler: only notifications, media, mediaKeySystem, geolocation

## COMMANDS

```bash
bun install
bun run build:dev      # dev build (~0.25s)
bun run build:prod     # prod build (~0.31s)
bun run build:watch    # watch mode
bun run build:analyze  # bundle analysis (ANALYZE=true)
bun run typecheck      # tsc -b
bun run start          # prod build + launch Electron
bun run test           # all tests (Vitest + Playwright)
bun run test:run       # Vitest single run
bun run test:coverage  # coverage report
bun run lint:all       # ESLint + Prettier check
bun run lint:all:fix   # Auto-fix linting issues
bun run build:mac      # ARM64 DMG (production)
bun run hooks:install  # Install git pre-push hook
```

## NOTES

- Platform: **macOS only** (Apple Silicon arm64; M1 or later)
- Electron 41 / Node.js 22+ / Chromium-based
- Dynamic imports in `index.ts` → deferred features land in `lib/chunks/` (not `lib/main/`)
- `overrideNotifications.ts` preload loaded with `contextIsolation: false` (intentional exception)
- GogChat DOM selectors in `shared/constants.ts` `SELECTORS` — may break if Google updates HTML
- Config encrypted at `~/Library/Application Support/GogChat/` (macOS)
- Encryption keys in `~/Library/Application Support/GogChat/encryption-key.enc` (SafeStorage-encrypted)
- Build history tracked in `.build-history.json` (last 20 builds)
- Unit tests colocated with source (`*.test.ts`); integration/e2e in `tests/`
- Multi-account: secondary accounts created via `externalLinks.ts` routing (`/u/N` path)
- Bootstrap promotion: `bootstrapPromotion.ts` watches for auth completion in new windows
- CI: GitHub Actions — `pr-check.yml` (typecheck + test) + `release.yml` (build + upload DMG)

## COMPLEXITY CENTERS (300+ lines)

| File                                      | Lines | Purpose                                       |
| ----------------------------------------- | ----- | --------------------------------------------- |
| `src/main/index.ts`                       | 688   | App entry, feature registration, phased init  |
| `src/main/utils/featureManager.ts`        | 569   | Feature lifecycle, dependency resolution      |
| File                                      | Lines | Purpose                                       |
| ----------------------------------------- | ----- | --------------------------------------------- |
| `src/main/index.ts`                       | 688   | App entry, feature registration, phased init  |
| `src/main/utils/featureManager.ts`        | 569   | Feature lifecycle, dependency resolution      |
| `tests/mocks/electron.ts`                 | 546   | Complete Electron mock for unit tests         |
| `src/shared/validators.ts`                | 498   | Input sanitization for all IPC channels       |
| `src/main/utils/accountWindowManager.ts`  | 437   | Multi-account BrowserWindow management        |
| `src/main/utils/resourceCleanup.ts`       | 412   | Tracked intervals/timeouts/listeners          |
| `src/main/utils/ipcHelper.ts`             | 392   | Secure IPC handler factories                  |
| `src/main/utils/platform.ts`              | 338   | macOS platform utils, enforceMacOSAppLocation |
| `src/main/utils/performanceMonitor.ts`    | 334   | Startup timing markers, memory snapshots      |
| `src/main/utils/ipcDeduplicator.ts`      | 321   | IPC request deduplication (100ms window)      |
| `src/main/utils/errorHandler.ts`          | 318   | Structured error wrapping, feature init guard  |
