# tests/

This directory contains the comprehensive test suite for the GChat Electron application. Tests are organized by type (unit, integration, e2e, performance) and use Playwright for E2E/integration testing and Vitest for unit tests.

## Overview

**Testing strategy:**
- **Unit tests**: Test individual modules in isolation (Vitest)
- **Integration tests**: Test interactions between modules (Playwright + Electron)
- **E2E tests**: Test complete user workflows (Playwright + Electron)
- **Performance tests**: Track and prevent performance regressions (Playwright)

**Tools:**
- **Playwright**: Browser automation and Electron testing
- **Vitest**: Fast unit test framework
- **better-sqlite3**: In-memory databases for testing
- **Mock Electron**: Mocked Electron APIs for unit tests

**Test coverage goals:**
- Unit tests: 80%+ coverage
- Integration tests: Critical IPC flows and feature interactions
- E2E tests: Key user workflows
- Performance tests: Startup time, memory usage

## Directory Structure

```
tests/
├── unit/                    # Unit tests for individual modules
│   └── features/           # Feature-specific unit tests
├── integration/            # Integration tests (multi-module)
├── e2e/                    # End-to-end user workflow tests
├── performance/            # Performance regression tests
├── helpers/                # Test helper utilities
├── mocks/                  # Mock implementations
└── CLAUDE.md              # This file
```

## Test Files

### helpers/electron-test.ts
Playwright test helpers for Electron application testing.

**Purpose**: Provides reusable fixtures and utilities for E2E and integration tests.

#### Key Exports

**Test fixtures:**
```typescript
export interface ElectronTestFixtures {
  electronApp: ElectronApplication;  // Launched Electron app
  mainWindow: Page;                  // Main window page object
  appPath: string;                   // Path to compiled app
}

export const test = base.extend<ElectronTestFixtures>({...})
export { expect }
```

**Helper functions:**
```typescript
// IPC testing
export async function waitForIPC(app, channel, timeout?): Promise<any>
export async function sendIPCFromMain(app, channel, data?): Promise<void>

// App information
export async function getAppInfo(app): Promise<{ name, version, isPackaged }>
export async function getWindowState(page): Promise<{ isVisible, isMaximized, ... }>
export async function isFeatureEnabled(app, featureName): Promise<boolean>

// Network mocking
export async function mockNetworkResponse(page, url, response): Promise<void>

// UI helpers
export async function waitForText(page, text, options?): Promise<void>
export async function takeScreenshot(page, name, metadata?): Promise<Buffer>

// Cleanup
export async function cleanupTestData(app): Promise<void>

// Network simulation
export async function goOffline(page): Promise<void>
export async function goOnline(page): Promise<void>

// Keyboard
export async function pressShortcut(page, shortcut): Promise<void>

// Security
export async function checkSecuritySettings(app): Promise<{...}>
```

#### Usage Examples

**Basic E2E test:**
```typescript
import { test, expect } from '../helpers/electron-test';

test('app launches successfully', async ({ electronApp, mainWindow }) => {
  // App is automatically launched and ready
  expect(await mainWindow.title()).toBeTruthy();

  // Check security settings
  const security = await checkSecuritySettings(electronApp);
  expect(security.contextIsolation).toBe(true);
  expect(security.nodeIntegration).toBe(false);
  expect(security.sandbox).toBe(true);
});
```

**Testing IPC communication:**
```typescript
import { test, expect, waitForIPC } from '../helpers/electron-test';

test('unread count IPC works', async ({ electronApp, mainWindow }) => {
  // Send IPC from renderer
  await mainWindow.evaluate(() => {
    (window as any).gchat.sendUnreadCount(5);
  });

  // Wait for IPC in main process
  const count = await waitForIPC(electronApp, 'unread-count', 5000);
  expect(count).toBe(5);
});
```

**Testing with network mocking:**
```typescript
import { test, expect, mockNetworkResponse } from '../helpers/electron-test';

test('handles offline state', async ({ mainWindow, goOffline }) => {
  // Mock network response
  await mockNetworkResponse(mainWindow, /google.com/, {
    status: 503,
    body: 'Service Unavailable',
  });

  // Verify offline page is shown
  await expect(mainWindow.locator('h1')).toContainText('You are offline');
});
```

### mocks/electron.ts
Mock implementation of Electron APIs for unit testing.

**Purpose**: Allows testing main process code without launching Electron.

#### Key Exports

**Mocked modules:**
```typescript
export const app: Partial<Electron.App>
export const ipcMain: Partial<Electron.IpcMain>
export const BrowserWindow: jest.Mock<Electron.BrowserWindow>
export const Tray: jest.Mock<Electron.Tray>
export const Menu: Partial<Electron.Menu>
export const dialog: Partial<Electron.Dialog>
export const shell: Partial<Electron.Shell>
export const nativeImage: Partial<Electron.NativeImage>
```

