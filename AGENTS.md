# GogChat — Project Knowledge Base

**Generated:** 2026-05-14

**Commit:** c7a1b7a
**Branch:** refactor/codebase-improvement

## OVERVIEW

Electron desktop wrapper for Google Chat (`https://mail.google.com/chat/u/0`). TypeScript throughout. macOS only (Apple Silicon arm64). Built with Rsbuild (Rspack). **NOT a typical Electron app** — dual-build system outputs ESM for main process and CJS for preload (required by `sandbox: true`). Supports **multi-account sessions** via per-account BrowserWindow partitions, with an opt-in WebContentsView backend behind `app.useWebContentsView`. Feature lifecycle is **build-time codegen**: `*.spec.ts` files in `initializers/` are compiled into a static dependency-batched plan by `scripts/featurePlanPlugin.js`, then walked at runtime by `featureRunner.ts` (no runtime FeatureManager). Electron 41 / Node.js 22+ / Chromium-based.

## STRUCTURE

```
src/
├── main/          # Electron main process (features, initializers, utils)
│   ├── features/  # 23 self-contained feature modules (incl. cdpTelemetry)
│   ├── initializers/ # *.spec.ts feature plans + app-ready + shutdown + diagnostics
│   ├── generated/ # Build-time featurePlan.ts (do NOT edit by hand)
│   └── utils/     # ~50 utility modules (singletons, helpers, types)
├── preload/       # 8 bridge scripts (CJS, sandbox-compatible)
├── shared/        # Cross-process contracts (constants, validators, types/)
│   └── types/     # 7 type files (branded, window, domain, config, ipc, bridge, errors)
└── offline/       # Standalone fallback page (no IPC access)
scripts/           # Dual-build, featurePlanPlugin, perf budget gate, headless startup, lint, icons, notarize
tests/             # 4 tiers: unit (colocated), integration, e2e, performance
mac/               # DMG packaging support
resources/         # Icon variants (tray, normal, badge, offline)
```

## WHERE TO LOOK

