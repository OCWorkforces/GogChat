/**
 * platform/ — public API surface for the platform utility cluster.
 *
 * Convention: prefer deep imports (`utils/platform/<module>.js`) at call sites
 * for tree-shaking and explicit dependencies. This index.ts documents the
 * exported API of the cluster and is the supported import surface.
 */

export * from './platformUtils.js';
export * from './platformDetection.js';
export * from './platformHelpers.js';
export * from './packageInfo.js';
export * from './windowUtils.js';
export * from './iconCache.js';
export * from './badgeHelpers.js';
export * from './trayIconState.js';
