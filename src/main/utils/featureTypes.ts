/**
 * Feature Types & Factory Helpers
 *
 * Defines all types and interfaces for the feature management system,
 * plus factory functions for creating feature configurations.
 *
 * @module featureTypes
 */

import log from 'electron-log';
import type { BrowserWindow, Tray } from 'electron';
import type { AccountWindowManager } from './accountWindowManager.js';
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

/**
 * Helper to wrap feature initialization with error handling
 *
 * @param featureName - Name of the feature
 * @param init - Feature initialization function
 * @param phase - Initialization phase
 */
export async function initializeFeature(
  featureName: string,
  init: () => Promise<void> | void,
  phase?: 'security' | 'critical' | 'ui' | 'deferred'
): Promise<void> {
  const handler = getErrorHandler();

  try {
    await handler.wrapAsync(
      {
        feature: featureName,
        phase,
        operation: 'initialization',
      },
      async () => {
        await init();
      }
    );

    log.debug(`[ErrorHandler] Feature '${featureName}' initialized successfully`);
  } catch (error: unknown) {
    log.error(`[ErrorHandler] Feature '${featureName}' initialization failed:`, error);
    // Don't rethrow - allow app to continue with other features
  }
}
