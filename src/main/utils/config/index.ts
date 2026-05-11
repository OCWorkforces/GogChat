/**
 * config/ — public API surface for the config utility cluster.
 *
 * Convention: prefer deep imports (`utils/config/<module>.js`) at call sites
 * for tree-shaking and explicit dependencies. This index.ts documents the
 * exported API of the cluster and is the supported import surface.
 */

export * from './configCache.js';
export * from './configSchema.js';
