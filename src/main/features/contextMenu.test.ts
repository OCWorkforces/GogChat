/**
 * Unit tests for context menu
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock electron-context-menu - return a cleanup function
const contextMenuMock = vi.fn(() => () => {});

vi.mock('electron-context-menu', () => ({
  default: contextMenuMock,
}));

describe('Context Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize context menu with correct options', async () => {
    const contextMenu = await import('./contextMenu');

    const cleanup = contextMenu.default();

    expect(contextMenuMock).toHaveBeenCalledWith({
      showSaveImage: true,
      showCopyImageAddress: true,
    });
    expect(cleanup).toBeDefined();
    expect(typeof cleanup).toBe('function');
  });

  it('should be called without errors', async () => {
    const contextMenu = await import('./contextMenu');

    expect(() => contextMenu.default()).not.toThrow();
  });

  it('should return cleanup function', async () => {
    const contextMenu = await import('./contextMenu');

    const cleanup = contextMenu.default();

    expect(typeof cleanup).toBe('function');
    expect(() => cleanup()).not.toThrow();
  });
});
