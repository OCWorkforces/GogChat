# Account Utilities Guide

**Parent:** `../AGENTS.md`

This directory owns multi-account window/view backends and per-account session partition behavior.

## Backends

- `accountWindowManager.ts` is the default BrowserWindow-per-account backend.
- `accountViewManager.ts` is the opt-in WebContentsView host backend selected by `app.useWebContentsView`.
- Both implement `IAccountWindowManager` from `src/shared/types/window.ts`.
- Shared routing/registry/bootstrap helpers live in `accountRouter.ts`, `accountWindowRegistry.ts`, `bootstrapTracker.ts`, `bootstrapWatcher.ts`, `accountSessionMaintenance.ts`, `cacheWarmer.ts`, and `deepLinkUtils.ts`.

## Session contract

- Use branded helpers: `asAccountIndex()`, `toPartition()`, and `asWebContentsId()`.
- Account partitions are `persist:account-N`; do not switch to in-memory partitions.
- Never interrupt Google auth pages with `loadURL`; check `isGoogleAuthUrl()` first.
- Preserve account 0 and bootstrap accounts during dehydration.

## Dehydration differences

- BrowserWindow dehydration may destroy a window, but must preserve the partition/session.
- WebContentsView dehydration hides/throttles the view; it does not destroy per-account sessions.
- Keep backend-specific behavior behind the shared manager contract whenever possible.

## Change checklist

- If behavior is user-visible, update both backends or document why one is intentionally different.
- Keep bootstrap promotion compatible with `src/main/initializers/registerAppReady.ts` and lifecycle context storage.
- Add/update tests around auth pages, partition persistence, active account switching, and dehydration.
- Do not add Google Chat URL assumptions here; use validators from `src/shared/urlValidators.ts`.
