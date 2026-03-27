/**
 * Feature Manager - Centralized feature initialization with dependency resolution
 *
 * This module provides:
 * - Declarative feature registration with dependencies and priorities
 * - Automatic dependency resolution and topological sorting
 * - Phased initialization (security → critical → ui → deferred)
 * - Parallel execution within phases for improved startup time
 * - Coordinated cleanup in reverse initialization order
 * - Integration with centralized error handling
 *
 * @module featureManager
 */

import { BrowserWindow, Tray } from 'electron';
import type { AccountWindowManager } from './accountWindowManager.js';

import log from 'electron-log';
import { getErrorHandler } from './errorHandler.js';

/**
 * Feature initialization priority/phase
 * - security: Initialized first, before app.whenReady (sequential)
 * - critical: Core features during app.whenReady (sequential)
 * - ui: UI features during app.whenReady (parallel for performance)
 * - deferred: Non-critical features after UI ready (parallel via setImmediate)
 */
export type FeaturePriority = 'security' | 'critical' | 'ui' | 'deferred';

/**
 * Feature initialization context
 * Provides access to app resources needed by features
 */
export interface FeatureContext {
  mainWindow?: BrowserWindow | null;
  trayIcon?: Tray;
  accountWindowManager?: AccountWindowManager;
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  /** Unique feature identifier */
  name: string;

  /** Initialization priority/phase */
  priority: FeaturePriority;

  /** Feature names this feature depends on (must be initialized first) */
  dependencies?: string[];

  /**
   * Feature initialization function
   * Can be sync or async
   * Receives feature context (mainWindow, trayIcon, etc.)
   */
  init: (context: FeatureContext) => Promise<void> | void;

  /**
   * Optional cleanup function
   * Called in reverse initialization order on app quit
   */
  cleanup?: (context: FeatureContext) => Promise<void> | void;

  /**
   * Whether to use dynamic import (code splitting)
   * When true, the feature is loaded on-demand
   * Recommended for deferred features to improve startup time
   */
  lazy?: boolean;

  /**
   * Optional description for logging
   */
  description?: string;

  /**
   * Whether the feature is required
   * If true, initialization failure will be treated as critical
   * If false, failures are logged but app continues
   */
  required?: boolean;
}

/**
 * Feature initialization state
 */
export interface FeatureState {
  name: string;
  status: 'pending' | 'initializing' | 'initialized' | 'failed';
  error?: Error;
  initTime?: number; // milliseconds
}

/**
 * Feature Manager - Centralized feature orchestration
 */
export class FeatureManager {
  private features = new Map<string, FeatureConfig>();
  private featureStates = new Map<string, FeatureState>();
  private initializationOrder: string[] = [];
  private context: FeatureContext = {};
  private errorHandler = getErrorHandler();

  /**
   * Register a feature
   * @param config - Feature configuration
   */
  register(config: FeatureConfig): void {
    if (this.features.has(config.name)) {
      log.warn(`[FeatureManager] Feature '${config.name}' already registered, skipping`);
      return;
    }

    this.features.set(config.name, config);
    this.featureStates.set(config.name, {
      name: config.name,
      status: 'pending',
    });

    log.debug(`[FeatureManager] Registered feature: ${config.name} (${config.priority})`);
  }

  /**
   * Register multiple features at once
   * @param configs - Array of feature configurations
   */
  registerAll(configs: FeatureConfig[]): void {
    for (const config of configs) {
      this.register(config);
    }

    log.info(`[FeatureManager] Registered ${configs.length} features`);
  }

  /**
   * Update feature context (mainWindow, trayIcon, etc.)
   * @param context - New context values
   */
  updateContext(context: Partial<FeatureContext>): void {
    this.context = { ...this.context, ...context };
    log.debug('[FeatureManager] Context updated');
  }

