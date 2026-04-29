# src/offline/ — Standalone Offline Fallback Page

**Generated:** 2026-04-29 | **Commit:** 8a8bf54
**Parent docs:** `../../AGENTS.md` (project)

## OVERVIEW

Self-contained offline fallback UI loaded by Electron when the GogChat URL is unreachable. **Has zero access to Electron APIs, IPC, or Node.js** — it runs in a fully sandboxed renderer context with no preload script. Communicates with the main process exclusively via a DOM custom event.

## FILES

| File         | Purpose                                      |
| ------------ | -------------------------------------------- |
| `index.html` | Offline page markup                          |
| `index.css`  | Offline page styles                          |
| `index.ts`   | IIFE — retry button + auto-retry timer logic |

## KEY CONSTRAINTS

**NO IPC ACCESS.** This page has no preload script. The only communication channel to the main process is:

```typescript
window.dispatchEvent(new Event('app:checkIfOnline'));
```

The `overrideNotifications.ts` preload (loaded on the main window with `contextIsolation: false`) listens for this event and triggers the actual connectivity check.

## LOGIC (`index.ts`, 23 lines)

IIFE pattern — no exports, no imports.

```
- Grabs #retry-btn HTMLButtonElement
- MAX_AUTO_ATTEMPT_COUNT = 100
- checkIsOnline():
    1. Disables button, sets text → "Checking..."
    2. Dispatches window event: 'app:checkIfOnline'
    3. Increments attemptCount
    4. If attemptCount > 100, clears the interval (stops auto-retry)
- Button click → checkIsOnline()
- setInterval(checkIsOnline, 60_000)  ← auto-retry every 60 seconds
```

## BUILD

Compiled by Rsbuild **main pass** (Pass 1, ESM target) alongside `src/main/`. Output lands in `lib/offline/`. Loaded via `loadFile()` in `windowWrapper.ts` when navigation to the GogChat URL fails.

## ANTI-PATTERNS

- **NEVER** add `ipcRenderer` calls here — no preload script is loaded, it will throw
- **NEVER** import from `../main/` or `../preload/` — different build context, will break
- **NEVER** use bare `setInterval` here — tracked cleanup is main-process only; this page is intentionally simple
- **NEVER** skip the `attemptCount > MAX_AUTO_ATTEMPT_COUNT` guard — prevents infinite retries (MAX = 100)
- **NEVER** use `NodeJS.Timeout` as a type marker for intent — `setInterval` here is intentionally untracked (no main-process cleanup available)