**Helper functions:**
```typescript
export function resetMocks(): void
export function mockUserDataPath(path: string): void
export function emitAppEvent(event: string, ...args: any[]): void
```

#### Usage Examples

**Unit testing with mocks:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { app, ipcMain, BrowserWindow, resetMocks } from '../mocks/electron';

// Mock Electron before importing modules that use it
vi.mock('electron', () => require('../mocks/electron'));

import { createWindow } from '../../src/main/windowWrapper';

describe('windowWrapper', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('creates a window with security settings', () => {
    const window = createWindow();

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: expect.objectContaining({
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        }),
      })
    );
  });
});
```

### unit/features/badgeIcon.test.ts
Example unit test for the badge icon feature.

**Tests:**
- Badge icon initialization
- Unread count updates
- Platform-specific badge behavior
- Rate limiting
- Icon caching

### integration/ipc-communication.test.ts
Integration tests for IPC communication between processes.

**Tests:**
- Unread count IPC flow
- Favicon change notifications
- Search shortcut triggering
- Online/offline status updates
- Notification click handling
- Rate limiting enforcement
- Input validation

### integration/app-launch.test.ts
Integration tests for app launch sequence.

**Tests:**
- App initialization
- Window creation
- Critical features load
- Deferred features load
- Security settings
- Feature dependencies

### e2e/user-workflows.test.ts
End-to-end tests for complete user workflows.

**Tests:**
- Launch app → view Google Chat → close app
- Minimize to tray → restore from tray
- Keyboard shortcuts (search, quit, etc.)
- Badge count updates as messages arrive
- Offline mode → online mode transition
- Settings changes persist across restarts

### performance/performance-regression.test.ts
Performance regression tests to track metrics over time.

**Metrics tracked:**
- App startup time
- Window creation time
- First paint time
- Memory usage
- Feature initialization time
- IPC message latency

**Thresholds:**
- Startup time: < 3000ms
- Window creation: < 500ms
- First paint: < 1000ms
- Memory usage: < 200MB
- Feature init: < 2000ms total

## Configuration

### playwright.config.ts
Playwright configuration for E2E and integration tests.

**Key settings:**
```typescript
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.(test|spec)\.(ts|js)$/,
  timeout: 30000,
  fullyParallel: false,  // Electron apps can't run in parallel
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // One worker for Electron tests
  reporter: [
    ['html'],
    ['list'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
```

### vitest.config.ts
Vitest configuration for unit tests.

**Key settings:**
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['tests/**', 'lib/**', '*.config.*'],
    },
    setupFiles: ['./tests/setup.ts'],
  },
})
```

## Running Tests

**All tests:**
```bash
npm test
```

**Unit tests only:**
```bash
npm run test:unit
```

**Integration tests:**
```bash
npm run test:integration
```

**E2E tests:**
```bash
npm run test:e2e
```

**Performance tests:**
```bash
npm run test:performance
```

**Watch mode (unit tests):**
```bash
npm run test:watch
```

**Coverage report:**
```bash
npm run test:coverage
```

**Specific test file:**
```bash
npx vitest run tests/unit/features/badgeIcon.test.ts
npx playwright test tests/e2e/user-workflows.test.ts
```

## Writing Tests

### Unit Test Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Electron before imports
vi.mock('electron', () => require('../mocks/electron'));

import { myFunction } from '../../src/main/utils/myUtil';

describe('myFunction', () => {
  beforeEach(() => {
    // Reset mocks and state
    vi.clearAllMocks();
  });

  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle errors', () => {
    expect(() => myFunction(null)).toThrow('Invalid input');
  });
});
```

### Integration Test Pattern

```typescript
import { test, expect, waitForIPC } from '../helpers/electron-test';

test.describe('Feature Integration', () => {
  test('feature A communicates with feature B', async ({ electronApp, mainWindow }) => {
    // Setup
    await mainWindow.waitForLoadState('domcontentloaded');

    // Action
    await mainWindow.evaluate(() => {
      (window as any).triggerFeatureA();
    });

    // Assertion
    const result = await waitForIPC(electronApp, 'feature-b-response');
    expect(result).toBeTruthy();
  });
});
```

### E2E Test Pattern

```typescript
import { test, expect } from '../helpers/electron-test';

test.describe('User Workflow', () => {
  test('user can complete task', async ({ electronApp, mainWindow }) => {
    // Step 1: Navigate
    await mainWindow.goto('about:blank');

    // Step 2: Interact
    await mainWindow.click('button#my-button');

    // Step 3: Verify
    await expect(mainWindow.locator('h1')).toContainText('Success');

    // Step 4: Cleanup
    await electronApp.close();
  });
});
```

### Performance Test Pattern

```typescript
import { test, expect } from '../helpers/electron-test';