| Task                                     | Location                                                             | Notes                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---- | ------------------------------------------- |
| App init order                           | `src/main/index.ts` + `initializers/registerAppReady.ts`             | Thin orchestrator; app.whenReady body in `registerAppReady.ts`                                                                                                         |
| Feature specs (build-time plan)          | `src/main/initializers/{security,ui,deferred}.spec.ts`               | Declarative `FeatureSpec[]` arrays — consumed by `scripts/featurePlanPlugin.js`                                                                                        |
| Feature plan codegen                     | `scripts/featurePlanPlugin.js`                                       | Rsbuild plugin: parses `*.spec.ts`, topo-sorts, emits `src/main/generated/featurePlan.ts`                                                                              |
| Feature runtime walker                   | `src/main/utils/featureRunner.ts`                                    | `runPhase('security'                                                                                                                                                   | 'critical' | 'ui' | 'deferred', ctx)` — no FeatureManager class |
| Shutdown handler                         | `src/main/initializers/registerShutdown.ts`                          | Graceful cleanup via `singletonDestroyers`                                                                                                                             |
| Shutdown diagnostics                     | `src/main/initializers/shutdownDiagnostics.ts`                       | Cache statistics logging                                                                                                                                               |
| Multi-account mgr (BrowserWindow path)   | `src/main/utils/accountWindowManager.ts`                             | Per-account windows + bootstrap; dispatches to `accountViewManager` when `useWebContentsView=true`                                                                     |
| Multi-account mgr (WebContentsView path) | `src/main/utils/accountViewManager.ts`                               | Opt-in WebContentsView backend (`app.useWebContentsView` flag); single host BrowserWindow + per-account views                                                          |
| Idle session maintenance                 | `src/main/utils/accountSessionMaintenance.ts`                        | `getAccountActivityTracker()`; periodic `clearCodeCaches()` on idle accounts                                                                                           |
| Account mgr interface                    | `src/shared/types/window.ts`                                         | `IAccountWindowManager` (22 methods)                                                                                                                                   |
| Add new feature                          | `src/main/features/`                                                 | See `features/AGENTS.md`                                                                                                                                               |
| Type narrowing helper                    | `src/shared/typeUtils.ts`                                            | `assertNever()` for exhaustive discriminated union switches (used in `featureRunner`, `badgeHandlers`)                                                                 |
| Error class hierarchy                    | `src/shared/types/errors.ts` + `src/main/utils/errors.ts`            | `GogChatError`, `IPCError`, `ConfigError`; use `{ cause }` chaining                                                                                                    |
| IPC channel names                        | `src/shared/constants.ts`                                            | `IPC_CHANNELS as const satisfies`; `IPCChannelName` type                                                                                                               |
| Input validators                         | `src/shared/dataValidators.ts`                                       | Data validation (counts, booleans, objects)                                                                                                                            |
| URL validators                           | `src/shared/urlValidators.ts`                                        | URL whitelist + Google auth detection                                                                                                                                  |
| Config schema                            | `src/shared/types/config.ts` + `src/main/config.ts`                  | Update both; use `configGet`/`configSet` for access                                                                                                                    |
| Encryption keys                          | `src/main/utils/encryptionKey.ts`                                    | SafeStorage + legacy migration                                                                                                                                         |
| Branded types                            | `src/shared/types/branded.ts`                                        | `AccountIndex`, `FeatureNameBrand`, `WebContentsId`, `AccountPartition`, `ValidatedURL`; see `asAccountIndex()`, `toPartition()` helpers                               |
| window.gogchat API                       | `src/preload/index.ts` + `src/shared/types/bridge.ts`                | `GogChatBridgeAPI`                                                                                                                                                     |
| Build system                             | `scripts/build-rsbuild.js` + `rsbuild.config.js`                     | Dual-pass                                                                                                                                                              |
| CI/CD                                    | `.github/workflows/`                                                 | pr-check + release                                                                                                                                                     |
| DMG packaging                            | `mac/`                                                               | See `mac/AGENTS.md`                                                                                                                                                    |
| Test helpers                             | `tests/helpers/electron-test.ts`                                     | Playwright fixtures                                                                                                                                                    |
| Electron mocks                           | `tests/mocks/electron.ts`                                            | For unit tests                                                                                                                                                         |
| Log files                                | `~/Library/Logs/GogChat/main.log`                                    | macOS path                                                                                                                                                             |
| Secure flags (cert pinning kill switch)  | `src/main/utils/secureFlags.ts`                                      | `getDisableCertPinning()`/`setDisableCertPinning()`; macOS Keychain via safeStorage                                                                                    |
| CDP RUM telemetry                        | `src/main/features/cdpTelemetry.ts` + `src/main/utils/cdpMetrics.ts` | Local-only Chrome DevTools Protocol metrics; killable via `secureFlags.disableCdpTelemetry`                                                                            |
| IPC fast path                            | `src/main/utils/ipcFastPath.ts`                                      | Skips dedup/rate-limit for high-frequency low-risk channels                                                                                                            |
| Config cache                             | `src/main/utils/configCache.ts`                                      | Read-through cache; **no TTL** — invalidated by `set`/`delete`/`clear` only                                                                                            |
| Perf budget gate (CI)                    | `scripts/check-perf-budget.js` + `scripts/headless-startup.js`       | Headless run produces `performance-metrics.json` → 14 metrics checked (5 Wave-0 additions; `contentFirstPaint` gated, new store/deferred/memory/IPC metrics warn-only) |

## CRITICAL BUILD ARCHITECTURE

Two separate Rsbuild passes in `scripts/build-rsbuild.js`:

1. **Main build** — ESM, `electron-main` target, **single entry** `src/main/index.ts`
2. **Preload build** — CJS, `electron-renderer` target, `cleanDistPath: false`

**`cleanDistPath: false` on preload is mandatory** — without it, pass 2 wipes pass 1's output.

Preload MUST be CJS because `sandbox: true` in BrowserWindow prevents ESM module loading.

## INIT ORDER IN `src/main/index.ts`

```
1. setupCertificatePinning()      ← BEFORE any network (app not ready yet)
2. reportExceptions()             ← catch startup errors
3. enforceSingleInstance()        ← exits if duplicate
4. (feature plan loaded statically from generated/featurePlan.ts — no runtime register call)
5. setupDeepLinkListener()        ← before app.ready (open-url event)
6. app.whenReady() (in registerAppReady.ts):
   initializeErrorHandler()
   Promise.all([registerGlobalCleanups(), runPhase('security')])  ← PARALLEL
   Promise.all([runPhase('critical'), initializeStore()])  ← PARALLEL
   accountWindowManager → session.preconnect('persist:account-0')  ← DNS/TCP/TLS warmup
   session.preconnect: 7 hosts — mail.google.com, accounts.google.com, ssl.gstatic.com,
     fonts.gstatic.com, chat.google.com, hangouts.google.com (numSockets per host)
   createAccountWindow(url, 0) → markAsBootstrap(0)
   setSharedFeatureContext({ mainWindow, accountWindowManager })
   runPhase('ui'): singleInstance → deepLinkHandler
7. setImmediate() — deferred (non-blocking):
   warmInitialIcons() → warmSoonDeferredIcons()  ← 3-tier icon paths (INITIAL, SOON_DEFERRED, IDLE_DEFERRED)
   if (!app.isPackaged) renderer-memory sampling every 60s  ← dev only, gated
   runDeferredPhase(): trayIcon → appMenu → badgeIcons → bootstrapPromotion → windowState
   → passkeySupport → handleNotification → inOnline → externalLinks → closeToTray
   → openAtLogin → appUpdates → contextMenu → firstLaunch → enforceMacOSAppLocation
   → cdpTelemetry (RUM, killable via secureFlags.disableCdpTelemetry)
   → cache warming (8s idle) → perf metrics export

Shutdown: registerShutdownHandler() → before-quit → event.preventDefault() → async cleanup → app.exit()
```

