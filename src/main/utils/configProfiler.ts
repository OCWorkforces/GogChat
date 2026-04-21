/**
 * Config Store Profiler
 * Measures electron-store read performance to determine if additional caching is beneficial
 */

import log from 'electron-log';
import store from '../config.js';
import type { StoreType } from '../../shared/types/config.js';

/**
 * Profile config store read performance
 * @param iterations - Number of read operations to perform
 * @returns Average read time in milliseconds
 */
export function profileConfigStoreReads(iterations: number = 100): number {
  const keys = [
    'app.autoCheckForUpdates',
    'app.autoLaunchAtLogin',
    'app.startHidden',
    'app.hideMenuBar',
    'app.disableSpellChecker',
    'window.isMaximized',
    'window.bounds',
  ];

  const startTime = performance.now();

  // Perform sequential reads
  for (let i = 0; i < iterations; i++) {
    keys.forEach((key) => {
      store.get(key as keyof StoreType);
    });
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;

  log.info(`[ConfigProfiler] Profiled ${iterations} iterations`);
  log.info(`[ConfigProfiler] Total time: ${totalTime.toFixed(2)}ms`);
  log.info(`[ConfigProfiler] Average per iteration: ${avgTime.toFixed(3)}ms`);
  log.info(`[ConfigProfiler] Average per key read: ${(avgTime / keys.length).toFixed(3)}ms`);

  return avgTime;
}

/**
 * Profile a single config key read
 * @param key - Config key to read
 * @param iterations - Number of times to read
 * @returns Average read time in milliseconds
 */
export function profileSingleKeyRead(key: string, iterations: number = 1000): number {
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    store.get(key as keyof StoreType);
  }

  const endTime = performance.now();
  const avgTime = (endTime - startTime) / iterations;

  log.info(`[ConfigProfiler] Key: ${key}`);
  log.info(`[ConfigProfiler] ${iterations} reads: ${avgTime.toFixed(3)}ms avg`);

  return avgTime;
}

/**
 * Compare store.get() performance with and without potential cache
 * @returns Profiling results
 */
export function compareStorePerformance(): {
  noCacheTime: number;
  potentialSavings: number;
  recommendation: string;
} {
  log.info('[ConfigProfiler] ========== Config Store Performance Analysis ==========');

  // Profile current performance
  const noCacheTime = profileConfigStoreReads(100);

  // Estimate potential savings with cache
  // Cache read time is essentially object property access (~0.001ms)
  const cacheReadTime = 0.001;
  const potentialSavings = noCacheTime - cacheReadTime;

  // Decision threshold: If average read is > 0.1ms, caching might be beneficial
  const threshold = 0.1;
  const isBeneficial = noCacheTime > threshold;

  const recommendation = isBeneficial
    ? `RECOMMENDED: Average read time (${noCacheTime.toFixed(3)}ms) exceeds threshold (${threshold}ms). Implement caching.`
    : `NOT RECOMMENDED: Average read time (${noCacheTime.toFixed(3)}ms) is below threshold (${threshold}ms). electron-store is already fast enough.`;

  log.info(`[ConfigProfiler] Current performance: ${noCacheTime.toFixed(3)}ms per read`);
  log.info(`[ConfigProfiler] Potential savings: ${potentialSavings.toFixed(3)}ms per read`);
  log.info(`[ConfigProfiler] ${recommendation}`);
  log.info('[ConfigProfiler] ===============================================');

  return {
    noCacheTime,
    potentialSavings,
    recommendation,
  };
}
