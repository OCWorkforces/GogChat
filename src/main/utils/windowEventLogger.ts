/**
 * Window lifecycle event logging
 * Attaches debug-level logging for visibility/focus/minimize state changes.
 */
import type { BrowserWindow } from 'electron';
import { logger } from './logger.js';

const windowLogger = logger.window;

function logState(event: string, window: BrowserWindow): void {
  windowLogger.debug(`${event} visible=${window.isVisible()} focused=${window.isFocused()}`);
}

/**
 * Attach debug-level logging for standard window lifecycle events.
 * Each handler logs event name plus current visible/focused state.
 */
export function attachEventLogging(window: BrowserWindow): void {
  window.on('show', () => logState('show', window));
  window.on('hide', () => logState('hide', window));
  window.on('focus', () => logState('focus', window));
  window.on('blur', () => logState('blur', window));
  window.on('minimize', () => logState('minimize', window));
  window.on('restore', () => logState('restore', window));
}
