/**
 * Feature Dependency Sorter
 *
 * Pure functions for topological sorting and dependency-aware batch grouping
 * of feature configurations. Extracted from FeatureManager for modularity.
 *
 * @module featureSorter
 */

import log from 'electron-log';
import type { FeatureConfig } from './featureTypes.js';

/**
 * Topological sort features by dependencies
 * Returns features in initialization order
 * @param features - Features to sort
 * @returns Sorted features array
 * @throws Error if circular dependency detected
 */
export function topologicalSort(features: FeatureConfig[]): FeatureConfig[] {
  const sorted: FeatureConfig[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (feature: FeatureConfig): void => {
    if (visited.has(feature.name)) {
      return;
    }

    if (visiting.has(feature.name)) {
      throw new Error(`Circular dependency detected: ${feature.name}`);
    }

    visiting.add(feature.name);

    // Visit dependencies first
    for (const depName of feature.dependencies || []) {
      const dep = features.find((f) => f.name === depName);
      if (dep) {
        visit(dep);
      } else {
        // Dependency might be in a different phase (already initialized)
        log.debug(
          `[FeatureManager] Dependency '${depName}' not in current phase (${feature.priority})`
        );
      }
    }

    visiting.delete(feature.name);
    visited.add(feature.name);
    sorted.push(feature);
  };

  for (const feature of features) {
    visit(feature);
  }

  return sorted;
}

/**
 * Group features into batches by dependency level
 * Features in the same batch have no dependencies on each other and can execute in parallel
 * @param features - Features to group (should be topologically sorted)
 * @returns Array of batches, where each batch can execute in parallel
 */
export function groupFeaturesByDependencyLevel(features: FeatureConfig[]): FeatureConfig[][] {
  const batches: FeatureConfig[][] = [];
  const assignedFeatures = new Set<string>();

  // Helper: Check if all dependencies of a feature are in previous batches
  const areDependenciesSatisfied = (feature: FeatureConfig): boolean => {
    if (!feature.dependencies || feature.dependencies.length === 0) {
      return true;
    }

    return feature.dependencies.every((dep) => {
      // Check if dependency is in assigned features (previous batches)
      // OR if dependency is in a different phase (already initialized)
      return assignedFeatures.has(dep) || !features.some((f) => f.name === dep);
    });
  };

  // Keep grouping until all features are assigned
  let remainingFeatures = [...features];

  while (remainingFeatures.length > 0) {
    // Find features that can execute in this batch
    const currentBatch = remainingFeatures.filter((f) => areDependenciesSatisfied(f));

    if (currentBatch.length === 0) {
      // This should never happen if features are properly sorted
      log.error(
        '[FeatureManager] Unable to create batches - possible unresolved cross-phase dependency'
      );
      // Add remaining features to final batch to avoid infinite loop
      batches.push(remainingFeatures);
      break;
    }

    // Add batch and mark features as assigned
    batches.push(currentBatch);
    currentBatch.forEach((f) => assignedFeatures.add(f.name));

    // Remove assigned features from remaining
    remainingFeatures = remainingFeatures.filter((f) => !assignedFeatures.has(f.name));
  }

  return batches;
}
