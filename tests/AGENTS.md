# Tests Guide

**Parent:** `../AGENTS.md`

Tests cover unit, integration, e2e, and performance behavior for an Electron app. Use `bun` commands only.

## Commands

```bash
bun run test
bun run test:run
bun run test:coverage
bun run typecheck
bun run build:prod
```

## Test tiers

- Unit: Vitest, colocated `*.test.ts` and `tests/unit/features`.
- Integration/e2e/performance: Playwright/Electron helpers under `tests/`.
- E2E config: `playwright.config.ts` uses `testDir: './tests/e2e'`, `workers: 1`, timeout 60000, retries 0.
- Coverage thresholds in `vitest.config.ts`: statements 94, branches 92, functions 94, lines 94.

## Electron test helpers

- Import fixtures from `tests/helpers/electron-test.ts`, not directly from `@playwright/test`.
- Use `tests/mocks/electron.ts` for Electron mocks.
- Reset with `electronMock.reset()` and `vi.clearAllMocks()` between cases.
- Keep `tests/polyfill-crypto.cjs` loaded for crypto-dependent unit tests.

## What to test

- Startup/spec changes: generated feature plan and phase ordering.
- IPC changes: validation, rate limiting, dedup behavior, success and failure paths.
- Account changes: partition persistence, auth-page protection, switching, dehydration.
- Preload changes: bridge validation and subscription cleanup.
- Security changes: URL validation, shell wrapper usage, CSP exceptions, permission/media paths.

## Anti-patterns

- Do not delete failing tests to pass.
- Do not bypass app helpers with raw Playwright fixtures in Electron tests.
- Do not hardcode generated feature-plan output when a spec-level assertion works.
- Do not make e2e tests order-dependent; workers are one today but tests should remain isolated.
