import { throttle, debounce } from 'throttle-debounce';
import log from 'electron-log';
import store from '../config.js';
import { TIMING } from '../../shared/constants.js';
import type { WindowState } from '../../shared/types.js';
import { getWindowForAccount } from '../utils/accountWindowManager.js';

// Store handlers for cleanup
let debouncedSaveHandler: ReturnType<typeof debounce<() => void>> | null = null;
let throttledResizeHandler: ReturnType<typeof throttle<() => void>> | null = null;
let throttledMoveHandler: ReturnType<typeof throttle<() => void>> | null = null;
let readyToShowHandler: (() => void) | null = null;
let maximizeHandler: (() => void) | null = null;
let unmaximizeHandler: (() => void) | null = null;

interface WindowStateContext {
  accountWindowManager?: unknown;
}

export default (_context: WindowStateContext) => {
  try {
    // Resolve window from account-0 (preserving current single-window behavior)
    const window = getWindowForAccount(0);
    if (!window) {
      log.warn('[WindowState] No window available for account-0');
      return;
    }

    // Restore previous window state
    if (store.has('window')) {
      const windowState = store.get('window') as WindowState | undefined;
      if (!windowState) return;
      const bounds = windowState.bounds;
      // Validate bounds have all required properties as numbers
      if (
        bounds &&
        typeof bounds.x === 'number' &&
        typeof bounds.y === 'number' &&
        typeof bounds.width === 'number' &&
        typeof bounds.height === 'number' &&
        !isNaN(bounds.x) &&
        !isNaN(bounds.y) &&
        !isNaN(bounds.width) &&
        !isNaN(bounds.height)
      ) {
        window.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        });
        log.debug('[WindowState] Restored window bounds');
      } else if (bounds) {
        log.warn('[WindowState] Invalid bounds data, skipping restore:', bounds);
      }
    }

    // Restore maximized state
    readyToShowHandler = () => {
      if (store.get('window.isMaximized')) {
        window.maximize();
        log.debug('[WindowState] Window maximized from saved state');
      }
    };
    window.on('ready-to-show', readyToShowHandler);

    // Debounced save function to reduce disk writes
    const saveWindowPosition = () => {
      try {
        if (!window.isMaximized() && !window.isDestroyed()) {
          const bounds = window.getBounds();
          store.set('window', {
            bounds,
            isMaximized: false,
          });
          log.debug('[WindowState] Saved window position');
        }
      } catch (error: unknown) {
        log.error('[WindowState] Failed to save window position:', error);
      }
    };

    // Debounced version for close event to avoid immediate write
    debouncedSaveHandler = debounce(100, saveWindowPosition);
    throttledResizeHandler = throttle(TIMING.WINDOW_STATE_SAVE, saveWindowPosition);
    throttledMoveHandler = throttle(TIMING.WINDOW_STATE_SAVE, saveWindowPosition);

    // Use debounce on close, throttle on resize/move
    window.on('close', debouncedSaveHandler);
    window.on('resize', throttledResizeHandler);
    window.on('move', throttledMoveHandler);

    // Save maximized/unmaximized state immediately
    maximizeHandler = () => {
      try {
        store.set('window.isMaximized', true);
        log.debug('[WindowState] Window maximized');
      } catch (error: unknown) {
        log.error('[WindowState] Failed to save maximized state:', error);
      }
    };

    unmaximizeHandler = () => {
      try {
        store.set('window.isMaximized', false);
        log.debug('[WindowState] Window unmaximized');
      } catch (error: unknown) {
        log.error('[WindowState] Failed to save unmaximized state:', error);
      }
    };

    window.on('maximize', maximizeHandler);
    window.on('unmaximize', unmaximizeHandler);

    log.info('[WindowState] Window state persistence initialized');
  } catch (error: unknown) {
    log.error('[WindowState] Failed to initialize window state:', error);
  }
};

/**
 * Cleanup function for window state feature
 */
export function cleanupWindowState(_context: WindowStateContext): void {
  try {
    log.debug('[WindowState] Cleaning up window state listeners');
    // Resolve window from account-0 for cleanup
    const win = getWindowForAccount(0);

    // Cancel any pending throttled/debounced calls
    if (debouncedSaveHandler) {
      debouncedSaveHandler.cancel();
    }
    if (throttledResizeHandler) {
      throttledResizeHandler.cancel();
    }
    if (throttledMoveHandler) {
      throttledMoveHandler.cancel();
    }

    // Remove event listeners
    if (win && !win.isDestroyed()) {
      if (readyToShowHandler) {
        win.removeListener('ready-to-show', readyToShowHandler);
      }
      if (debouncedSaveHandler) {
        win.removeListener('close', debouncedSaveHandler);
      }
      if (throttledResizeHandler) {
        win.removeListener('resize', throttledResizeHandler);
      }
      if (throttledMoveHandler) {
        win.removeListener('move', throttledMoveHandler);
      }
      if (maximizeHandler) {
        win.removeListener('maximize', maximizeHandler);
      }
      if (unmaximizeHandler) {
        win.removeListener('unmaximize', unmaximizeHandler);
      }
    }

    // Clear handler references
    debouncedSaveHandler = null;
    throttledResizeHandler = null;
    throttledMoveHandler = null;
    readyToShowHandler = null;
    maximizeHandler = null;
    unmaximizeHandler = null;

    log.info('[WindowState] Window state cleaned up');
  } catch (error: unknown) {
    log.error('[WindowState] Failed to cleanup window state:', error);
  }
}
