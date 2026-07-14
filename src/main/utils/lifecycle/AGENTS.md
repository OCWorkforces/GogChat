# Lifecycle Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns runtime lifecycle mechanics: feature execution, shared feature context, cleanup tracking, errors, performance monitors, and global cleanup registration.

## Core files

- `featureRunner.ts` runs generated phase batches.
- `featureConfigTypes.ts` defines feature init/cleanup contracts.
- `featureContextStore.ts` stores account manager/window context after bootstrap.
- `resourceCleanup.ts` owns tracked timers/listeners/cleanup tasks.
- `src/main/initializers/registerGlobalCleanups.ts` lazily imports cleanup owners with `Promise.all` to avoid startup cycles.
- `performanceMonitor.ts` records bounded latency/FIFO samples and exports only non-empty metrics.
- `errors.ts` maps lifecycle failures to typed app errors.
- `cleanupTypes.ts` exists to break import cycles; keep it lightweight.

## Cleanup contract

- Use tracked helpers for main-process timers/listeners: `createTrackedInterval`, `createTrackedTimeout`, `addTrackedListener`, `registerCleanupTask`, `registerGlobalCleanupCallback`.
- Cleanup must be idempotent and tolerate partially initialized modules.
- Shutdown order is owned by `src/main/initializers/registerShutdown.ts`.

## Feature runner rules

- Consume `src/main/generated/featurePlan.ts`; do not infer ordering at runtime.
- Preserve phase boundaries and dependency-batch semantics.
- Propagate useful typed errors with `{ cause }` rather than swallowing failures.

## Anti-patterns

- No bare timers in main-process lifecycle code.
- No direct account/window creation here.
- No edits to generated feature plans.
- No unbounded performance arrays or always-on metrics exports.
