# Source Guide

**Parent:** `../AGENTS.md`

`src` contains the Electron main process, sandboxed preload bridge, shared contracts, and static offline fallback assets.

## Route source work

- Main-process startup, features, utilities, account windows, security, or IPC handlers: `main/AGENTS.md`.
- Cross-process constants, validators, and types: `shared/AGENTS.md`.
- Sandboxed bridge or page-observation code: `preload/AGENTS.md`.
- Static network-loss fallback assets: `offline/AGENTS.md`.

## Process boundaries

- `main/` owns Electron APIs, application lifecycle, windows, and IPC handlers.
- `preload/` is a sandboxed CommonJS bridge between Google Chat pages and main.
- `shared/` is dependency-light code used by both main and preload. It must not depend on Electron or either process directory.
- `offline/` is a static fallback page, not a normal renderer application. It has no preload or IPC.

## Root modules

- `environment.ts` is main-process only because it imports Electron. Do not load it in a renderer.
- `urls.ts` is the shared frozen definition object for application and logout URLs.

## Import rules

- TypeScript uses NodeNext-style `.js` import specifiers, including imports that resolve to TypeScript source files.
- Do not import directly between `src/main` and `src/preload`; use typed shared contracts, constants, and IPC instead.
