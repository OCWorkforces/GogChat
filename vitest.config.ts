import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/preload/**',
        'src/offline/**',
        'src/shared/types.ts',
        // Main process entry points (require full Electron environment)
        'src/main/index.ts',
        'src/main/windowWrapper.ts',
        // Complex features requiring extensive Electron mocking
        'src/main/features/appMenu.ts',
        'src/main/features/badgeIcon.ts',
        'src/main/features/externalLinks.ts',
        'src/main/features/certificatePinning.ts',
        'src/main/features/inOnline.ts',
        'src/main/features/handleNotification.ts',
        'src/main/features/windowState.ts',
        'src/main/features/trayIcon.ts',
        'src/main/features/aboutPanel.ts',
        'src/main/features/openAtLogin.ts',
        'src/main/features/firstLaunch.ts',
        'src/main/features/userAgent.ts',
        'src/main/features/closeToTray.ts',
        'src/main/features/singleInstance.ts',
        'src/main/features/appUpdates.ts',
        'src/main/features/reportExceptions.ts',
      ]
    }
  }
});
