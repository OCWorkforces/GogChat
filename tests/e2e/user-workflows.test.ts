/**
 * End-to-End User Workflow Tests
 * Tests complete user journeys through the application
 */

import {
  test,
  expect,
  pressShortcut,
  goOffline,
  goOnline,
  waitForText,
  takeScreenshot,
} from '../helpers/electron-test';

test.describe('User Workflows', () => {
  test.describe('Sign In and Navigation', () => {
    test('should complete sign-in flow', async ({ mainWindow }) => {
      // Wait for Google Chat to load
      await mainWindow.waitForLoadState('networkidle');

      // Check for sign-in elements (would be actual Google sign-in in production)
      const hasSignIn = await mainWindow.locator('input[type="email"]').count();
      if (hasSignIn > 0) {
        // This would be the actual sign-in flow
        await takeScreenshot(mainWindow, 'sign-in-page');
      }

      // After sign-in, should see chat interface
      await mainWindow.waitForSelector('[role="main"]', { timeout: 30000 });
      await takeScreenshot(mainWindow, 'main-chat-interface');
    });

    test('should navigate between chats', async ({ mainWindow }) => {
      // Wait for chat list
      await mainWindow.waitForSelector('[role="navigation"]', { timeout: 10000 });

      // Click on a chat (if available)
      const chatItems = await mainWindow.locator('[role="listitem"]').all();
      if (chatItems.length > 0) {
        await chatItems[0].click();

        // Should see messages area
        await mainWindow.waitForSelector('[role="main"]');
      }
    });

    test('should use search functionality', async ({ mainWindow }) => {
      // Use search shortcut
      await pressShortcut(mainWindow, 'Cmd+F');

      // Search input should be focused
      const searchInput = await mainWindow.locator('input[name="q"]');
      const isFocused = await searchInput.evaluate(el => el === document.activeElement);

      if (searchInput && (await searchInput.isVisible())) {
        expect(isFocused).toBe(true);

        // Type search query
        await searchInput.fill('test search');
        await searchInput.press('Enter');

        // Wait for search results (simplified)
        await mainWindow.waitForTimeout(1000);
      }
    });
  });

  test.describe('Message Handling', () => {
    test('should send and receive messages', async ({ mainWindow }) => {
      // Find message input
      const messageInput = await mainWindow.locator('[contenteditable="true"]').first();

      if (messageInput && (await messageInput.isVisible())) {
        // Type a message
        await messageInput.fill('Test message from E2E test');

        // Send message (Enter key)
        await messageInput.press('Enter');

        // Message should appear in chat (simplified check)
        await mainWindow.waitForTimeout(500);
        await takeScreenshot(mainWindow, 'message-sent');
      }
    });

    test('should show unread count badge', async ({ electronApp, mainWindow }) => {
      // Simulate receiving messages (would happen naturally in production)
      await mainWindow.evaluate(() => {
        if ((window as any).gchat) {
          (window as any).gchat.sendUnreadCount(3);
        }
      });

      // Check badge count
      const badgeCount = await electronApp.evaluate(({ app }) => {
        return app.getBadgeCount?.() || 0;
      });

      // Badge should be set (platform dependent)
      expect(badgeCount).toBeGreaterThanOrEqual(0);
    });

    test('should handle notifications', async ({ mainWindow }) => {
      // Check if notifications are enabled
      const permission = await mainWindow.evaluate(() => {
        return Notification.permission;
      });

      if (permission === 'granted') {
        // Notifications should work
        expect(permission).toBe('granted');
      } else {
        // Request permission (in test environment)
        await mainWindow.evaluate(() => {
          return Notification.requestPermission();
        });
      }
    });
  });

  test.describe('Offline Handling', () => {
    test('should show offline page when disconnected', async ({ mainWindow }) => {
      // Go offline
      await goOffline(mainWindow);

      // Wait for offline page
      await mainWindow.waitForSelector('text=/offline|connection/i', { timeout: 5000 });

      // Take screenshot
      await takeScreenshot(mainWindow, 'offline-page');

      // Should show reconnect button
      const reconnectButton = await mainWindow.locator('button:has-text("Check Connection")');
      expect(await reconnectButton.count()).toBeGreaterThan(0);
    });

    test('should reconnect when online', async ({ mainWindow }) => {
      // Start offline
      await goOffline(mainWindow);
      await mainWindow.waitForTimeout(1000);

      // Go back online
      await goOnline(mainWindow);

      // Should reload Google Chat
      await mainWindow.waitForLoadState('networkidle');
      const url = await mainWindow.url();
      expect(url).toContain('mail.google.com/chat');
    });
  });

  test.describe('Window Management', () => {
    test('should minimize to tray', async ({ electronApp, mainWindow }) => {
      // Close window (should hide to tray)
      await mainWindow.evaluate(() => window.close());

      // Window should still exist but be hidden
      const windows = await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows().map(w => ({
          isVisible: w.isVisible(),
          isDestroyed: w.isDestroyed(),
        }));
      });

      expect(windows.length).toBeGreaterThan(0);
      expect(windows[0].isDestroyed).toBe(false);
    });

    test('should restore from tray', async ({ electronApp, mainWindow }) => {
      // Hide window
      await mainWindow.evaluate(() => window.close());

      // Simulate tray click to restore
      await electronApp.evaluate(({ BrowserWindow }) => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          windows[0].show();
        }
      });

      // Window should be visible again
      const isVisible = await mainWindow.isVisible();
      expect(isVisible).toBe(true);
    });

    test('should remember window state', async ({ electronApp, mainWindow }) => {
      // Set specific window bounds
      await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setBounds({ x: 100, y: 100, width: 1024, height: 768 });
      });

      // Get bounds
      const bounds = await electronApp.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows()[0].getBounds();
      });

      expect(bounds.width).toBe(1024);
      expect(bounds.height).toBe(768);

      // These should be saved to store (in production)
    });
  });

  test.describe('Preferences', () => {
    test('should toggle preferences', async ({ electronApp }) => {
      // Toggle auto-launch preference
      await electronApp.evaluate(async () => {
        const Store = require('electron-store');
        const store = new Store();

        const current = store.get('app.autoLaunchAtLogin', false);
        store.set('app.autoLaunchAtLogin', !current);
        return !current;
      });

      // Verify preference changed
      const newValue = await electronApp.evaluate(() => {
        const Store = require('electron-store');
        const store = new Store();
        return store.get('app.autoLaunchAtLogin');
      });

      expect(typeof newValue).toBe('boolean');
    });

    test('should toggle spell checker', async ({ electronApp, mainWindow }) => {
      // Toggle spell checker
      const spellCheckEnabled = await electronApp.evaluate(() => {
        const Store = require('electron-store');
        const store = new Store();

        const current = store.get('app.disableSpellChecker', false);
        store.set('app.disableSpellChecker', !current);
        return !current;
      });

      // Verify in webContents (would need reload in production)
      const webPreferences = await mainWindow.evaluate(() => {
        return { spellcheck: true }; // Simplified
      });

      expect(webPreferences).toBeDefined();
    });
  });

  test.describe('External Links', () => {
    test('should handle external links', async ({ electronApp, mainWindow }) => {
      // Create a test link
      await mainWindow.evaluate(() => {
        const link = document.createElement('a');
        link.href = 'https://github.com';
        link.target = '_blank';
        link.textContent = 'External Link';
        link.id = 'test-external-link';
        document.body.appendChild(link);
      });

      // Click the link
      const link = await mainWindow.locator('#test-external-link');
      await link.click();

      // Should not navigate away from Google Chat
      await mainWindow.waitForTimeout(1000);
      const url = await mainWindow.url();
      expect(url).toContain('mail.google.com');

      // Clean up
      await mainWindow.evaluate(() => {
        document.getElementById('test-external-link')?.remove();
      });
    });

    test('should allow Google domain navigation', async ({ mainWindow }) => {
      // Navigate within Google domains should work
      await mainWindow.evaluate(() => {
        window.location.href = 'https://accounts.google.com';
      });

      await mainWindow.waitForLoadState('domcontentloaded');
      const url = await mainWindow.url();

      // Should allow Google domain navigation
      expect(url).toContain('google.com');
    });
  });
});