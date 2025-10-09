/**
 * Playwright Configuration for Electron Testing
 * Provides E2E and integration testing capabilities
 */

import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests/integration',
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],

  // Test timeout
  timeout: 30000,

  // Number of parallel workers
  workers: process.env.CI ? 1 : 2,

  // Retry failed tests
  retries: process.env.CI ? 2 : 0,

  // Test output
  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/reports/html', open: 'never' }],
    ['json', { outputFile: 'tests/reports/results.json' }],
  ],

  // Global test settings
  use: {
    // Electron-specific configuration will be added in test files
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Project configuration
  projects: [
    {
      name: 'electron',
      testDir: './tests/integration',
    },
  ],

  // Output folder for test artifacts
  outputDir: 'tests/results',
};

export default config;