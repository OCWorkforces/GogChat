/**
 * Unit tests for windowEventLogger — lifecycle event debug logging
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: {
    window: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  },
}));

import { attachEventLogging } from './windowEventLogger';
import { logger } from './logger';

function createMockWindow() {
  const handlers = new Map<string, (() => void)[]>();
  return {
    on: vi.fn((event: string, handler: () => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    }),
    isVisible: vi.fn().mockReturnValue(true),
    isFocused: vi.fn().mockReturnValue(false),
    _fire(event: string) {
      for (const h of handlers.get(event) ?? []) h();
    },
  };
}

describe('windowEventLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers handlers for all six lifecycle events', () => {
    const win = createMockWindow();
    attachEventLogging(win as never);

    const registered = win.on.mock.calls.map((c: [string]) => c[0]);
    for (const event of ['show', 'hide', 'focus', 'blur', 'minimize', 'restore']) {
      expect(registered).toContain(event);
    }
  });

  it('logs debug with visible/focused state on each event', () => {
    const win = createMockWindow();
    attachEventLogging(win as never);

    win.isVisible.mockReturnValue(true);
    win.isFocused.mockReturnValue(false);
    win._fire('show');

    expect(logger.window.debug).toHaveBeenCalledWith('show visible=true focused=false');
  });

  it('reflects current state at the time of the event', () => {
    const win = createMockWindow();
    attachEventLogging(win as never);

    win.isVisible.mockReturnValue(false);
    win.isFocused.mockReturnValue(false);
    win._fire('minimize');

    expect(logger.window.debug).toHaveBeenCalledWith('minimize visible=false focused=false');
  });

  it('logs each event independently', () => {
    const win = createMockWindow();
    attachEventLogging(win as never);

    win._fire('focus');
    win._fire('blur');
    win._fire('restore');

    expect(logger.window.debug).toHaveBeenCalledTimes(3);
  });
});
