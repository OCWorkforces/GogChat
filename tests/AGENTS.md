# tests/ — Test Suite

**Generated:** 2026-03-27

4 test tiers: **unit** (Vitest, colocated with source), **integration** (Playwright+Electron, multi-module), **e2e** (Playwright+Electron, user workflows), **performance** (Playwright, regression). Electron cannot parallelize — `workers: 1`.

## STRUCTURE

```
tests/
├── unit/features/          # 3 files — isolated module tests
├── integration/            # 3 files — IPC flows, app launch
├── e2e/                    # 1 file  — complete user workflows
├── performance/            # 1 file  — startup/memory regressions
├── helpers/electron-test.ts    # Playwright fixtures + IPC helpers
└── mocks/electron.ts           # Mock Electron APIs for Vitest
```

Colocated unit tests: `src/main/features/*.test.ts` (~20), `src/main/utils/*.test.ts` (~15), `src/shared/*.test.ts` (2), `src/main/config.test.ts` (1).

## HELPERS (`electron-test.ts`)

Always import `test` and `expect` from here — not from `@playwright/test`.

Key functions: `waitForIPC(app, channel, timeout?)`, `sendIPCFromMain(app, channel, data?)`, `checkSecuritySettings(app)`, `goOffline(page)`, `goOnline(page)`, `mockNetworkResponse(page, url, response)`, `pressShortcut(page, shortcut)`, `cleanupTestData(app)`.

## MOCKS (`electron.ts`)

Mocks: `app`, `ipcMain`, `BrowserWindow`, `Tray`, `Menu`, `dialog`, `shell`, `nativeImage`.
**Critical**: `vi.mock('electron', () => require('../mocks/electron'))` MUST come before any Electron imports. Always `resetMocks()` in `beforeEach`.

## PERFORMANCE THRESHOLDS

| Metric               | Max    |
| -------------------- | ------ |
| Startup time         | 3000ms |
| Window creation      | 500ms  |
| First paint          | 1000ms |
| Memory usage         | 200MB  |
| Feature init (total) | 2000ms |

Coverage: overall 80%+, security/IPC/persistence 100%, utilities 90%+, features 70%+.

## ANTI-PATTERNS

- **NEVER** put `vi.mock()` after imports — Vitest hoisting required
- **NEVER** hardcode timeouts — use `waitForIPC()` / `waitForSelector()`
- **NEVER** skip `resetMocks()` in `beforeEach`
- **NEVER** launch Electron manually — use fixtures from `electron-test.ts`
- **NEVER** run multiple Electron workers — use `workers: 1`
