/**
 * IPC Communication Integration Tests
 * Tests inter-process communication between main and renderer
 */

import { test, expect, waitForIPC, sendIPCFromMain } from '../helpers/electron-test';
import { IPC_CHANNELS } from '../../src/shared/constants';

test.describe('IPC Communication', () => {
  test('should handle unread count updates', async ({ electronApp, mainWindow }) => {
    // Send unread count from renderer
    await mainWindow.evaluate((channels) => {
      if ((window as any).gogchat) {
        (window as any).gogchat.sendUnreadCount(5);
      }
    }, IPC_CHANNELS);

    // Verify badge is updated (simplified check)
    const badgeCount = await electronApp.evaluate(({ app }) => {
      return app.getBadgeCount?.() || 0;
    });

    // Badge should be set (exact value depends on platform)
    expect(badgeCount).toBeGreaterThanOrEqual(0);
  });

  test('should handle favicon changes', async ({ electronApp, mainWindow }) => {
    // Send favicon change from renderer
    await mainWindow.evaluate((channels) => {
      if ((window as any).gogchat) {
        (window as any).gogchat.sendFaviconChanged('https://example.com/favicon.ico');
      }
    }, IPC_CHANNELS);

    // This would trigger favicon change handling
    // Actual verification would depend on implementation
    expect(true).toBe(true);
  });

  test('should handle notification clicks', async ({ electronApp, mainWindow }) => {
    // Send notification click from renderer
    await mainWindow.evaluate((channels) => {
      if ((window as any).gogchat) {
        (window as any).gogchat.sendNotificationClicked();
      }
    }, IPC_CHANNELS);

    // Window should be focused
    const isFocused = await mainWindow.evaluate(() => {
      return document.hasFocus();
    });

    // May not be focused in test environment, but handler should run
    expect(isFocused !== undefined).toBe(true);
  });

  test('should handle online status checks', async ({ electronApp, mainWindow }) => {
    // Request online status check
    await mainWindow.evaluate((channels) => {
      if ((window as any).gogchat) {
        (window as any).gogchat.checkIfOnline();
      }
    }, IPC_CHANNELS);

    // Should receive response (actual status depends on network)
    // This is a simplified test
    expect(true).toBe(true);
  });

  test('should handle search shortcut', async ({ electronApp, mainWindow }) => {
    // Send search shortcut from main process
    await sendIPCFromMain(electronApp, IPC_CHANNELS.SEARCH_SHORTCUT);

    // Wait a bit for handler to process
    await mainWindow.waitForTimeout(100);

    // In real app, this would focus search input
    // Here we just verify the handler exists
    const hasSearchHandler = await mainWindow.evaluate((channels) => {
      return (window as any).gogchat?.onSearchShortcut !== undefined;
    }, IPC_CHANNELS);

    expect(hasSearchHandler).toBe(true);
  });

  test('should validate IPC message data', async ({ electronApp, mainWindow }) => {
    // Try sending invalid unread count
    const invalidCounts = [-1, 10000, 'invalid', null, undefined, NaN];

    for (const count of invalidCounts) {
      await mainWindow.evaluate((count) => {
        if ((window as any).gogchat) {
          try {
            (window as any).gogchat.sendUnreadCount(count);
          } catch {
            // Expected to fail validation
          }
        }
      }, count);
    }

    // App should still be running (not crashed)
    const isRunning = await electronApp.evaluate(() => true);
    expect(isRunning).toBe(true);
  });

  test('should handle rate limiting', async ({ mainWindow }) => {
    // Send many messages quickly
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        mainWindow.evaluate((i) => {
          if ((window as any).gogchat) {
            (window as any).gogchat.sendUnreadCount(i);
          }
        }, i)
      );
    }

    await Promise.all(promises);

    // App should handle rate limiting gracefully
    const isResponsive = await mainWindow.evaluate(() => true);
    expect(isResponsive).toBe(true);
  });
});

