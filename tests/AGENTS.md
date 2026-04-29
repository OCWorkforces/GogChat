# tests/ — Test Suite

**Generated:** 2026-04-29 | **Commit:** 3093c79

4 test tiers: **unit** (Vitest, colocated with source), **integration** (Playwright+Electron, multi-module), **e2e** (Playwright+Electron, user workflows), **performance** (Playwright, regression). Electron cannot parallelize — `workers: 1`.

## STRUCTURE

```
tests/
├── unit/features/          # 3 files — isolated module tests with vi.mock()
├── integration/            # 3 files — real Electron, multi-module IPC flows
├── e2e/                    # 1 file  — complete user workflows (288 lines)
├── performance/            # 1 file  — startup/memory/CPU regressions
├── helpers/electron-test.ts    # Playwright fixtures + IPC helpers (344 lines)
├── mocks/electron.ts           # Mock Electron APIs for Vitest (556 lines)
└── polyfill-crypto.cjs          # Node.js crypto polyfill for test env (Node 24+)
```

Colocated unit tests: `src/main/features/*.test.ts` (~20), `src/main/utils/*.test.ts` (~15), `src/preload/*.test.ts` (6), `src/shared/*.test.ts` (2), `src/main/config.test.ts` (1).

## HELPERS (`electron-test.ts`)

Always import `test` and `expect` from here — not from `@playwright/test`.

Key functions: `waitForIPC(app, channel, timeout?)`, `sendIPCFromMain(app, channel, data?)`, `checkSecuritySettings(app)`, `goOffline(page)`, `goOnline(page)`, `mockNetworkResponse(page, url, response)`, `pressShortcut(page, shortcut)`, `cleanupTestData(app)`, `getAppInfo(app)`, `getWindowState(page)`, `isFeatureEnabled(app, feature)`, `waitForText(page, text)`, `takeScreenshot(page, name)`, `getMainProcessLogs(app)`.

## MOCKS (`electron.ts`)

Mock classes: `MockBrowserWindow` (static registry: `getAllWindows()`, `fromId()`), `MockApp` (with `.dock`), `MockIpcMain`, `MockIpcRenderer`, `MockWebContents`, `MockSession`, `MockMenu`, `MockTray`, `MockDialog`, `MockShell`, `MockNativeImage`.

**Vitest usage pattern:**
```typescript
vi.mock('electron', () => electronMock);  // MUST be before any Electron imports

beforeEach(() => {
  electronMock.reset();    // resets instances + call history
  vi.clearAllMocks();
});
```

`createElectronMock()` factory + `electronMock` singleton both exported.

## PERFORMANCE THRESHOLDS

| Metric               | Max    |
| -------------------- | ------ |
| App launch           | 2000ms |
| Window ready         | 1500ms |
| First paint          | 1000ms |
| Memory baseline      | 150MB  |
| Memory after nav     | 200MB  |
| IPC response         | 100ms  |
| CPU idle             | 5%     |
| JS bundle            | 1MB    |

Coverage thresholds (vitest.config.ts): statements 94%, branches 92%, functions 94%, lines 94%.

## ANTI-PATTERNS

- **NEVER** put `vi.mock()` after imports — Vitest hoisting required
- **NEVER** hardcode timeouts — use `waitForIPC()` / `waitForSelector()`
- **NEVER** skip `electronMock.reset()` + `vi.clearAllMocks()` in `beforeEach`
- **NEVER** launch Electron manually — use fixtures from `electron-test.ts`
- **NEVER** run multiple Electron workers — use `workers: 1`
- **NEVER** import from `@playwright/test` directly in integration/e2e — use `electron-test.ts`
- **NEVER** add `polyfill-crypto.cjs` changes without verifying Node 24+ compat
- **NEVER** install fake timers after creating the subject under test — `vi.useFakeTimers()` MUST precede any object that calls `setInterval`/`setTimeout` internally (e.g. `rateLimiter`)

## INTERNAL TEST HELPERS (electron-test.ts)

- `import.meta.dirname` used for ESM `__dirname` compat (Node 22+)
- Playwright import is wrapped in try/catch for graceful skip when `@playwright/test` is not installed
- `getWindowState()` accesses `(window as any).electronWindow` — Electron exposes this bridge
- `isFeatureEnabled()` calls `require('electron-store')` directly (bypasses `configGet`/`configSet` intentionally — test-only read path)
- `checkSecuritySettings()` reads `webContents.getWebPreferences()` directly via `electronApp.evaluate()`
