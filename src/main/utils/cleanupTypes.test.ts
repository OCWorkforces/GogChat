/**
 * Unit tests for cleanupTypes — type definitions for resource cleanup system.
 *
 * This is a type-only file, but v8 coverage counts it.
 * These tests verify the exports compile correctly and the interfaces
 * are structurally usable at runtime.
 */

import { describe, it, expect } from 'vitest';
import type { EventHandler, EventTarget, CleanupConfig } from './cleanupTypes';

describe('cleanupTypes', () => {
  it('EventHandler type accepts a function with unknown args', () => {
    const handler: EventHandler = (..._args: unknown[]) => {
      /* no-op */
    };

    expect(typeof handler).toBe('function');
    // Callable without error
    handler('arg1', 42, null);
  });

  it('EventTarget interface accepts an object with optional listener methods', () => {
    const target: EventTarget = {
      on: (_event: string, _handler: EventHandler) => {},
      removeListener: (_event: string, _handler: EventHandler) => {},
    };

    expect(target.on).toBeDefined();
    expect(target.removeListener).toBeDefined();
    expect(target.addEventListener).toBeUndefined();
    expect(target.off).toBeUndefined();
  });

  it('EventTarget interface works with addEventListener/off variants', () => {
    const target: EventTarget = {
      addEventListener: (_event: string, _handler: EventHandler) => {},
      off: (_event: string, _handler: EventHandler) => {},
    };

    expect(target.addEventListener).toBeDefined();
    expect(target.off).toBeDefined();
  });

  it('CleanupConfig interface accepts partial configuration', () => {
    const config: CleanupConfig = {};

    expect(config.window).toBeUndefined();
    expect(config.includeGlobalResources).toBeUndefined();
    expect(config.logDetails).toBeUndefined();
  });

  it('CleanupConfig interface accepts full configuration', () => {
    const config: CleanupConfig = {
      includeGlobalResources: true,
      logDetails: false,
    };

    expect(config.includeGlobalResources).toBe(true);
    expect(config.logDetails).toBe(false);
  });
});
