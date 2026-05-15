import { describe, expect, it } from 'vitest';

import { median, mergeMedian } from './headless-startup.js';

describe('headless-startup median aggregation', () => {
  it('computes medians for odd and even numeric samples', () => {
    expect(median([5, 1, 3, 2, 4])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('ignores non-finite and non-number values', () => {
    expect(median([Number.NaN, 'x', 2, Number.POSITIVE_INFINITY, 6])).toBe(4);
    expect(median([Number.NaN, 'x', undefined])).toBeNull();
  });

  it('preserves a single-run metrics object unchanged', () => {
    const run = { markers: { a: 1 }, memorySnapshots: [{ heapUsed: 10 }] };
    expect(mergeMedian([run])).toBe(run);
  });

  it('merges markers and first/last memory snapshots by median', () => {
    const merged = mergeMedian([
      {
        markers: { start: 0, end: 10 },
        memorySnapshots: [
          { timestamp: 0, heapUsed: 10, heapTotal: 20, external: 1, rss: 100 },
          { timestamp: 10, heapUsed: 30, heapTotal: 40, external: 2, rss: 120 },
        ],
        timestamp: 'run-1',
      },
      {
        markers: { start: 0, end: 20, extra: 50 },
        memorySnapshots: [
          { timestamp: 0, heapUsed: 20, heapTotal: 30, external: 3, rss: 200 },
          { timestamp: 20, heapUsed: 50, heapTotal: 70, external: 4, rss: 250 },
        ],
        timestamp: 'run-2',
      },
      {
        markers: { start: 0, end: 30 },
        memorySnapshots: [
          { timestamp: 0, heapUsed: 30, heapTotal: 40, external: 5, rss: 300 },
          { timestamp: 30, heapUsed: 70, heapTotal: 90, external: 6, rss: 350 },
        ],
        timestamp: 'run-3',
      },
    ]);

    expect(merged.markers).toEqual({ start: 0, end: 20, extra: 50 });
    expect(merged.memorySnapshots).toEqual([
      { timestamp: 0, heapUsed: 20, heapTotal: 30, external: 3, rss: 200 },
      { timestamp: 20, heapUsed: 50, heapTotal: 70, external: 4, rss: 250 },
    ]);
    expect(merged.aggregation).toEqual({ strategy: 'median', runs: 3, successfulRuns: 3 });
    expect(merged.timestamp).toBe('run-3');
  });
});
