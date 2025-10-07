/**
 * Unit tests for context menu
 */

import { describe, it, expect, vi } from 'vitest';

// Mock electron-context-menu
const contextMenuMock = vi.fn();

vi.mock('electron-context-menu', () => ({
  default: contextMenuMock
}));

describe('Context Menu', () => {
  it('should initialize context menu', async () => {
    const contextMenu = await import('./contextMenu');

    contextMenu.default();

    expect(contextMenuMock).toHaveBeenCalled();
  });

  it('should be called without errors', async () => {
    const contextMenu = await import('./contextMenu');

    expect(() => contextMenu.default()).not.toThrow();
  });
});
