import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { median, mergeMedian, resolveElectronBinary } from './headless-startup.js';

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

describe('resolveElectronBinary', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gogchat-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeExecutable(filePath, contents = '#!/bin/sh\nexit 0\n') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    fs.chmodSync(filePath, 0o755);
  }

  it('prefers the unpacked macOS Electron executable when its framework is present', () => {
    const direct = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
    const framework = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Electron Framework'
    );
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(direct);
    writeExecutable(framework);
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(direct);
  });

  it('falls back to the wrapper when the direct executable exists but the framework is missing', () => {
    const direct = path.join(
      tmpRoot,
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron'
    );
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(direct);
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(wrapper);
  });

  it('falls back to the wrapper when the direct executable is absent', () => {
    const wrapper = path.join(tmpRoot, 'node_modules', '.bin', 'electron');
    writeExecutable(wrapper);

    expect(resolveElectronBinary(tmpRoot)).toBe(wrapper);
  });
});