  /**
   * Initialize all features in the specified phase
   * @param phase - Priority/phase to initialize
   * @returns Promise that resolves when all features in phase are initialized
   */
  async initializePhase(phase: FeaturePriority): Promise<void> {
    const phaseFeatures = Array.from(this.features.values()).filter((f) => f.priority === phase);

    if (phaseFeatures.length === 0) {
      log.debug(`[FeatureManager] No features in phase: ${phase}`);
      return;
    }

    log.info(`[FeatureManager] Initializing ${phaseFeatures.length} features in phase: ${phase}`);

    const startTime = Date.now();

    // Resolve dependencies and sort topologically
    const sorted = this.topologicalSort(phaseFeatures);

    // Group features into dependency-aware batches
    const batches = this.groupFeaturesByDependencyLevel(sorted);

    log.info(
      `[FeatureManager] Executing ${phaseFeatures.length} features in ${batches.length} batch(es)`
    );

    // Execute batches sequentially, features within each batch in parallel
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (!batch) continue;
      const batchStartTime = Date.now();

      log.debug(
        `[FeatureManager] Batch ${i + 1}/${batches.length}: ${batch.map((f) => f.name).join(', ')}`
      );

      // Execute all features in this batch in parallel
      await Promise.all(batch.map((f) => this.initializeFeature(f)));

      const batchDuration = Date.now() - batchStartTime;
      log.debug(`[FeatureManager] Batch ${i + 1} completed in ${batchDuration}ms`);
    }

    const duration = Date.now() - startTime;
    log.info(`[FeatureManager] Phase '${phase}' initialized in ${duration}ms`);
  }

  /**
   * Initialize all registered features in order of priority
   * @returns Promise that resolves when all features are initialized
   */
  async initializeAll(): Promise<void> {
    log.info('[FeatureManager] Starting feature initialization');

    const phases: FeaturePriority[] = ['security', 'critical', 'ui', 'deferred'];

    for (const phase of phases) {
      await this.initializePhase(phase);
    }

    log.info('[FeatureManager] All features initialized');
    this.logInitializationSummary();
  }

  /**
   * Initialize a single feature
   * @param feature - Feature to initialize
   */
  private async initializeFeature(feature: FeatureConfig): Promise<void> {
    const state = this.featureStates.get(feature.name);
    if (!state) {
      log.error(`[FeatureManager] No state found for feature: ${feature.name}`);
      return;
    }

    // Check if already initialized
    if (state.status === 'initialized') {
      log.debug(`[FeatureManager] Feature already initialized: ${feature.name}`);
      return;
    }

    // Check dependencies
    for (const dep of feature.dependencies || []) {
      const depState = this.featureStates.get(dep);
      if (!depState || depState.status !== 'initialized') {
        log.error(
          `[FeatureManager] Feature '${feature.name}' depends on '${dep}' which is not initialized`
        );
        state.status = 'failed';
        state.error = new Error(`Dependency '${dep}' not initialized`);
        return;
      }
    }

    state.status = 'initializing';
    const startTime = Date.now();

    try {
      log.debug(`[FeatureManager] Initializing feature: ${feature.name}`);

      // Use error handler for context tracking
      await this.errorHandler.wrapAsync(
        {
          feature: feature.name,
          phase: feature.priority,
          operation: 'initialization',
          metadata: {
            description: feature.description,
            dependencies: feature.dependencies,
          },
        },
        async () => {
          await feature.init(this.context);
        }
      );

      state.status = 'initialized';
      state.initTime = Date.now() - startTime;
      this.initializationOrder.push(feature.name);

      log.info(
        `[FeatureManager] ✓ ${feature.name} initialized in ${state.initTime}ms${feature.description ? ` (${feature.description})` : ''}`
      );
    } catch (error: unknown) {
      state.status = 'failed';
      state.error = error instanceof Error ? error : new Error(String(error));

      const errorMessage = `Feature '${feature.name}' initialization failed`;

      if (feature.required) {
        log.error(`[FeatureManager] ✗ ${errorMessage} (REQUIRED):`, error);
        // For required features, we might want to quit the app
        // For now, just log as error
      } else {
        log.warn(`[FeatureManager] ✗ ${errorMessage} (optional):`, error);
      }
    }
  }

  /**
   * Topological sort features by dependencies
   * Returns features in initialization order
   */
  private topologicalSort(features: FeatureConfig[]): FeatureConfig[] {
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
  private groupFeaturesByDependencyLevel(features: FeatureConfig[]): FeatureConfig[][] {
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

  /**
   * Cleanup all features in reverse initialization order
   */
  async cleanup(): Promise<void> {
    log.info('[FeatureManager] Starting feature cleanup');

    // Cleanup in reverse order
    const reversedOrder = [...this.initializationOrder].reverse();

    for (const name of reversedOrder) {
      const feature = this.features.get(name);
      if (!feature || !feature.cleanup) {
        continue;
      }

      try {
        log.debug(`[FeatureManager] Cleaning up feature: ${name}`);
        await feature.cleanup(this.context);
        log.debug(`[FeatureManager] ✓ ${name} cleaned up`);
      } catch (error: unknown) {
        log.error(`[FeatureManager] ✗ Failed to cleanup feature '${name}':`, error);
      }
    }

    log.info('[FeatureManager] Feature cleanup completed');
  }

  /**
   * Get initialization state for a feature
   */
  getFeatureState(name: string): FeatureState | undefined {
    return this.featureStates.get(name);
  }

  /**
   * Get all feature states
   */
  getAllStates(): Map<string, FeatureState> {
    return new Map(this.featureStates);
  }

  /**
   * Get initialization summary statistics
   */
  getSummary(): {
    total: number;
    initialized: number;
    failed: number;
    pending: number;
    totalTime: number;
  } {
    let initialized = 0;
    let failed = 0;
    let pending = 0;
    let totalTime = 0;

    for (const state of this.featureStates.values()) {
      if (state.status === 'initialized') {
        initialized++;
        totalTime += state.initTime || 0;
      } else if (state.status === 'failed') {
        failed++;
      } else {
        pending++;
      }
    }

    return {
      total: this.featureStates.size,
      initialized,
      failed,
      pending,
      totalTime,
    };
  }

  /**
   * Log initialization summary
   */
  private logInitializationSummary(): void {
    const summary = this.getSummary();

    log.info('[FeatureManager] ========== Initialization Summary ==========');
    log.info(`[FeatureManager]   Total features: ${summary.total}`);
    log.info(`[FeatureManager]   ✓ Initialized: ${summary.initialized}`);
    log.info(`[FeatureManager]   ✗ Failed: ${summary.failed}`);
    log.info(`[FeatureManager]   ⧖ Pending: ${summary.pending}`);
    log.info(`[FeatureManager]   Total time: ${summary.totalTime}ms`);

    if (summary.failed > 0) {
      log.info('[FeatureManager] Failed features:');
      for (const state of this.featureStates.values()) {
        if (state.status === 'failed') {
          log.info(
            `[FeatureManager]     - ${state.name}: ${state.error?.message || 'Unknown error'}`
          );
        }
      }
    }

    log.info('[FeatureManager] ================================================');
  }

  /**
   * Check if a feature is initialized
   */
  isInitialized(name: string): boolean {
    const state = this.featureStates.get(name);
    return state?.status === 'initialized';
  }

  /**
   * Get initialization order
   */
  getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }
}

