# src/main/initializers/ — App Lifecycle Initializers

**Generated:** 2026-05-14

Extracted from `index.ts` to keep the app entry point a thin orchestrator. Feature registration is now declarative (`*.spec.ts` files) and resolved at build time. Shutdown is handled separately.

## FILES

| File                           | Lines | Purpose                                                                                                |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------ |
| `security.spec.ts`             | ~50   | Declarative `SECURITY_FEATURES` array (FeatureSpec[]); runs before `app.whenReady`                     |
| `ui.spec.ts`                   | ~60   | Declarative `UI_FEATURES` array; runs inside `app.whenReady` after window creation                     |
| `deferred.spec.ts`             | ~120  | Declarative `DEFERRED_FEATURES` array; runs in `setImmediate` after first paint                        |
| `registerAppReady.ts`          | ~140  | `app.whenReady` orchestration; drives phases via `featureRunner` (no longer `featureManager`)          |
| `registerGlobalCleanups.ts`    | 39    | Lazy-required cleanup callback registration                                                            |
| `registerShutdown.ts`          | 70    | `before-quit` handler; calls `cleanupAll(featureRunner)` then singleton destroyers                     |
| `shutdownDiagnostics.ts`       | 115   | Cache statistics logging                                                                               |
| `singletonDestroyers.ts`       | 29    | Aggregated singleton destroy calls                                                                     |

**Deleted in performance pass (2026-05-08):**

- `registerFeatures.ts` (entry point, 36 lines)
- `registerSecurityFeatures.ts` (43 lines)
- `registerUIFeatures.ts` (68 lines)
- `registerDeferredFeatures.ts` (28 lines)
- `registerDeferredSystemFeatures.ts` (113 lines)
- `registerDeferredWindowFeatures.ts` (70 lines)
- `registerDeferredNetworkFeatures.ts` (45 lines)
- `featureHelpers.ts` (47 lines)

Replaced by `*.spec.ts` declarative specs + build-time codegen.

## FEATURE SPEC FILES

Each `*.spec.ts` exports a typed `readonly FeatureSpec[]` (`as const satisfies`). A `FeatureSpec` declares: `name`, `phase`, optional `dependencies`, optional `required`, `description`, `init(ctx)`, optional `cleanup(ctx)`.

```typescript
export const SECURITY_FEATURES = [
  {
    name: 'certificatePinning',
    phase: 'security',
    required: true,
    init: () => setupCertificatePinning(),
    cleanup: () => cleanupCertificatePinning(),
  },
  // ...
] as const satisfies readonly FeatureSpec[];
```

Phase distribution: security (3) → critical (1) → ui (2) → deferred (~15+ incl. `cdpTelemetry`).

## BUILD-TIME CODEGEN

`scripts/featurePlanPlugin.js` (Rsbuild plugin) reads the three `*.spec.ts` files and emits `src/main/generated/featurePlan.ts` containing `FEATURE_PLAN: Record<FeaturePriority, readonly (readonly FeatureSpec[])[]>`. Topological sort + dependency batching happens **at build time**, not runtime. The 485-line `featureManager` class is gone.

## RUNTIME

- `src/main/utils/featureRunner.ts` (~109 lines) walks `FEATURE_PLAN` per phase. Within a phase, batches run sequentially; specs in a batch run in parallel via `Promise.all`. Tracks initialized specs for reverse-order `cleanupAll`.
- `src/main/utils/featureContextStore.ts` (~22 lines) holds the live `FeatureContext` for any feature that needs to read `mainWindow` / `accountWindowManager` post-init.

## registerAppReady.ts

Drives the lifecycle:

1. `runPhase('security', ctx)` — before window creation
2. Create main window, set context via `featureContextStore.update(...)`
3. `runPhase('critical', ctx)` + `runPhase('ui', ctx)`
4. `setImmediate(() => runPhase('deferred', ctx))` — non-blocking

## registerShutdown.ts

**Cleanup order**:

1. `cleanupAll(ctx)` — reverse init order via `featureRunner`
2. `destroyAccountWindowManager()`
3. `runShutdownDiagnostics()` — delegates to `shutdownDiagnostics.ts`
4. `destroyAllSingletons()` — perfMonitor → deduplicator → rateLimiter → iconCache (via `singletonDestroyers.ts`)
5. `app.exit()`

**Cache statistics** (logged from `shutdownDiagnostics.ts`): icon cache, config cache, IPC deduplicator, rate limiter.

## ANTI-PATTERNS

- **Never** add feature registrations in `index.ts` — add a new entry to the relevant `*.spec.ts`
- **Never** import a feature module statically inside `*.spec.ts` (except security/critical) — use dynamic `import()` in the spec's `init`; the build-time plugin keeps phase batches lean
- **Never** edit `src/main/generated/featurePlan.ts` by hand — it is regenerated on every build
- **Never** reorder shutdown steps — `cleanupAll` MUST precede window manager destruction
- **Never** access `mainWindow` from a feature's module scope — read it from the `FeatureContext` argument or `featureContextStore.get()`
- **Never** add inline feature logic — delegate to a feature module's default export
