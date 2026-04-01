/**
 * Unit tests for featureHelpers — factory helper for deferred mainWindow features
 *
 * Covers: createMainWindowFeature() produces correct FeatureConfig with lazy loading,
 * deferred phase, optional dependencies/description, and mainWindow null-guard behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
}));

vi.mock('../utils/featureTypes.js', () => ({
  createLazyFeature: vi.fn(
    (
      name: string,
      phase: string,
      importFn: () => Promise<unknown>,
      opts?: Record<string, unknown>
    ) => ({
      name,
      priority: phase,
      lazy: true,
      init: importFn,
      ...opts,
    })
  ),
}));

import { createMainWindowFeature } from './featureHelpers';
import { createLazyFeature } from '../utils/featureTypes.js';

describe('featureHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMainWindowFeature', () => {
    it('should delegate to createLazyFeature with correct name and deferred phase', () => {
      const importFn = vi.fn();
      createMainWindowFeature('testFeature', importFn);

      expect(createLazyFeature).toHaveBeenCalledTimes(1);
      expect(createLazyFeature).toHaveBeenCalledWith(
        'testFeature',
        'deferred',
        expect.any(Function),
        undefined
      );
    });

    it('should pass dependencies and description through opts', () => {
      const importFn = vi.fn();
      const opts = { dependencies: ['trayIcon'], description: 'Test feature' };
      createMainWindowFeature('testFeature', importFn, opts);

      expect(createLazyFeature).toHaveBeenCalledWith(
        'testFeature',
        'deferred',
        expect.any(Function),
        opts
      );
    });

    it('should pass undefined opts when none provided', () => {
      const importFn = vi.fn();
      createMainWindowFeature('testFeature', importFn);

      expect(createLazyFeature).toHaveBeenCalledWith(
        'testFeature',
        'deferred',
        expect.any(Function),
        undefined
      );
    });

    it('should return the result of createLazyFeature', () => {
      const importFn = vi.fn();
      const result = createMainWindowFeature('myFeature', importFn);

      expect(result).toEqual(
        expect.objectContaining({
          name: 'myFeature',
          priority: 'deferred',
          lazy: true,
        })
      );
    });

    describe('generated importFn wrapper', () => {
      it('should call module.default with mainWindow when mainWindow exists', async () => {
        const mockDefault = vi.fn();
        const importFn = vi.fn().mockResolvedValue({ default: mockDefault });

        // Use real createLazyFeature behavior: capture the wrapper fn passed to it
        const capturedArgs = vi.mocked(createLazyFeature).mock.calls;
        createMainWindowFeature('testFeature', importFn);

        // Get the wrapper importFn (3rd argument)
        const wrapperFn = capturedArgs[capturedArgs.length - 1]![2] as () => Promise<{
          default: (ctx: { mainWindow?: unknown }) => void;
        }>;
        const resolved = await wrapperFn();

        const mockWindow = { id: 1 };
        resolved.default({ mainWindow: mockWindow });

        expect(importFn).toHaveBeenCalledTimes(1);
        expect(mockDefault).toHaveBeenCalledWith(mockWindow);
      });

      it('should NOT call module.default when mainWindow is null', async () => {
        const mockDefault = vi.fn();
        const importFn = vi.fn().mockResolvedValue({ default: mockDefault });

        const capturedArgs = vi.mocked(createLazyFeature).mock.calls;
        createMainWindowFeature('testFeature', importFn);

        const wrapperFn = capturedArgs[capturedArgs.length - 1]![2] as () => Promise<{
          default: (ctx: { mainWindow?: unknown }) => void;
        }>;
        const resolved = await wrapperFn();

        resolved.default({ mainWindow: null });

        expect(importFn).toHaveBeenCalledTimes(1);
        expect(mockDefault).not.toHaveBeenCalled();
      });

      it('should NOT call module.default when mainWindow is undefined', async () => {
        const mockDefault = vi.fn();
        const importFn = vi.fn().mockResolvedValue({ default: mockDefault });

        const capturedArgs = vi.mocked(createLazyFeature).mock.calls;
        createMainWindowFeature('testFeature', importFn);

        const wrapperFn = capturedArgs[capturedArgs.length - 1]![2] as () => Promise<{
          default: (ctx: { mainWindow?: unknown }) => void;
        }>;
        const resolved = await wrapperFn();

        resolved.default({});

        expect(importFn).toHaveBeenCalledTimes(1);
        expect(mockDefault).not.toHaveBeenCalled();
      });
    });
  });
});