## CONVENTIONS

- **Package manager**: `bun` only (no yarn/pnpm/npm)
- **Node version**: >=22.0.0 (engineStrict enforced)
- **TypeScript**: 6.0+ with strict mode + `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`; lib `ES2025` for Temporal, RegExp.escape, Promise.try types
- **ESLint**: `@typescript-eslint/consistent-type-imports: error` enforces `import type` for type-only imports
- **New source files**: Zero config needed — build auto-discovers `*.ts` in `src/`
- **New settings**: Update `StoreType` in `shared/types/config.ts` → add schema in `config.ts`; access via `configGet()`/`configSet()`. Security-sensitive flags (e.g., cert pinning kill switch) go in `secureFlags.ts` (safeStorage/Keychain), NOT `StoreType`
- **IPC handler pattern**: rate limit → validate → handle → catch (see `src/main/AGENTS.md`)
- **Feature priority**: SECURITY→CRITICAL→UI→DEFERRED phases walked by `featureRunner.runPhase()`
- **Feature dependencies**: Declared in `*.spec.ts` `dependencies` field; topo-sorted at **build time** by `scripts/featurePlanPlugin.js` into batches
- **Feature registration**: Edit `initializers/{security,ui,deferred}.spec.ts` — build-time codegen emits `generated/featurePlan.ts`. Do NOT add features in `index.ts` or hand-edit the generated plan
- **Singletons**: All util managers expose `getXxx()` factory + `destroyXxx()` cleanup
- **Multi-account**: Per-account BrowserWindows with `persist:account-N` session partitions
- **Bootstrap windows**: Temporary login windows promoted via `bootstrapPromotion.ts` after auth
- **Encryption**: SafeStorage (macOS Keychain) with legacy deterministic key fallback + migration
- **Menu actions**: Features register actions via `menuActionRegistry.ts`; appMenu consumes them (no feature→feature imports)
- **Global cleanup**: `registerBuiltInGlobalCleanups()` uses lazy `require()` to avoid coupling
- **No re-exports**: All imports go directly to source modules (no barrel files)
- **Type casting**: Use `asType<T>(value)` from `src/shared/typeUtils.ts` for general casts or the branded helpers (`asAccountIndex`, `asFeatureName`, `asWebContentsId`, `asValidatedURL`, `toPartition`) for nominal types. Never use bare `value as T` outside allowed patterns (`as const`, test files, inside `typeUtils.ts`/`branded.ts`).

## ANTI-PATTERNS

- **Never** skip rate limiting in IPC handlers
- **Never** use `as any`, `@ts-ignore`, `@ts-expect-error`
- **Never** add feature logic directly in `index.ts` — create `features/myFeature.ts`
- **Never** add features in `index.ts` or hand-edit `generated/featurePlan.ts` — declare them in `initializers/*.spec.ts` and let `featurePlanPlugin.js` regenerate
- **Never** hardcode IPC channel strings — use `IPC_CHANNELS` from `shared/constants.ts`
- **Never** call `setInterval`/`setTimeout` without tracking via `resourceCleanup.ts`
- **Never** modify preload build to output ESM — `sandbox: true` requires CJS
- **Never** remove `cleanDistPath: false` from preload build config
- **Never** open external URLs with `shell.openExternal()` without `validateExternalURL()` first
- **Never** use bare `setTimeout`/`setInterval` — always use `createTrackedTimeout`/`createTrackedInterval`
- **Never** interrupt a bootstrap window mid-auth-flow with `loadURL` — check `isGoogleAuthUrl()` first
- **Never** destroy a window without unregistering from `accountWindowManager`
- **Never** import from other features directly — use `menuActionRegistry`
- **Never** mix runtime imports with type-only imports — use `import type` syntax consistently (ESLint enforced)
- **Never** create barrel/re-export files — import directly from source modules
- **Never** throw bare `Error` when a typed `GogChatError` subclass is available — use `IPCError`, `ConfigError`, or create a new subclass
- **Never** use bare `value as T` for type assertions — use `asType<T>(value)` or branded helpers (`asAccountIndex`, `asFeatureName`, etc.). The only exceptions are structural `as const` and inside the allowlisted implementation files (`typeUtils.ts`, `branded.ts`).

