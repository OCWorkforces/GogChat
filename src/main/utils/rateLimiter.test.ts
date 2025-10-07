/**
 * Unit tests for IPC rate limiter
 * Tests rate limiting, cleanup, and security features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IPCRateLimiter } from './rateLimiter';
import { IPC_CHANNELS } from '../../shared/constants';

describe('IPCRateLimiter', () => {
  let limiter: IPCRateLimiter;

  beforeEach(() => {
    limiter = new IPCRateLimiter();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic rate limiting', () => {
    it('should allow requests within rate limit', () => {
      const channel = 'test-channel';

      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }
    });

    it('should block requests exceeding default rate limit', () => {
      const channel = 'test-channel';

      // Exhaust the limit (default 10/sec)
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Next request should be blocked
      expect(limiter.isAllowed(channel)).toBe(false);
    });

    it('should reset rate limit after 1 second', () => {
      const channel = 'test-channel';

      // Exhaust the limit
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel);
      }

      // Should be blocked
      expect(limiter.isAllowed(channel)).toBe(false);

      // Advance time by 1 second
      vi.advanceTimersByTime(1000);

      // Should be allowed again
      expect(limiter.isAllowed(channel)).toBe(true);
    });

    it('should handle custom rate limits', () => {
      const channel = 'custom-channel';
      const customLimit = 5;

      // Should allow up to custom limit
      for (let i = 0; i < customLimit; i++) {
        expect(limiter.isAllowed(channel, customLimit)).toBe(true);
      }

      // Should block next request
      expect(limiter.isAllowed(channel, customLimit)).toBe(false);
    });
  });

  describe('Per-channel rate limits', () => {
    it('should use default channel-specific limits', () => {
      // unreadCount should have stricter limit (5/sec)
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('unreadCount')).toBe(true);
      }
      expect(limiter.isAllowed('unreadCount')).toBe(false);
    });

    it('should isolate rate limits between channels', () => {
      const channel1 = 'channel1';
      const channel2 = 'channel2';

      // Exhaust channel1
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel1);
      }

      // channel1 should be blocked
      expect(limiter.isAllowed(channel1)).toBe(false);

      // channel2 should still be allowed
      expect(limiter.isAllowed(channel2)).toBe(true);
    });

    it('should apply stricter limits to sensitive channels', () => {
      // faviconChanged should have strict limit (5/sec)
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed('faviconChanged')).toBe(true);
      }
      expect(limiter.isAllowed('faviconChanged')).toBe(false);
    });
  });

  describe('Timestamp management', () => {
    it('should only keep timestamps from last second', () => {
      const channel = 'test-channel';

      // Make some requests
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed(channel);
      }

      // Advance time by 1.5 seconds
      vi.advanceTimersByTime(1500);

      // Old timestamps should be cleaned up
      // Should allow new requests (limit refreshed)
      for (let i = 0; i < 10; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }
    });

    it('should track blocked attempts', () => {
      const channel = 'test-channel';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel);
      }

      // Try to exceed limit multiple times
      limiter.isAllowed(channel);
      limiter.isAllowed(channel);
      limiter.isAllowed(channel);

      const stats = limiter.getStats(channel);
      expect(stats?.totalBlocked).toBe(3);
    });
  });

  describe('Statistics', () => {
    it('should return stats for existing channel', () => {
      const channel = 'test-channel';

      limiter.isAllowed(channel);
      limiter.isAllowed(channel);

      const stats = limiter.getStats(channel);
      expect(stats).toBeDefined();
      expect(stats?.messagesLastSecond).toBe(2);
      expect(stats?.totalBlocked).toBe(0);
    });

    it('should return undefined for non-existent channel', () => {
      const stats = limiter.getStats('non-existent');
      expect(stats).toBeUndefined();
    });

    it('should track blocked attempts correctly', () => {
      const channel = 'test-channel';

      // Exhaust limit
      for (let i = 0; i < 10; i++) {
        limiter.isAllowed(channel);
      }

      // Block 5 attempts
      for (let i = 0; i < 5; i++) {
        limiter.isAllowed(channel);
      }

      const stats = limiter.getStats(channel);
      expect(stats?.totalBlocked).toBe(5);
    });
  });

  describe('Cleanup', () => {
    it('should remove old entries during periodic cleanup', () => {
      const testLimiter = new IPCRateLimiter();
      const channel1 = 'old-channel';
      const channel2 = 'recent-channel';

      // Create old entry at time T0
      testLimiter.isAllowed(channel1);
      expect(testLimiter.getStats(channel1)).toBeDefined();

      // Advance time past the inactivity threshold
      // Channels are considered inactive if no activity for 5+ minutes
      // Cleanup runs every 60 seconds
      // After 6 minutes, at least 6 cleanups will have run
      vi.advanceTimersByTime(6 * 60 * 1000);

      // After 6 minutes, channel should be removed as it's been inactive for > 5 min
      expect(testLimiter.getStats(channel1)).toBeUndefined();

      // Create recent entry
      testLimiter.isAllowed(channel2);
      expect(testLimiter.getStats(channel2)).toBeDefined();

      testLimiter.destroy();
    });

    it('should cleanup periodically every minute', () => {
      const testLimiter = new IPCRateLimiter();
      const channel = 'test-channel';

      // Make some requests at T0
      testLimiter.isAllowed(channel);
      expect(testLimiter.getStats(channel)).toBeDefined();

      // Advance time past inactivity threshold
      // This will trigger multiple cleanup cycles
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Old inactive channel should be removed
      expect(testLimiter.getStats(channel)).toBeUndefined();

      testLimiter.destroy();
    });
  });

  describe('Edge cases', () => {
    it('should handle rapid successive requests', () => {
      const channel = 'rapid-channel';
      let allowedCount = 0;

      for (let i = 0; i < 100; i++) {
        if (limiter.isAllowed(channel)) {
          allowedCount++;
        }
      }

      // Should only allow up to the limit
      expect(allowedCount).toBe(10);
    });

    it('should handle zero or negative custom limits gracefully', () => {
      const channel = 'test-channel';

      // Zero limit should block all requests
      expect(limiter.isAllowed(channel, 0)).toBe(false);

      // Negative limit should block all requests
      expect(limiter.isAllowed(channel, -1)).toBe(false);
    });

    it('should handle very large custom limits', () => {
      const channel = 'test-channel';
      const largeLimit = 10000;

      for (let i = 0; i < 100; i++) {
        expect(limiter.isAllowed(channel, largeLimit)).toBe(true);
      }
    });

    it('should handle empty channel names', () => {
      const emptyChannel = '';

      expect(limiter.isAllowed(emptyChannel)).toBe(true);
      expect(limiter.getStats(emptyChannel)).toBeDefined();
    });
  });

  describe('Security scenarios', () => {
    it('should prevent IPC flooding DoS attack', () => {
      const channel = 'attack-channel';
      let blockedCount = 0;

      // Simulate flooding attack (1000 requests)
      for (let i = 0; i < 1000; i++) {
        if (!limiter.isAllowed(channel)) {
          blockedCount++;
        }
      }

      // Should block most requests
      expect(blockedCount).toBeGreaterThan(900);
    });

    it('should prevent channel exhaustion attack', () => {
      // Try to create many channels to exhaust memory
      for (let i = 0; i < 200; i++) {
        limiter.isAllowed(`attack-${i}`);
      }

      // Advance time to trigger cleanup
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Make one more request to trigger cleanup
      limiter.isAllowed('trigger-cleanup');

      // Limiter should still function correctly
      expect(limiter.isAllowed('normal-channel')).toBe(true);
    });

    it('should enforce stricter limits on sensitive channels', () => {
      // Test unreadCount and faviconChanged which have stricter limits (5/sec)
      const sensitiveChannels = ['unreadCount', 'faviconChanged'];

      for (const channel of sensitiveChannels) {
        const testLimiter = new IPCRateLimiter();
        let allowedCount = 0;

        // Try to make many requests
        for (let i = 0; i < 20; i++) {
          if (testLimiter.isAllowed(channel)) {
            allowedCount++;
          }
        }

        // Should allow fewer than default limit (5 instead of 10)
        expect(allowedCount).toBe(5);
        expect(allowedCount).toBeLessThan(10);

        testLimiter.destroy();
      }
    });
  });

  describe('Time window behavior', () => {
    it('should use sliding window for rate limiting', () => {
      const channel = 'sliding-window';

      // Make 5 requests at t=0
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Advance 500ms
      vi.advanceTimersByTime(500);

      // Make 5 more requests at t=500ms
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(channel)).toBe(true);
      }

      // Should be at limit now (10 requests in last second)
      expect(limiter.isAllowed(channel)).toBe(false);

      // Advance another 600ms (total 1100ms from start)
      vi.advanceTimersByTime(600);

      // First batch should have expired, should allow new requests
      expect(limiter.isAllowed(channel)).toBe(true);
    });
  });
});
