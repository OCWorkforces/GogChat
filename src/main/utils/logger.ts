/**
 * Structured logging utility
 * Provides scoped loggers with consistent formatting and levels
 */

import log from 'electron-log';
import type { ErrorLogEntry } from '../../shared/types';

/**
 * Log levels
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

/**
 * Scoped logger class
 * Provides consistent logging with scope prefixes
 */
export class ScopedLogger {
  constructor(private scope: string) {}

  /**
   * Log error message
   */
  error(message: string, ...args: any[]): void {
    log.error(`[${this.scope}] ${message}`, ...args);
  }

  /**
   * Log warning message
   */
  warn(message: string, ...args: any[]): void {
    log.warn(`[${this.scope}] ${message}`, ...args);
  }

  /**
   * Log info message
   */
  info(message: string, ...args: any[]): void {
    log.info(`[${this.scope}] ${message}`, ...args);
  }

  /**
   * Log debug message
   */
  debug(message: string, ...args: any[]): void {
    log.debug(`[${this.scope}] ${message}`, ...args);
  }

  /**
   * Log structured error entry
   */
  logError(entry: Omit<ErrorLogEntry, 'timestamp' | 'scope'>): void {
    const fullEntry: ErrorLogEntry = {
      ...entry,
      timestamp: Date.now(),
      scope: this.scope,
    };

    log.error(
      `[${this.scope}] ${fullEntry.level.toUpperCase()}: ${fullEntry.message}`,
      fullEntry.stack || '',
      fullEntry.meta || {}
    );
  }

  /**
   * Create a child logger with nested scope
   */
  child(childScope: string): ScopedLogger {
    return new ScopedLogger(`${this.scope}:${childScope}`);
  }
}

/**
 * Pre-configured loggers for different modules
 */
export const logger = {
  security: new ScopedLogger('Security'),
  performance: new ScopedLogger('Performance'),
  ipc: new ScopedLogger('IPC'),
  feature: (name: string) => new ScopedLogger(`Feature:${name}`),
  main: new ScopedLogger('Main'),
  config: new ScopedLogger('Config'),
  window: new ScopedLogger('Window'),
};

/**
 * Configure log levels based on environment
 */
export function configureLogging(isDev: boolean): void {
  if (isDev) {
    log.transports.console.level = 'debug';
    log.transports.file.level = 'debug';
  } else {
    log.transports.console.level = 'warn';
    log.transports.file.level = 'info';
  }

  log.info('[Logger] Logging configured', { isDev });
}

/**
 * Get log file path
 */
export function getLogPath(): string {
  return log.transports.file.getFile().path;
}
