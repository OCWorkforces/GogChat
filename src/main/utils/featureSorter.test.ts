/**
 * Unit tests for featureSorter utility.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron-log', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { topologicalSort, groupFeaturesByDependencyLevel } from './featureSorter';
import type { FeatureConfig } from './featureConfigTypes.js';
import log from 'electron-log';

function makeFeature(
  name: string,
  dependencies: string[] = [],
  priority: 'security' | 'critical' | 'ui' | 'deferred' = 'deferred'
): FeatureConfig {
  return {
    name,
    priority,
    dependencies,
    init: () => {},
  };
}

describe('featureSorter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('topologicalSort', () => {
    it('returns features in dependency order', () => {
      const a = makeFeature('a');
      const b = makeFeature('b', ['a']);
      const c = makeFeature('c', ['b']);

      const sorted = topologicalSort([c, b, a]);
      const names = sorted.map((f) => f.name);

      expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
      expect(names.indexOf('b')).toBeLessThan(names.indexOf('c'));
    });

    it('handles features with no dependencies', () => {
      const a = makeFeature('a');
      const b = makeFeature('b');
      const c = makeFeature('c');

      const sorted = topologicalSort([a, b, c]);
      expect(sorted).toHaveLength(3);
    });

    it('returns empty array for empty input', () => {
      const sorted = topologicalSort([]);
      expect(sorted).toEqual([]);
    });

    it('throws on circular dependency', () => {
      const a = makeFeature('a', ['b']);
      const b = makeFeature('b', ['a']);

      expect(() => topologicalSort([a, b])).toThrow('Circular dependency detected');
    });

    it('handles self-circular dependency', () => {
      const a = makeFeature('a', ['a']);

      expect(() => topologicalSort([a])).toThrow('Circular dependency detected');
    });

    it('logs debug when dependency is in a different phase', () => {
      const a = makeFeature('a', ['external-dep']);

      const sorted = topologicalSort([a]);
      expect(sorted).toHaveLength(1);
      expect(log.debug).toHaveBeenCalledWith(
        expect.stringContaining("Dependency 'external-dep' not in current phase")
      );
    });

    it('handles diamond dependency graph', () => {
      const a = makeFeature('a');
      const b = makeFeature('b', ['a']);
      const c = makeFeature('c', ['a']);
      const d = makeFeature('d', ['b', 'c']);

      const sorted = topologicalSort([d, c, b, a]);
      const names = sorted.map((f) => f.name);

      expect(names.indexOf('a')).toBeLessThan(names.indexOf('b'));
      expect(names.indexOf('a')).toBeLessThan(names.indexOf('c'));
      expect(names.indexOf('b')).toBeLessThan(names.indexOf('d'));
      expect(names.indexOf('c')).toBeLessThan(names.indexOf('d'));
    });

    it('handles already-sorted input', () => {
      const a = makeFeature('a');
      const b = makeFeature('b', ['a']);

      const sorted = topologicalSort([a, b]);
      expect(sorted.map((f) => f.name)).toEqual(['a', 'b']);
    });
  });

  describe('groupFeaturesByDependencyLevel', () => {
    it('groups independent features into a single batch', () => {
      const features = [makeFeature('a'), makeFeature('b'), makeFeature('c')];

      const batches = groupFeaturesByDependencyLevel(features);

      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(3);
    });

    it('creates multiple batches for chained dependencies', () => {
      const a = makeFeature('a');
      const b = makeFeature('b', ['a']);
      const c = makeFeature('c', ['b']);

      const sorted = topologicalSort([c, b, a]);
      const batches = groupFeaturesByDependencyLevel(sorted);

      expect(batches).toHaveLength(3);
      expect(batches[0].map((f) => f.name)).toEqual(['a']);
      expect(batches[1].map((f) => f.name)).toEqual(['b']);
      expect(batches[2].map((f) => f.name)).toEqual(['c']);
    });

    it('groups features at the same dependency level together', () => {
      const a = makeFeature('a');
      const b = makeFeature('b', ['a']);
      const c = makeFeature('c', ['a']);

      const sorted = topologicalSort([c, b, a]);
      const batches = groupFeaturesByDependencyLevel(sorted);

      expect(batches).toHaveLength(2);
      expect(batches[0].map((f) => f.name)).toEqual(['a']);
      expect(batches[1].map((f) => f.name)).toContain('b');
      expect(batches[1].map((f) => f.name)).toContain('c');
    });

    it('returns empty array for empty input', () => {
      const batches = groupFeaturesByDependencyLevel([]);
      expect(batches).toEqual([]);
    });

    it('handles cross-phase dependencies (dep not in feature list)', () => {
      const a = makeFeature('a', ['external-dep']);
      const b = makeFeature('b', ['a']);

      const sorted = topologicalSort([b, a]);
      const batches = groupFeaturesByDependencyLevel(sorted);

      // 'a' depends on 'external-dep' which isn't in the list → treated as satisfied
      expect(batches).toHaveLength(2);
      expect(batches[0].map((f) => f.name)).toEqual(['a']);
      expect(batches[1].map((f) => f.name)).toEqual(['b']);
    });

    it('handles batch creation failure path (unresolvable in-phase dependencies)', () => {
      // Create features where areDependenciesSatisfied returns false for all remaining
      // This happens when a feature depends on another feature in the same list
      // but that dependency is never satisfied (simulates the break path)
      // We simulate this by crafting features with circular-like references
      // that won't cause topologicalSort to fail (because they reference in-list features
      // that haven't been assigned yet on first pass, but then get assigned)
      // Actually, to hit the `currentBatch.length === 0` break path, we need
      // features where dependencies exist in the list but can never be in a prior batch.
      // This can happen with manually constructed (non-sorted) input.

      // Manually construct unsorted features with cross-dependencies
      // that will deadlock the batch algorithm
      const a = makeFeature('a', ['b']);
      const b = makeFeature('b', ['a']);

      // Pass directly to groupFeaturesByDependencyLevel WITHOUT topologicalSort
      // This simulates the "should never happen" path
      const batches = groupFeaturesByDependencyLevel([a, b]);

      // The function should not infinite-loop; it breaks and pushes remaining to final batch
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Unable to create batches'));
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(2);
    });
  });
});
