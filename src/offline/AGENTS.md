# Offline Page Guide

**Parent:** `../AGENTS.md`

`src/offline` is a static fallback page for network loss. It is not a normal renderer app.

## Constraints

- No preload and no IPC.
- Communicate retry intent with DOM events such as `window.dispatchEvent(new Event('app:checkIfOnline'))`.
- Keep the script self-contained/IIFE-friendly.
- `setInterval` is intentionally untracked here because this is not main-process code.
- `MAX_AUTO_ATTEMPT_COUNT` caps automatic retries; do not add infinite retry loops.

## Build contract

- Offline assets are copied to `lib/offline` by the build scripts.
- `src/offline/index.html` references the built script through `../../lib/offline/index.js`.
- Do not change output paths without updating `scripts/build-rsbuild.js` and packaging checks.

## Anti-patterns

- No Electron API assumptions.
- No direct Google Chat logic beyond explaining/offering retry.
- No shared mutable state with main/preload.
