/**
 * Feature Lifecycle Manager
 * Centralized management for feature initialization, cleanup, and lifecycle
 */

import { BrowserWindow, Tray, app } from 'electron';
import { logger } from '../utils/logger';
import { perfMonitor } from '../utils/performanceMonitor';

/**
 * Feature priority levels
 */
export enum FeaturePriority {
  CRITICAL = 0, // Security and core functionality
  HIGH = 1, // User-facing critical features
  MEDIUM = 2, // Standard features
  LOW = 3, // Nice-to-have features
  DEFERRED = 4, // Can be loaded after app is ready
}

/**
 * Feature lifecycle states
 */
export enum FeatureState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  FAILED = 'failed',
  DISABLED = 'disabled',
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  name: string;
  description?: string;
  priority: FeaturePriority;
  enabled?: boolean;
  dependencies?: string[]; // Other feature names this depends on
  initialize: (context: FeatureContext) => Promise<void> | void;
  cleanup?: () => Promise<void> | void;
  onError?: (error: Error) => void;
}

/**
 * Feature context passed to initialization
 */
export interface FeatureContext {
  mainWindow: BrowserWindow | null;
  trayIcon: Tray | null;
  isFirstLaunch?: boolean;
  isDevelopment?: boolean;
}

/**
 * Managed feature instance
 */
interface ManagedFeature {
  config: FeatureConfig;
  state: FeatureState;
  error?: Error;
  initTime?: number;
}

/**
 * Feature Lifecycle Manager
 * Manages initialization, dependencies, and cleanup of features
 */
export class FeatureManager {
  private features = new Map<string, ManagedFeature>();
  private context: FeatureContext | null = null;
  private readonly log = logger.feature('FeatureManager');
  private cleanupHandlers: Array<() => Promise<void> | void> = [];

  /**
   * Register a feature
   */
  register(config: FeatureConfig): void {
    if (this.features.has(config.name)) {
      this.log.warn(`Feature already registered: ${config.name}`);
      return;
    }

    this.features.set(config.name, {
      config,
      state: FeatureState.UNINITIALIZED,
    });

    this.log.debug(`Registered feature: ${config.name}`);
  }

  /**
   * Register multiple features
   */
  registerAll(configs: FeatureConfig[]): void {
    configs.forEach((config) => this.register(config));
  }

  /**
   * Set the feature context
   */
  setContext(context: FeatureContext): void {
    this.context = context;
  }

  /**
   * Initialize features by priority
   */
  async initialize(priority?: FeaturePriority): Promise<void> {
    if (!this.context) {
      throw new Error('Context not set. Call setContext() first.');
    }

    const features = this.getFeaturesByPriority(priority);
    this.log.info(
      `Initializing ${features.length} features${priority !== undefined ? ` with priority ${priority}` : ''}`
    );

    for (const feature of features) {
      await this.initializeFeature(feature);
    }
  }

  /**
   * Initialize critical features (blocking)
   */
  async initializeCritical(): Promise<void> {
    await this.initialize(FeaturePriority.CRITICAL);
  }

  /**
   * Initialize deferred features (non-blocking)
   */
  initializeDeferred(): void {
    setImmediate(() => {
      void (async () => {
        try {
          await this.initialize(FeaturePriority.DEFERRED);
        } catch (error) {
          this.log.error('Failed to initialize deferred features:', error);
        }
      })();
    });
  }

