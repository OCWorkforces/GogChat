/**
 * ipc/ — public API surface for the ipc utility cluster.
 *
 * Convention: prefer deep imports (`utils/ipc/<module>.js`) at call sites
 * for tree-shaking and explicit dependencies. This index.ts documents the
 * exported API of the cluster and is the supported import surface.
 */

export * from './ipcHelper.js';
export * from './ipcDeduplicator.js';
export * from './ipcDeduplicationPatterns.js';
export * from './ipcFastPath.js';
export * from './ipcCommonValidators.js';
export * from './rateLimiter.js';
export * from './benignLogFilter.js';
export * from './defineIPC.js';
