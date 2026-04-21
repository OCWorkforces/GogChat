import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.test.ts',
  workers: 1,
  timeout: 60000,
  retries: 0,
  reporter: 'list',
  use: {
    headless: true,
  },
});
