/**
 * Window health monitoring
 * Attaches error/crash/navigation logging to a BrowserWindow's webContents.
 */
import type { BrowserWindow, Event, WebContentsConsoleMessageEventParams } from 'electron';
import { logger } from './logger.js';
import { isBenignRendererConsoleMessage, isBenignSubframeLoadFailure } from './benignLogFilter.js';

const windowLogger = logger.window;

/**
 * Attach health-monitoring handlers to a BrowserWindow's webContents:
 * console-message, did-fail-load, did-finish-load, did-navigate,
 * render-process-gone, unresponsive, responsive.
 */
export function attachHealthMonitoring(window: BrowserWindow): void {
  const { webContents } = window;

  webContents.on('console-message', (event: Event<WebContentsConsoleMessageEventParams>) => {
    if (isBenignRendererConsoleMessage(event.message, event.sourceId)) {
      windowLogger.debug(
        `[Renderer:suppressed] ${event.message} (${event.sourceId}:${event.lineNumber})`
      );
      return;
    }

    windowLogger.info(
      `[Renderer:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`
    );
  });

  webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isBenignSubframeLoadFailure(errorCode, validatedURL, isMainFrame)) {
        windowLogger.debug(
          `[Load] Suppressed expected subframe failure: ${errorDescription} (${errorCode}) - ${validatedURL}`
        );
        return;
      }

      windowLogger.error(
        `[Load] FAILED ${isMainFrame ? '(main frame)' : '(subframe)'}: ${errorDescription} (${errorCode}) — ${validatedURL}`
      );
    }
  );

  webContents.on('did-finish-load', () => {
    windowLogger.info(`[Load] did-finish-load: ${webContents.getURL()}`);
  });

  webContents.on('did-navigate', (_event, navUrl, httpResponseCode) => {
    windowLogger.info(`[Nav] did-navigate: ${navUrl} (HTTP ${httpResponseCode})`);
  });

  webContents.on('render-process-gone', (_event, details) => {
    windowLogger.error(
      `[Renderer] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  webContents.on('unresponsive', () => {
    windowLogger.warn('[Renderer] unresponsive');
  });

  webContents.on('responsive', () => {
    windowLogger.info('[Renderer] responsive');
  });
}