  /**
   * Initialize a specific feature
   */
  private async initializeFeature(managed: ManagedFeature): Promise<void> {
    const { config } = managed;

    // Skip if disabled
    if (config.enabled === false) {
      managed.state = FeatureState.DISABLED;
      this.log.debug(`Feature disabled: ${config.name}`);
      return;
    }

    // Skip if already initialized
    if (managed.state === FeatureState.INITIALIZED) {
      return;
    }

    // Check dependencies
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        const depFeature = this.features.get(dep);
        if (!depFeature || depFeature.state !== FeatureState.INITIALIZED) {
          this.log.warn(`Feature ${config.name} depends on ${dep} which is not initialized`);
          return;
        }
      }
    }

    try {
      managed.state = FeatureState.INITIALIZING;
      const startTime = Date.now();

      this.log.info(`Initializing feature: ${config.name}`);
      perfMonitor.mark(`feature-${config.name}-start`);

      // Initialize the feature
      await config.initialize(this.context!);

      managed.state = FeatureState.INITIALIZED;
      managed.initTime = Date.now() - startTime;

      perfMonitor.mark(`feature-${config.name}-end`);
      perfMonitor.measure(
        `feature-${config.name}`,
        `feature-${config.name}-start`,
        `feature-${config.name}-end`
      );

      // Register cleanup handler
      if (config.cleanup) {
        this.cleanupHandlers.push(config.cleanup);
      }

      this.log.info(`Feature initialized: ${config.name} (${managed.initTime}ms)`);
    } catch (error) {
      const err = error as Error;
      managed.state = FeatureState.FAILED;
      managed.error = err;

      this.log.error(`Failed to initialize feature ${config.name}:`, err);

      // Call error handler if provided
      if (config.onError) {
        config.onError(err);
      }

      // Don't throw for non-critical features
      if (config.priority === FeaturePriority.CRITICAL) {
        throw err;
      }
    }
  }

  /**
   * Get features by priority
   */
  private getFeaturesByPriority(priority?: FeaturePriority): ManagedFeature[] {
    const features = Array.from(this.features.values());

    if (priority !== undefined) {
      return features
        .filter((f) => f.config.priority === priority)
        .sort((a, b) => {
          // Sort by dependencies first
          if (a.config.dependencies?.includes(b.config.name)) return 1;
          if (b.config.dependencies?.includes(a.config.name)) return -1;
          return 0;
        });
    }

    return features.sort((a, b) => {
      // Sort by priority first
      if (a.config.priority !== b.config.priority) {
        return a.config.priority - b.config.priority;
      }
      // Then by dependencies
      if (a.config.dependencies?.includes(b.config.name)) return 1;
      if (b.config.dependencies?.includes(a.config.name)) return -1;
      return 0;
    });
  }

  /**
   * Enable a feature
   */
  async enableFeature(name: string): Promise<void> {
    const feature = this.features.get(name);
    if (!feature) {
      throw new Error(`Feature not found: ${name}`);
    }

    feature.config.enabled = true;
    await this.initializeFeature(feature);
  }

  /**
   * Disable a feature
   */
  async disableFeature(name: string): Promise<void> {
    const feature = this.features.get(name);
    if (!feature) {
      throw new Error(`Feature not found: ${name}`);
    }

    feature.config.enabled = false;

    // Run cleanup if available
    if (feature.config.cleanup && feature.state === FeatureState.INITIALIZED) {
      await feature.config.cleanup();
    }

    feature.state = FeatureState.DISABLED;
    this.log.info(`Feature disabled: ${name}`);
  }

  /**
   * Get feature state
   */
  getFeatureState(name: string): FeatureState | undefined {
    return this.features.get(name)?.state;
  }

  /**
   * Check if a feature is initialized
   */
  isInitialized(name: string): boolean {
    return this.getFeatureState(name) === FeatureState.INITIALIZED;
  }

  /**
   * Get all features status
   */
  getStatus(): Record<
    string,
    { state: FeatureState; error?: string; initTime?: number; priority?: string }
  > {
    const status: Record<
      string,
      { state: FeatureState; error?: string; initTime?: number; priority?: string }
    > = {};

    for (const [name, feature] of this.features) {
      status[name] = {
        state: feature.state,
        error: feature.error?.message,
        initTime: feature.initTime,
        priority: FeaturePriority[feature.config.priority],
      };
    }

    return status;
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    total: number;
    initialized: number;
    failed: number;
    disabled: number;
    totalInitTime: number;
  } {
    let initialized = 0;
    let failed = 0;
    let disabled = 0;
    let totalInitTime = 0;

    for (const feature of this.features.values()) {
      switch (feature.state) {
        case FeatureState.INITIALIZED:
          initialized++;
          totalInitTime += feature.initTime || 0;
          break;
        case FeatureState.FAILED:
          failed++;
          break;
        case FeatureState.DISABLED:
          disabled++;
          break;
      }
    }

    return {
      total: this.features.size,
      initialized,
      failed,
      disabled,
      totalInitTime,
    };
  }

  /**
   * Clean up all features
   */
  async cleanup(): Promise<void> {
    this.log.info('Cleaning up features...');

    // Run cleanup handlers in reverse order
    for (const handler of this.cleanupHandlers.reverse()) {
      try {
        await handler();
      } catch (error) {
        this.log.error('Cleanup handler failed:', error);
      }
    }

    // Reset all features
    for (const feature of this.features.values()) {
      feature.state = FeatureState.UNINITIALIZED;
    }

    this.cleanupHandlers = [];
    this.log.info('Features cleaned up');
  }

  /**
   * Reset the manager
   */
  reset(): void {
    this.features.clear();
    this.cleanupHandlers = [];
    this.context = null;
  }
}

/**
 * Global feature manager instance
 */
let globalManager: FeatureManager | null = null;

/**
 * Get or create the global feature manager
 */
export function getFeatureManager(): FeatureManager {
  if (!globalManager) {
    globalManager = new FeatureManager();
  }
  return globalManager;
}

/**
 * Helper to create a feature configuration
 */
export function createFeature(
  name: string,
  priority: FeaturePriority,
  initialize: (context: FeatureContext) => Promise<void> | void,
  options?: {
    description?: string;
    dependencies?: string[];
    cleanup?: () => Promise<void> | void;
    onError?: (error: Error) => void;
  }
): FeatureConfig {
  return {
    name,
    priority,
    initialize,
    ...options,
  };
}

/**
 * Setup app lifecycle hooks for feature management
 */
export function setupFeatureLifecycle(manager: FeatureManager = getFeatureManager()): void {
  // Clean up on app quit
  app.on('will-quit', (event) => {
    event.preventDefault();
    void (async () => {
      await manager.cleanup();
      app.exit();
    })();
  });

  // Log feature status in development
  if (process.env.NODE_ENV === 'development') {
    app.on('ready', () => {
      setTimeout(() => {
        const stats = manager.getStatistics();
        const status = manager.getStatus();

        logger.main.info('Feature Manager Statistics:', stats);
        logger.main.debug('Feature Status:', status);
      }, 5000); // Log after 5 seconds
    });
  }
}