// Singleton instance
let featureManager: FeatureManager | null = null;

/**
 * Get the global feature manager instance
 */
export function getFeatureManager(): FeatureManager {
  if (!featureManager) {
    featureManager = new FeatureManager();
  }
  return featureManager;
}

/**
 * Helper: Create a feature config for a static feature
 * @param name - Feature name
 * @param priority - Initialization priority
 * @param init - Initialization function
 * @param options - Additional options
 */
export function createFeature(
  name: string,
  priority: FeaturePriority,
  init: (context: FeatureContext) => Promise<void> | void,
  options?: {
    dependencies?: string[];
    cleanup?: (context: FeatureContext) => Promise<void> | void;
    description?: string;
    required?: boolean;
  }
): FeatureConfig {
  return {
    name,
    priority,
    init,
    ...options,
  };
}

/**
 * Helper: Create a feature config with dynamic import (lazy loading)
 * @param name - Feature name
 * @param priority - Initialization priority
 * @param importFn - Dynamic import function that returns the feature module
 * @param options - Additional options
 */
export function createLazyFeature(
  name: string,
  priority: FeaturePriority,
  importFn: () => Promise<{
    default: (context: FeatureContext) => Promise<void> | void;
  }>,
  options?: {
    dependencies?: string[];
    description?: string;
    required?: boolean;
  }
): FeatureConfig {
  return {
    name,
    priority,
    lazy: true,
    init: async (context: FeatureContext) => {
      const module = await importFn();
      await module.default(context);
    },
    ...options,
  };
}
