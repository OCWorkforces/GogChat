/**
 * Tests for performanceMonitor utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPerformanceMonitor,
  destroyPerformanceMonitor,
  perfMonitor,
} from './performanceMonitor';

// Mock electron-log
vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  },
}));

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    // Reset singleton before each test
    destroyPerformanceMonitor();
    vi.clearAllMocks();
  });

  afterEach(() => {
    destroyPerformanceMonitor();
  });

  describe('Singleton pattern', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getPerformanceMonitor();
      const instance2 = getPerformanceMonitor();

      expect(instance1).toBe(instance2);
    });

    it('should export convenience singleton', () => {
      // perfMonitor is created at module load time, so just verify it exists and works
      expect(perfMonitor).toBeDefined();
      expect(perfMonitor.mark).toBeDefined();
      expect(perfMonitor.getMetrics).toBeDefined();
    });

    it('should create new instance after destroy', () => {
      const instance1 = getPerformanceMonitor();
      destroyPerformanceMonitor();
      const instance2 = getPerformanceMonitor();

      // Should be different instances
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('mark()', () => {
    it('should record a marker', () => {
      const monitor = getPerformanceMonitor();
      monitor.mark('test-marker');

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveProperty('test-marker');
      expect(typeof metrics['test-marker']).toBe('number');
    });

    it('should record multiple markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      monitor.mark('marker2');
      monitor.mark('marker3');

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveProperty('marker1');
      expect(metrics).toHaveProperty('marker2');
      expect(metrics).toHaveProperty('marker3');
    });

    it('should record markers with increasing timestamps', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('first');
      monitor.mark('second');
      monitor.mark('third');

      const metrics = monitor.getMetrics();
      expect(metrics['first']).toBeLessThanOrEqual(metrics['second']);
      expect(metrics['second']).toBeLessThanOrEqual(metrics['third']);
    });

    it('should accept custom log message', () => {
      const monitor = getPerformanceMonitor();

      // Should not throw with custom message
      expect(() => {
        monitor.mark('marker', 'Custom message');
      }).not.toThrow();
    });

    it('should update existing marker if called again', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker');
      const firstTime = monitor.getMetrics()['marker'];

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait 10ms
      }

      monitor.mark('marker');
      const secondTime = monitor.getMetrics()['marker'];

      expect(secondTime).toBeGreaterThan(firstTime);
    });

    it('should respect enabled state', () => {
      const monitor = getPerformanceMonitor();

      monitor.setEnabled(false);
      monitor.mark('disabled-marker');

      const metrics = monitor.getMetrics();
      expect(metrics).not.toHaveProperty('disabled-marker');
    });
  });

  describe('measure()', () => {
    it('should measure time between two markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('start');

      // Simulate some work
      const workStart = Date.now();
      while (Date.now() - workStart < 5) {
        // Busy wait 5ms
      }

      monitor.mark('end');

      const duration = monitor.measure('start', 'end');

      expect(duration).not.toBeNull();
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(typeof duration).toBe('number');
    });

    it('should return positive duration for sequential markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('first');
      monitor.mark('second');

      const duration = monitor.measure('first', 'second');

      expect(duration).not.toBeNull();
      expect(duration!).toBeGreaterThanOrEqual(0);
    });

    it('should return null if start marker not found', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('end');

      const duration = monitor.measure('nonexistent', 'end');

      expect(duration).toBeNull();
    });

    it('should return null if end marker not found', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('start');

      const duration = monitor.measure('start', 'nonexistent');

      expect(duration).toBeNull();
    });

    it('should return null if both markers not found', () => {
      const monitor = getPerformanceMonitor();

      const duration = monitor.measure('nonexistent1', 'nonexistent2');

      expect(duration).toBeNull();
    });

    it('should measure multiple intervals', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('a');
      monitor.mark('b');
      monitor.mark('c');
      monitor.mark('d');

      const ab = monitor.measure('a', 'b');
      const bc = monitor.measure('b', 'c');
      const cd = monitor.measure('c', 'd');

      expect(ab).not.toBeNull();
      expect(bc).not.toBeNull();
      expect(cd).not.toBeNull();
    });
  });

  describe('getMetrics()', () => {
    it('should return all recorded markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      monitor.mark('marker2');
      monitor.mark('marker3');

      const metrics = monitor.getMetrics();

      expect(Object.keys(metrics)).toHaveLength(3);
      expect(metrics).toHaveProperty('marker1');
      expect(metrics).toHaveProperty('marker2');
      expect(metrics).toHaveProperty('marker3');
    });

    it('should return empty object if no markers', () => {
      const monitor = getPerformanceMonitor();

      const metrics = monitor.getMetrics();

      expect(metrics).toEqual({});
      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should return snapshot of metrics', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      const metrics1 = monitor.getMetrics();

      monitor.mark('marker2');
      const metrics2 = monitor.getMetrics();

      // First snapshot should not be affected by later marks
      expect(Object.keys(metrics1)).toHaveLength(1);
      expect(Object.keys(metrics2)).toHaveLength(2);
    });
  });

  describe('getTotalElapsed()', () => {
    it('should return elapsed time since start', () => {
      const monitor = getPerformanceMonitor();

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait 10ms
      }

      const elapsed = monitor.getTotalElapsed();

      expect(elapsed).toBeGreaterThanOrEqual(10);
      expect(typeof elapsed).toBe('number');
    });

    it('should increase over time', () => {
      const monitor = getPerformanceMonitor();

      const elapsed1 = monitor.getTotalElapsed();

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 5) {
        // Busy wait 5ms
      }

      const elapsed2 = monitor.getTotalElapsed();

      expect(elapsed2).toBeGreaterThan(elapsed1);
    });
  });

  describe('logSummary()', () => {
    it('should log all markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      monitor.mark('marker2');

      // Should not throw
      expect(() => monitor.logSummary()).not.toThrow();
    });

    it('should respect enabled state', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      monitor.setEnabled(false);

      // Should not throw even when disabled
      expect(() => monitor.logSummary()).not.toThrow();
    });

    it('should handle empty metrics', () => {
      const monitor = getPerformanceMonitor();

      // Should not throw with no markers
      expect(() => monitor.logSummary()).not.toThrow();
    });
  });

  describe('setEnabled()', () => {
    it('should enable monitoring', () => {
      const monitor = getPerformanceMonitor();

      monitor.setEnabled(true);
      monitor.mark('enabled-marker');

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveProperty('enabled-marker');
    });

    it('should disable monitoring', () => {
      const monitor = getPerformanceMonitor();

      monitor.setEnabled(false);
      monitor.mark('disabled-marker');

      const metrics = monitor.getMetrics();
      expect(metrics).not.toHaveProperty('disabled-marker');
    });

    it('should toggle monitoring state', () => {
      const monitor = getPerformanceMonitor();

      monitor.setEnabled(false);
      monitor.mark('disabled1');

      monitor.setEnabled(true);
      monitor.mark('enabled1');

      monitor.setEnabled(false);
      monitor.mark('disabled2');

      const metrics = monitor.getMetrics();
      expect(metrics).not.toHaveProperty('disabled1');
      expect(metrics).toHaveProperty('enabled1');
      expect(metrics).not.toHaveProperty('disabled2');
    });
  });

  describe('reset()', () => {
    it('should clear all markers', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      monitor.mark('marker2');

      monitor.reset();

      const metrics = monitor.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should reset start time', () => {
      const monitor = getPerformanceMonitor();

      // Wait a bit
      const start = Date.now();
      while (Date.now() - start < 10) {
        // Busy wait 10ms
      }

      const elapsedBefore = monitor.getTotalElapsed();
      monitor.reset();
      const elapsedAfter = monitor.getTotalElapsed();

      // After reset, elapsed should be close to 0
      expect(elapsedAfter).toBeLessThan(elapsedBefore);
      expect(elapsedAfter).toBeLessThan(10);
    });

    it('should allow marking after reset', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('before-reset');
      monitor.reset();
      monitor.mark('after-reset');

      const metrics = monitor.getMetrics();
      expect(metrics).not.toHaveProperty('before-reset');
      expect(metrics).toHaveProperty('after-reset');
    });
  });

  describe('destroyPerformanceMonitor()', () => {
    it('should reset the monitor', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('marker1');
      destroyPerformanceMonitor();

      // Get new instance
      const newMonitor = getPerformanceMonitor();
      const metrics = newMonitor.getMetrics();

      expect(Object.keys(metrics)).toHaveLength(0);
    });

    it('should handle being called multiple times', () => {
      getPerformanceMonitor();

      destroyPerformanceMonitor();
      destroyPerformanceMonitor();
      destroyPerformanceMonitor();

      // Should not throw
      expect(() => getPerformanceMonitor()).not.toThrow();
    });

    it('should handle being called without instance', () => {
      // Don't create instance first
      expect(() => destroyPerformanceMonitor()).not.toThrow();
    });
  });

  describe('Real-world usage scenarios', () => {
    it('should track startup sequence', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('app-start');
      monitor.mark('config-loaded');
      monitor.mark('window-created');
      monitor.mark('app-ready');

      const metrics = monitor.getMetrics();
      expect(Object.keys(metrics)).toHaveLength(4);

      // Verify sequential timing
      expect(metrics['app-start']).toBeLessThanOrEqual(metrics['config-loaded']);
      expect(metrics['config-loaded']).toBeLessThanOrEqual(metrics['window-created']);
      expect(metrics['window-created']).toBeLessThanOrEqual(metrics['app-ready']);
    });

    it('should measure feature initialization times', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('feature-start');
      // Simulate work
      const start = Date.now();
      while (Date.now() - start < 5) {
        // Busy wait
      }
      monitor.mark('feature-end');

      const duration = monitor.measure('feature-start', 'feature-end');
      expect(duration).not.toBeNull();
      expect(duration!).toBeGreaterThanOrEqual(5);
    });

    it('should track multiple parallel operations', () => {
      const monitor = getPerformanceMonitor();

      monitor.mark('op1-start');
      monitor.mark('op2-start');
      monitor.mark('op1-end');
      monitor.mark('op2-end');

      const op1Duration = monitor.measure('op1-start', 'op1-end');
      const op2Duration = monitor.measure('op2-start', 'op2-end');

      expect(op1Duration).not.toBeNull();
      expect(op2Duration).not.toBeNull();
    });
  });
});
