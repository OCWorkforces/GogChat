# tests/ — Test Suite

**Generated:** 2026-03-11
## OVERVIEW

4 test tiers: **unit** (Vitest, isolated), **integration** (Playwright+Electron, multi-module), **e2e** (Playwright+Electron, user workflows), **performance** (Playwright, regression). Electron cannot parallelize — `workers: 1`, `fullyParallel: false`.

## STRUCTURE

```
tests/
├── unit/features/          # Vitest: isolated module tests
├── integration/            # Playwright: IPC flows, app launch sequence
├── e2e/                    # Playwright: complete user workflows
├── performance/            # Playwright: startup/memory regressions
├── helpers/
│   └── electron-test.ts    # Playwright fixtures + IPC helpers
└── mocks/
    └── electron.ts         # Mock Electron APIs for Vitest unit tests
```

## HELPERS: `helpers/electron-test.ts`

Exports Playwright `test` with fixtures: `electronApp`, `mainWindow`, `appPath`.

Key helper functions:

```typescript
waitForIPC(app, channel, timeout?)        // Block until IPC received from renderer
sendIPCFromMain(app, channel, data?)      // Inject IPC from main side
checkSecuritySettings(app)               // Assert contextIsolation, sandbox, nodeIntegration
goOffline(page) / goOnline(page)         // Simulate network state
mockNetworkResponse(page, url, response) // Intercept HTTP requests
pressShortcut(page, shortcut)            // Keyboard shortcut simulation
cleanupTestData(app)                     // Reset persistent state
```

Always import `test` and `expect` from here — not from `@playwright/test` directly.

## MOCKS: `mocks/electron.ts`

Mocks: `app`, `ipcMain`, `BrowserWindow`, `Tray`, `Menu`, `dialog`, `shell`, `nativeImage`.

**Critical**: `vi.mock('electron', ...)` MUST come before any imports that use Electron.

```typescript
vi.mock('electron', () => require('../mocks/electron')); // LINE 1 of test file
import { createWindow } from '../../src/main/windowWrapper'; // after mock

beforeEach(() => resetMocks()); // always reset between tests
```

Coverage targets: overall 80%+, critical paths (security/IPC/persistence) 100%, utilities 90%+, features 70%+.

## PERFORMANCE THRESHOLDS

| Metric               | Max    |
| -------------------- | ------ |
| Startup time         | 3000ms |
| Window creation      | 500ms  |
| First paint          | 1000ms |
| Memory usage         | 200MB  |
| Feature init (total) | 2000ms |

## TEST PATTERNS

**Unit (Vitest)**:
```typescript
vi.mock('electron', () => require('../mocks/electron'));  // before imports
import { myFunction } from '../../src/main/utils/myUtil';

describe('myFunction', () => {
  beforeEach(() => vi.clearAllMocks());
  it('handles valid input', () => { ... });
  it('throws on invalid input', () => { expect(() => myFunction(null)).toThrow(); });
});
```

**Integration (Playwright)**:
```typescript
import { test, expect, waitForIPC } from '../helpers/electron-test';

test('IPC flow works', async ({ electronApp, mainWindow }) => {
  await mainWindow.evaluate(() => window.gichat.sendUnreadCount(5));
  const count = await waitForIPC(electronApp, 'unreadCount', 5000);
  expect(count).toBe(5);
});
```

## COMMANDS

```bash
bun run test                    # all tiers
bun run test:unit           # Vitest only
bun run test:coverage       # coverage report → coverage/index.html
bunx vitest run tests/unit/features/badgeIcon.test.ts  # single file
PWDEBUG=1 bunx playwright test  # headed debug mode
```

## ANTI-PATTERNS

- **NEVER** put `vi.mock()` after imports — Vitest hoisting required
- **NEVER** hardcode timeouts — use `waitForIPC()` / `waitForSelector()`
- **NEVER** skip `resetMocks()` in `beforeEach` — state bleeds between tests
- **NEVER** test with `NODE_ENV=test` absent — `configCache.ts` disabled in test env
- **NEVER** launch Electron manually in tests — use fixtures from `electron-test.ts`
- **NEVER** run multiple Electron workers — use `workers: 1`
