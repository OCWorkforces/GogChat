/**
 * Cleanup Types
 * Shared type definitions for resource cleanup system.
 * Extracted to break circular dependency between resourceCleanup.ts and trackedResources.ts.
 */
import type { BrowserWindow } from 'electron';

/**
 * Type for event handler functions
 */
export type EventHandler = (...args: unknown[]) => void;

/**
 * Type for event target with listener methods
 */
export interface EventTarget {
  on?: (event: string, handler: EventHandler) => void;
  addEventListener?: (event: string, handler: EventHandler) => void;
  removeListener?: (event: string, handler: EventHandler) => void;
  off?: (event: string, handler: EventHandler) => void;
}

/**
 * Resource cleanup configuration
 */
export interface CleanupConfig {
  window?: BrowserWindow;
  includeGlobalResources?: boolean;
  logDetails?: boolean;
}
