/**
 * Feature Configuration Types
 *
 * Standalone type definitions shared between {@link FeatureManager} and
 * {@link featureSorter}. Extracted into its own module to break the
 * type-only circular dependency that existed between
 * `featureManager.ts` ↔ `featureSorter.ts`.
 *
 * Both `featureManager.ts` and `featureSorter.ts` import from this file.
 * `featureManager.ts` re-exports these symbols for backward compatibility.
 *
 * @module featureConfigTypes
 */

import type { BrowserWindow, Tray } from 'electron';
import type { IAccountWindowManager } from '../../shared/types/window.js';

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
  accountWindowManager?: IAccountWindowManager;
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
