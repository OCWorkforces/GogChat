/**
 * lifecycle/ — public API surface for the lifecycle utility cluster.
 *
 * Convention: prefer deep imports (`utils/lifecycle/<module>.js`) at call sites
 * for tree-shaking and explicit dependencies. This index.ts documents the
 * exported API of the cluster and is the supported import surface.
 */

export * from './resourceCleanup.js';
export * from './cleanupTypes.js';
export * from './errorHandler.js';
export * from './errors.js';
export * from './errorUtils.js';
export * from './configProfiler.js';
export * from './featureRunner.js';
export * from './featureContextStore.js';
export * from './featureConfigTypes.js';
export * from './performanceMonitor.js';
export * from './performanceExport.js';
export * from './performanceTypes.js';
export * from './cdpMetrics.js';
export * from './logger.js';
