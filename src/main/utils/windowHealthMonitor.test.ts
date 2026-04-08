/**
 * Unit tests for windowHealthMonitor — error/crash/navigation logging
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

vi.mock('./benignLogFilter.js', () => ({
  isBenignRendererConsoleMessage: vi.fn().mockReturnValue(false),
  isBenignSubframeLoadFailure: vi.fn().mockReturnValue(false),
}));

import { attachHealthMonitoring } from './windowHealthMonitor';
import { logger } from './logger';
import { isBenignRendererConsoleMessage, isBenignSubframeLoadFailure } from './benignLogFilter';

type Handler = (...args: unknown[]) => void;

function createMockWindow() {
  const wcHandlers = new Map<string, Handler>();
  return {
    webContents: {
      on: vi.fn((event: string, handler: Handler) => {
        wcHandlers.set(event, handler);
      }),
      getURL: vi.fn().mockReturnValue('https://chat.google.com'),
    },
    _fireWc(event: string, ...args: unknown[]) {
      wcHandlers.get(event)?.(...args);
    },
  };
}

describe('windowHealthMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all expected webContents event handlers', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    const registered = (win.webContents.on as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: [string]) => c[0]
    );
    for (const event of [
      'console-message',
      'did-fail-load',
      'did-finish-load',
      'did-navigate',
      'render-process-gone',
      'unresponsive',
      'responsive',
    ]) {
      expect(registered).toContain(event);
    }
  });

  describe('console-message', () => {
    it('suppresses benign messages at debug level', () => {
      vi.mocked(isBenignRendererConsoleMessage).mockReturnValue(true);
      const win = createMockWindow();
      attachHealthMonitoring(win as never);

      win._fireWc('console-message', {
        message: 'benign warning',
        sourceId: 'source.js',
        lineNumber: 1,
        level: 0,
      });

      expect(logger.window.debug).toHaveBeenCalledWith(
        expect.stringContaining('[Renderer:suppressed]')
      );
      expect(logger.window.info).not.toHaveBeenCalled();
    });

    it('logs non-benign messages at info level', () => {
      vi.mocked(isBenignRendererConsoleMessage).mockReturnValue(false);
      const win = createMockWindow();
      attachHealthMonitoring(win as never);

      win._fireWc('console-message', {
        message: 'real error',
        sourceId: 'app.js',
        lineNumber: 42,
        level: 2,
      });

      expect(logger.window.info).toHaveBeenCalledWith(expect.stringContaining('[Renderer:2]'));
    });
  });

  describe('did-fail-load', () => {
    it('suppresses benign subframe failures at debug level', () => {
      vi.mocked(isBenignSubframeLoadFailure).mockReturnValue(true);
      const win = createMockWindow();
      attachHealthMonitoring(win as never);

      win._fireWc('did-fail-load', {}, -27, 'ERR_BLOCKED', 'https://sub.google.com', false);

      expect(logger.window.debug).toHaveBeenCalledWith(
        expect.stringContaining('Suppressed expected subframe failure')
      );
      expect(logger.window.error).not.toHaveBeenCalled();
    });

    it('logs real failures at error level', () => {
      vi.mocked(isBenignSubframeLoadFailure).mockReturnValue(false);
      const win = createMockWindow();
      attachHealthMonitoring(win as never);

      win._fireWc('did-fail-load', {}, -102, 'ERR_CONN_REFUSED', 'https://chat.google.com', true);

      expect(logger.window.error).toHaveBeenCalledWith(expect.stringContaining('(main frame)'));
    });

    it('labels subframe failures correctly', () => {
      vi.mocked(isBenignSubframeLoadFailure).mockReturnValue(false);
      const win = createMockWindow();
      attachHealthMonitoring(win as never);

      win._fireWc('did-fail-load', {}, -102, 'ERR_CONN_REFUSED', 'https://sub.google.com', false);

      expect(logger.window.error).toHaveBeenCalledWith(expect.stringContaining('(subframe)'));
    });
  });

  it('logs did-finish-load with current URL', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    win._fireWc('did-finish-load');

    expect(logger.window.info).toHaveBeenCalledWith(
      '[Load] did-finish-load: https://chat.google.com'
    );
  });

  it('logs did-navigate with URL and HTTP code', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    win._fireWc('did-navigate', {}, 'https://chat.google.com/u/0', 200);

    expect(logger.window.info).toHaveBeenCalledWith(
      '[Nav] did-navigate: https://chat.google.com/u/0 (HTTP 200)'
    );
  });

  it('logs render-process-gone at error level', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    win._fireWc('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });

    expect(logger.window.error).toHaveBeenCalledWith(
      '[Renderer] render-process-gone reason=crashed exitCode=1'
    );
  });

  it('logs unresponsive at warn level', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    win._fireWc('unresponsive');

    expect(logger.window.warn).toHaveBeenCalledWith('[Renderer] unresponsive');
  });

  it('logs responsive at info level', () => {
    const win = createMockWindow();
    attachHealthMonitoring(win as never);

    win._fireWc('responsive');

    expect(logger.window.info).toHaveBeenCalledWith('[Renderer] responsive');
  });
});
