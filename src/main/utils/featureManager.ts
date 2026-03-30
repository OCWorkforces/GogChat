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

import type {
  FeaturePriority,
  FeatureContext,
  FeatureConfig,
  FeatureState,
} from './featureTypes.js';
import { topologicalSort } from './featureSorter.js';
import { groupFeaturesByDependencyLevel } from './featureSorter.js';

import log from 'electron-log';
import { getErrorHandler } from './errorHandler.js';

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
   * Delegates to the standalone topologicalSort function
   */
  private topologicalSort(features: FeatureConfig[]): FeatureConfig[] {
    return topologicalSort(features);
  }

  /**
   * Group features into batches by dependency level
   * Delegates to the standalone groupFeaturesByDependencyLevel function
   */
  private groupFeaturesByDependencyLevel(features: FeatureConfig[]): FeatureConfig[][] {
    return groupFeaturesByDependencyLevel(features);
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