test.describe('Performance Regression', () => {
  test('app starts within 3 seconds', async ({ electronApp }) => {
    const startTime = Date.now();

    await electronApp.firstWindow();

    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000);
  });
});
```

## Best Practices

**1. Test isolation:**
- Each test should be independent
- Use `beforeEach` to reset state
- Clean up resources in `afterEach`
- Don't rely on test execution order

**2. Descriptive test names:**
```typescript
// Good
test('should display unread count when messages arrive', ...)

// Bad
test('unread count', ...)
```

**3. Use fixtures:**
```typescript
// Good - reuse fixtures
test('my test', async ({ electronApp, mainWindow }) => {
  // Test code
});

// Avoid - manual setup
test('my test', async () => {
  const app = await electron.launch(...);
  // Test code
  await app.close();
});
```

**4. Mock external dependencies:**
```typescript
// Mock network requests
await mockNetworkResponse(page, /api\.example\.com/, {
  body: JSON.stringify({ data: 'mocked' }),
});

// Mock file system (in unit tests)
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => 'mocked content'),
}));
```

**5. Test error cases:**
```typescript
test('handles invalid input gracefully', () => {
  expect(() => validateInput(null)).toThrow();
  expect(() => validateInput('')).toThrow();
  expect(() => validateInput(123)).toThrow();
});
```

**6. Use snapshots sparingly:**
```typescript
// Good - for stable UI components
expect(component).toMatchSnapshot();

// Avoid - for dynamic data
expect(currentTimestamp).toMatchSnapshot();  // Will always fail
```

**7. Performance test thresholds:**
```typescript
// Define reasonable thresholds
const MAX_STARTUP_TIME = 3000;  // 3 seconds
const MAX_MEMORY_MB = 200;

expect(startupTime).toBeLessThan(MAX_STARTUP_TIME);
expect(memoryUsageMB).toBeLessThan(MAX_MEMORY_MB);
```

**8. Clean up after tests:**
```typescript
test.afterEach(async ({ electronApp }) => {
  await cleanupTestData(electronApp);
  await electronApp.close();
});
```

## Debugging Tests

**Run tests in headed mode:**
```bash
PWDEBUG=1 npx playwright test
```

**Enable verbose logging:**
```bash
DEBUG=pw:api npx playwright test
```

**Pause test execution:**
```typescript
test('debug test', async ({ page }) => {
  await page.pause();  // Opens Playwright Inspector
  // ... rest of test
});
```

**Take screenshots on failure:**
```typescript
test('my test', async ({ page }) => {
  try {
    // Test code
  } catch (error) {
    await takeScreenshot(page, 'failure-screenshot');
    throw error;
  }
});
```

**Check console logs:**
```typescript
page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', (err) => console.error('PAGE ERROR:', err));
```

## CI/CD Integration

**GitHub Actions example:**
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: xvfb-run --auto-servernum npm run test:e2e

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results/
```

## Troubleshooting

**Test timeouts:**
- Increase timeout in config: `timeout: 60000`
- Use `test.slow()` for slow tests
- Check for missing `await` statements

**Flaky tests:**
- Add explicit waits: `await page.waitForSelector()`
- Use `waitForIPC()` instead of arbitrary timeouts
- Check for race conditions

**Electron app doesn't launch:**
- Ensure TypeScript is compiled: `npm run ts`
- Check `appPath` in fixtures
- Verify `NODE_ENV=test` is set

**Mock not working:**
- Mock before imports: `vi.mock()` must be at top of file
- Reset mocks in `beforeEach`: `vi.clearAllMocks()`
- Check mock implementation

**Tests pass locally but fail in CI:**
- Use `xvfb-run` for headless testing on Linux
- Check for platform-specific code
- Ensure deterministic test data

## Test Coverage

**Current coverage goals:**
- **Overall**: 80%+
- **Critical paths**: 100% (security, IPC, data persistence)
- **Utilities**: 90%+
- **Features**: 70%+
- **UI components**: 60%+

**Generate coverage report:**
```bash
npm run test:coverage
open coverage/index.html
```

**Coverage enforcement:**
```typescript
// vitest.config.ts
coverage: {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
}
```

## Contributing

When adding new features:
1. Write unit tests first (TDD)
2. Add integration tests for IPC flows
3. Add E2E tests for user-facing features
4. Add performance tests if startup/runtime impact expected
5. Ensure all tests pass: `npm test`
6. Check coverage: `npm run test:coverage`

## Resources

- **Playwright Docs**: https://playwright.dev/
- **Vitest Docs**: https://vitest.dev/
- **Electron Testing**: https://www.electronjs.org/docs/latest/tutorial/automated-testing
- **Testing Best Practices**: https://testingjavascript.com/