## SECURITY LAYERS (defense-in-depth)

- `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false` in BrowserWindow
- Per-account `persist:account-N` session partitions for cookie isolation
- All IPC: `rateLimiter.isAllowed()` + validators + try-catch
- Certificate pinning for all Google domains (kill switch via `secureFlags.ts` safeStorage, NOT electron-store)
- SafeStorage-backed encryption keys (macOS Keychain) with legacy key migration
- AES-256-GCM encrypted `electron-store` for config
- URL whitelist enforcement for navigation + `shell.openExternal()`
- CSP via `webRequest.onHeadersReceived` — strips COEP/COOP/frame-ancestors for benign hosts
- Permission handler: only notifications, media, mediaKeySystem, geolocation

## COMMANDS

```bash
bun install
bun run build:dev      # dev build (~0.12s)
bun run build:prod     # prod build (~0.12s)
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
- TypeScript 6.0.3 with 10+ strict flags including `exactOptionalPropertyTypes`, `noUncheckedSideEffectImports`
- Branded types: `AccountIndex`, `AccountPartition`, `FeatureNameBrand`, `WebContentsId` enforce nominal typing at module boundaries
- `assertNever()` actively used in `featureRunner` and `badgeHandlers` for exhaustive discriminated union switches
- All `as const` objects in `constants.ts` now use `satisfies` validation
- Electron 41 / Node.js 22+ / Chromium-based
- Dynamic imports → deferred features in `lib/chunks/` (not `lib/main/`)
- Bundle: single main entry → 84.8KB (was 696KB before optimization, 110KB before startup tuning, 80.8KB before performance pass)
- `overrideNotifications.ts` preload: `contextIsolation: false` (intentional exception)
- DOM selectors in `shared/constants.ts` `SELECTORS` — may break on Google HTML changes
- Unit tests colocated with source (`*.test.ts`); integration/e2e in `tests/`
- CI: GitHub Actions — `pr-check.yml` + `release.yml`
- CI gates: madge circular deps (enforcing), import count (enforcing), coverage (informational)
- Coverage: ~97% statements (~1743 tests, 82 test files)
- Build history tracked in `.build-history.json` (last 20 builds)

## COMPLEXITY CENTERS (200+ lines)

| File                                      | Lines | Purpose                                                                                     |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| `src/main/utils/accountViewManager.ts`    | 569   | Opt-in WebContentsView backend (host BrowserWindow + per-account views)                     |
| `src/main/utils/accountWindowManager.ts`  | 623   | Multi-account BrowserWindow + hydrate/dehydrate; dispatches to accountViewManager when flag |
| `scripts/check-perf-budget.js`            | 452   | CI perf budget gate — 14 metrics, gated subset fails build                                  |
| `src/main/utils/performanceMonitor.ts`    | 452   | Startup timing markers, memory snapshots, per-renderer sampling                             |
| `src/main/utils/resourceCleanup.ts`       | 331   | Tracked intervals/timeouts/listeners + lazy cleanup                                         |
| `scripts/featurePlanPlugin.js`            | 299   | Build-time feature plan codegen (parses \*.spec.ts, topo-sorts, emits featurePlan.ts)       |
| `scripts/headless-startup.js`             | 345   | CI headless run — produces performance-metrics.json for budget gate                         |
| `scripts/build-rsbuild.js`                | 386   | Dual-build orchestrator                                                                     |
| `src/shared/urlValidators.ts`             | 336   | URL whitelist validation, Google auth URL detection                                         |
| `src/main/utils/ipcHelper.ts`             | 316   | Secure IPC handler factories                                                                |
| `src/main/utils/ipcDeduplicator.ts`       | 307   | IPC request deduplication (100ms window)                                                    |
| `src/main/features/externalLinks.ts`      | 298   | External link handling with re-guard timer                                                  |
| `src/main/utils/accountWindowRegistry.ts` | 257   | Window registry implementation                                                              |
| `src/main/utils/errorHandler.ts`          | 244   | Structured error wrapping, feature init guard                                               |
| `src/main/config.ts`                      | 233   | Encrypted electron-store with AES-256-GCM + `configGet`/`configSet` typed helpers           |
| `src/main/features/certificatePinning.ts` | 215   | Certificate pinning for Google domains                                                      |
| `src/main/utils/iconCache.ts`             | 235   | 3-tier icon paths (INITIAL, SOON_DEFERRED, IDLE_DEFERRED) + cache + warmup                  |