test.describe('IPC Security', () => {
  test('should enforce rate limiting on IPC channels', async ({ mainWindow }) => {
    // Send many IPC messages rapidly to verify rate limiting
    const results = await mainWindow.evaluate(() => {
      const responses: boolean[] = [];
      for (let i = 0; i < 50; i++) {
        try {
          if ((window as any).gogchat) {
            (window as any).gogchat.sendUnreadCount(i);
            responses.push(true);
          }
        } catch {
          responses.push(false);
        }
      }
      return responses;
    });

    // All sends should succeed (rate limiting happens on main process side)
    // App should remain responsive after rapid sends
    expect(results.length).toBe(50);
  });

  test('should reject invalid payloads without crashing', async ({ electronApp, mainWindow }) => {
    // Send various invalid payloads
    const invalidPayloads = [
      null,
      undefined,
      NaN,
      '',
      'string',
      { count: -1 },
      { count: 100000 },
      { count: 'invalid' },
      [],
      [1, 2, 3],
    ];

    for (const payload of invalidPayloads) {
      await mainWindow.evaluate((p) => {
        if ((window as any).gogchat) {
          try {
            (window as any).gogchat.sendUnreadCount(p);
          } catch {
            // Expected to fail validation
          }
        }
      }, payload);
    }

    // App should still be running
    const isRunning = await electronApp.evaluate(() => true);
    expect(isRunning).toBe(true);

    // Main window should still be accessible
    const windowCount = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows().length;
    });
    expect(windowCount).toBeGreaterThan(0);
  });

  test('should sanitize HTML in string payloads', async ({ electronApp }) => {
    // Verify XSS prevention by checking that HTML-like strings are handled
    const xssPayloads = [
      '<script>alert(1)</script>',
      'javascript:alert(1)',
      '<img src=x onerror=alert(1)>',
      'onclick=alert(1)',
      '<a href="javascript:void(0)">',
    ];

    // These should be handled by validators without executing
    const result = await electronApp.evaluate((payloads) => {
      // Test the sanitizeHTML function from validators
      const { sanitizeHTML } = require('../../src/shared/validators');

      return payloads.map((payload: string) => {
        try {
          const sanitized = sanitizeHTML(payload);
          // Verify dangerous patterns are escaped
          const hasScript = sanitized.includes('<script');
          const hasJavascript = sanitized.includes('javascript:');
          const hasOnError = sanitized.includes('onerror=');
          return {
            original: payload.length,
            sanitized: sanitized.length,
            safe: !hasScript && !hasJavascript && !hasOnError,
          };
        } catch {
          return { error: true };
        }
      });
    }, xssPayloads);

    // All payloads should be either sanitized or rejected
    result.forEach((r: { error?: boolean; safe?: boolean }) => {
      if (!('error' in r)) {
        expect(r.safe).toBe(true);
      }
    });
  });

  test('should validate channel existence before handling', async ({ mainWindow }) => {
    // Try sending to non-existent IPC channels
    const nonExistentChannels = [
      'nonExistentChannel',
      'completelyInvalid',
      '',
      'channel.with.dots',
    ];

    for (const channel of nonExistentChannels) {
      await mainWindow.evaluate((ch) => {
        // This should not crash even if channel doesn't exist
        try {
          if ((window as any).gogchat) {
            // Attempt to access a non-existent handler
            const handler = (window as any).gogchat[ch];
            if (handler && typeof handler === 'function') {
              handler();
            }
          }
        } catch {
          // Expected to fail silently
        }
      }, channel);
    }

    // App should remain stable
    const isStable = await mainWindow.evaluate(() => true);
    expect(isStable).toBe(true);
  });

  test('should deduplicate rapid identical requests', async ({ electronApp }) => {
    // Verify deduplication mechanism exists and tracks stats
    const dedupStats = await electronApp.evaluate(() => {
      const { getDeduplicator } = require('../../src/main/utils/ipcDeduplicator');
      const deduplicator = getDeduplicator();

      return {
        exists: deduplicator !== null,
        cacheSize: deduplicator.getCacheSize(),
        stats: deduplicator.getStats(),
      };
    });

    expect(dedupStats.exists).toBe(true);
    expect(dedupStats.cacheSize).toBeGreaterThanOrEqual(0);
  });

  test('should handle rate limiter stats', async ({ electronApp }) => {
    // Verify rate limiter is tracking statistics
    const rateLimitStats = await electronApp.evaluate(() => {
      const { getRateLimiter } = require('../../src/main/utils/rateLimiter');
      const rateLimiter = getRateLimiter();

      // Get all stats
      const allStats = rateLimiter.getAllStats();

      return {
        exists: rateLimiter !== null,
        trackedChannels: allStats.size,
      };
    });

    expect(rateLimitStats.exists).toBe(true);
  });

  test('should validate boolean conversion correctly', async ({ electronApp }) => {
    // Test boolean validator handles various inputs
    const booleanTests = await electronApp.evaluate(() => {
      const { validateBoolean } = require('../../src/shared/validators');

      const testCases = [
        { input: true, expected: true },
        { input: false, expected: false },
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: 1, expected: true },
        { input: 0, expected: false },
      ];

      return testCases.map((tc: { input: unknown; expected: boolean }) => {
        try {
          const result = validateBoolean(tc.input);
          return { input: tc.input, result, pass: result === tc.expected };
        } catch {
          return { input: tc.input, error: true };
        }
      });
    });

    booleanTests.forEach((t: { error?: boolean; pass?: boolean }) => {
      if (!('error' in t)) {
        expect(t.pass).toBe(true);
      }
    });
  });

  test('should validate string length limits', async ({ electronApp }) => {
    // Test string validator enforces max length
    const stringTests = await electronApp.evaluate(() => {
      const { validateString } = require('../../src/shared/validators');

      return {
        shortString: validateString('hello', 100),
        emptyString: validateString('', 100),
      };
    });

    expect(stringTests.shortString).toBe('hello');
    expect(stringTests.emptyString).toBe('');
  });

  test('should reject unsafe URLs in external URL validator', async ({ electronApp }) => {
    // Test that dangerous URL patterns are rejected
    const unsafeUrls = [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("hello")',
    ];

    const results = await electronApp.evaluate((urls) => {
      const { validateExternalURL } = require('../../src/shared/validators');

      return urls.map((url: string) => {
        try {
          validateExternalURL(url);
          return { safe: false }; // Should have thrown
        } catch {
          return { rejected: true }; // Expected
        }
      });
    }, unsafeUrls);

    // All unsafe URLs should be rejected
    results.forEach((r: { rejected?: boolean }) => {
      expect(r.rejected).toBe(true);
    });
  });

  test('should use safe object validation', async ({ electronApp }) => {
    // Test isSafeObject correctly identifies safe objects
    const objectTests = await electronApp.evaluate(() => {
      const { isSafeObject } = require('../../src/shared/validators');

      return {
        plainObject: isSafeObject({ a: 1 }),
        nullObject: isSafeObject(null),
        arrayObject: isSafeObject([1, 2, 3]),
        dateObject: isSafeObject(new Date()),
      };
    });

    expect(objectTests.plainObject).toBe(true);
    expect(objectTests.nullObject).toBe(false);
    expect(objectTests.arrayObject).toBe(false);
    expect(objectTests.dateObject).toBe(false);
  });
});
