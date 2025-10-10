/**
 * Centralized error handling for the main process
 *
 * This module provides:
 * - Global error handlers for unhandled rejections and exceptions
 * - Error context tracking (feature name, initialization phase)
 * - Optional Sentry integration (disabled by default)
 * - Graceful shutdown on critical errors
 *
 * @module errorHandler
 */

import { app } from 'electron';
import log from 'electron-log';
import type Store from 'electron-store';
import type { StoreType } from '../../shared/types.js';

/**
 * Error context provides additional information about where/when an error occurred
 */
export interface ErrorContext {
  feature?: string; // Feature name (e.g., 'certificatePinning', 'trayIcon')
  phase?: 'security' | 'critical' | 'ui' | 'deferred'; // Initialization phase
  operation?: string; // Operation being performed (e.g., 'initialization', 'cleanup')
  metadata?: Record<string, unknown>; // Additional context
}

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  enableSentry?: boolean; // Enable Sentry integration (requires @sentry/electron package)
  sentryDsn?: string; // Sentry DSN (data source name)
  environment?: string; // Environment name (development, production)
  gracefulShutdown?: boolean; // Whether to gracefully shutdown on critical errors
}

/**
 * Singleton error handler instance
 */
class ErrorHandler {
  private config: ErrorHandlerConfig;
  private errorContextStack: ErrorContext[] = [];
  private isInitialized = false;
  private isSentryEnabled = false;
  private Sentry?: {
    captureException: (error: unknown, context?: Record<string, unknown>) => void;
  }; // Sentry SDK (optional dependency)

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      enableSentry: false,
      gracefulShutdown: true,
      environment: process.env.NODE_ENV || 'production',
      ...config,
    };
  }

  /**
   * Initialize the error handler
   * Sets up global handlers for unhandledRejection and uncaughtException
   */
  async initialize(store?: Store<StoreType>): Promise<void> {
    if (this.isInitialized) {
      log.warn('[ErrorHandler] Already initialized');
      return;
    }

    log.info('[ErrorHandler] Initializing centralized error handler');

    // Load Sentry config from store if available
    if (store) {
      const enableSentry = store.get('app.enableSentry', false);
      const sentryDsn = store.get('app.sentryDsn', undefined);

      if (enableSentry && sentryDsn) {
        this.config.enableSentry = true;
        this.config.sentryDsn = sentryDsn;
      }
    }

    // Initialize Sentry if enabled
    if (this.config.enableSentry && this.config.sentryDsn) {
      await this.initializeSentry();
    }

    // Register global error handlers
    this.registerGlobalHandlers();

    this.isInitialized = true;
    log.info('[ErrorHandler] Centralized error handler initialized');
  }

  /**
   * Initialize Sentry integration
   */
  private async initializeSentry(): Promise<void> {
    try {
      // Dynamic import to avoid requiring @sentry/electron as a dependency
      // Users can install it if they want Sentry integration
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const sentryModule = await import('@sentry/electron');

      // Initialize Sentry with config
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ('init' in sentryModule && typeof sentryModule.init === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        sentryModule.init({
          dsn: this.config.sentryDsn,
          environment: this.config.environment,
          // Enable automatic breadcrumbs
          integrations: [],
          // Sample rate (1.0 = 100% of errors)
          sampleRate: 1.0,
        });
      }

      // Store the Sentry module for later use (only captureException method)
      if (
        'captureException' in sentryModule &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        typeof sentryModule.captureException === 'function'
      ) {
        this.Sentry = {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          captureException: sentryModule.captureException as (
            error: unknown,
            context?: Record<string, unknown>
          ) => void,
        };
        this.isSentryEnabled = true;
        log.info('[ErrorHandler] Sentry integration enabled');
      }
    } catch (error) {
      log.error('[ErrorHandler] Failed to initialize Sentry:', error);
      log.warn('[ErrorHandler] Install @sentry/electron to enable Sentry integration');
      this.isSentryEnabled = false;
    }
  }

  /**
   * Register global error handlers
   */
  private registerGlobalHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
      this.handleUnhandledRejection(reason, promise);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.handleUncaughtException(error);
    });

    log.debug('[ErrorHandler] Global error handlers registered');
  }

  /**
   * Handle unhandled promise rejections
   */
  private handleUnhandledRejection(reason: unknown, _promise: Promise<unknown>): void {
    const context = this.getCurrentContext();
    const errorMessage = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;

    log.error('[ErrorHandler] Unhandled Promise Rejection:', {
      reason: errorMessage,
      stack,
      context,
    });

    // Report to Sentry if enabled
    if (this.isSentryEnabled && this.Sentry) {
      this.Sentry.captureException(reason, {
        tags: {
          type: 'unhandledRejection',
          feature: context.feature,
          phase: context.phase,
        },
        extra: {
          context,
        },
      });
    }

    // Don't quit on unhandled rejections, just log them
    // The app should continue running
  }

  /**
   * Handle uncaught exceptions
   */
  private handleUncaughtException(error: Error): void {
    const context = this.getCurrentContext();

    log.error('[ErrorHandler] Uncaught Exception:', {
      message: error.message,
      stack: error.stack,
      context,
    });

    // Report to Sentry if enabled
    if (this.isSentryEnabled && this.Sentry) {
      this.Sentry.captureException(error, {
        tags: {
          type: 'uncaughtException',
          feature: context.feature,
          phase: context.phase,
        },
        extra: {
          context,
        },
      });
    }

    // Graceful shutdown on critical errors
    if (this.config.gracefulShutdown) {
      log.error('[ErrorHandler] Critical error, initiating graceful shutdown');

      // Give time for logs to flush and Sentry to send error
      setTimeout(() => {
        app.quit();
      }, 1000);
    }
  }

  /**
   * Push an error context onto the stack
   * Use this when entering a feature initialization or operation
   *
   * @param context - Error context
   * @returns Cleanup function to pop the context
   */
  pushContext(context: ErrorContext): () => void {
    this.errorContextStack.push(context);

    // Return cleanup function
    return () => {
      this.popContext();
    };
  }

  /**
   * Pop the current error context from the stack
   */
  private popContext(): void {
    this.errorContextStack.pop();
  }

  /**
   * Get the current error context (top of stack)
   */
  private getCurrentContext(): ErrorContext {
    return this.errorContextStack[this.errorContextStack.length - 1] || {};
  }

  /**
   * Handle a feature initialization error
   * Logs the error with context and reports to Sentry if enabled
   *
   * @param feature - Feature name
   * @param error - Error that occurred
   * @param phase - Initialization phase
   */
  handleFeatureError(feature: string, error: unknown, phase?: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    log.error(`[ErrorHandler] Feature '${feature}' failed${phase ? ` during ${phase}` : ''}:`, {
      message: errorMessage,
      stack,
    });

    // Report to Sentry if enabled
    if (this.isSentryEnabled && this.Sentry) {
      this.Sentry.captureException(error, {
        tags: {
          type: 'featureError',
          feature,
          phase,
        },
      });
    }
  }

  /**
   * Wrap an async operation with error handling and context
   *
   * @param context - Error context
   * @param operation - Async operation to execute
   * @returns Promise that resolves with the operation result
   */
  async wrapAsync<T>(context: ErrorContext, operation: () => Promise<T>): Promise<T> {
    const cleanup = this.pushContext(context);

    try {
      const result = await operation();
      cleanup();
      return result;
    } catch (error) {
      cleanup();
      this.handleFeatureError(context.feature || 'unknown', error, context.phase);
      throw error;
    }
  }

  /**
   * Wrap a synchronous operation with error handling and context
   *
   * @param context - Error context
   * @param operation - Sync operation to execute
   * @returns Operation result
   */
  wrapSync<T>(context: ErrorContext, operation: () => T): T {
    const cleanup = this.pushContext(context);

    try {
      const result = operation();
      cleanup();
      return result;
    } catch (error) {
      cleanup();
      this.handleFeatureError(context.feature || 'unknown', error, context.phase);
      throw error;
    }
  }

  /**
   * Check if Sentry is enabled and initialized
   */
  isSentryActive(): boolean {
    return this.isSentryEnabled;
  }

  /**
   * Get Sentry SDK instance (if available)
   */
  getSentry():
    | {
        captureException: (error: unknown, context?: Record<string, unknown>) => void;
      }
    | undefined {
    return this.Sentry;
  }
}

// Export singleton instance
let errorHandler: ErrorHandler | null = null;

/**
 * Get the global error handler instance
 */
export function getErrorHandler(config?: ErrorHandlerConfig): ErrorHandler {
  if (!errorHandler) {
    errorHandler = new ErrorHandler(config);
  }
  return errorHandler;
}

/**
 * Initialize the global error handler
 * Should be called early in the application lifecycle
 */
export async function initializeErrorHandler(
  config?: ErrorHandlerConfig,
  store?: Store<StoreType>
): Promise<void> {
  const handler = getErrorHandler(config);
  await handler.initialize(store);
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
  } catch (error) {
    log.error(`[ErrorHandler] Feature '${featureName}' initialization failed:`, error);
    // Don't rethrow - allow app to continue with other features
  }
}
