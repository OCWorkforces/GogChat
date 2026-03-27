/**
 * Centralized error handling for the main process
 *
 * This module provides:
 * - Global error handlers for unhandled rejections and exceptions
 * - Error context tracking (feature name, initialization phase)
 * - Graceful shutdown on critical errors
 * - Type-safe error utilities for catch blocks
 *
 * @module errorHandler
 */

import { app } from 'electron';
import log from 'electron-log';
import type Store from 'electron-store';
import type { StoreType } from '../../shared/types.js';

/**
 * Extract error message from unknown error type
 * Type guard utility for safe error message extraction
 *
 * @param error - Unknown error from catch block
 * @returns Safe string error message
 */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

/**
 * Convert unknown error to Error object
 * Ensures error is always an Error instance for consistent handling
 *
 * @param error - Unknown error from catch block
 * @returns Error instance
 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(toErrorMessage(error));
}

/**
 * Type guard to check if value is an Error
 *
 * @param error - Unknown value to check
 * @returns True if value is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

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
  gracefulShutdown?: boolean; // Whether to gracefully shutdown on critical errors
}

/**
 * Singleton error handler instance
 */
class ErrorHandler {
  private config: ErrorHandlerConfig;
  private errorContextStack: ErrorContext[] = [];
  private isInitialized = false;

  constructor(config: ErrorHandlerConfig = {}) {
    this.config = {
      gracefulShutdown: true,
      ...config,
    };
  }

  /**
   * Initialize the error handler
   * Sets up global handlers for unhandledRejection and uncaughtException
   */
  initialize(_store?: Store<StoreType>): void {
    if (this.isInitialized) {
      log.warn('[ErrorHandler] Already initialized');
      return;
    }

    log.info('[ErrorHandler] Initializing centralized error handler');

    // Register global error handlers
    this.registerGlobalHandlers();

    this.isInitialized = true;
    log.info('[ErrorHandler] Centralized error handler initialized');
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

    // Graceful shutdown on critical errors
    if (this.config.gracefulShutdown) {
      log.error('[ErrorHandler] Critical error, initiating graceful shutdown');

      // NOTE: Intentionally bare setTimeout — cannot use createTrackedTimeout here
      // because resourceCleanup.ts imports from errorHandler.ts (toErrorMessage),
      // creating a circular dependency. This is acceptable since it only fires
      // during critical shutdown (uncaughtException) when cleanup is moot anyway.
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
   * Logs the error with context
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
    } catch (error: unknown) {
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
    } catch (error: unknown) {
      cleanup();
      this.handleFeatureError(context.feature || 'unknown', error, context.phase);
      throw error;
    }
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
export function initializeErrorHandler(
  config?: ErrorHandlerConfig,
  store?: Store<StoreType>
): void {
  const handler = getErrorHandler(config);
  handler.initialize(store);
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
