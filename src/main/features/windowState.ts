import {throttle, debounce} from 'throttle-debounce';
import {BrowserWindow} from 'electron';
import log from 'electron-log';
import store from '../config';
import {TIMING} from '../../shared/constants';

export default (window: BrowserWindow) => {
  try {
    // Restore previous window state
    if (store.has('window')) {
      const windowState = store.get('window');
      const bounds = windowState.bounds;
      if (bounds && bounds.x !== null && bounds.y !== null) {
        window.setBounds({
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height
        });
        log.debug('[WindowState] Restored window bounds');
      }
    }

    // Restore maximized state
    window.on('ready-to-show', () => {
      if (store.get('window.isMaximized')) {
        window.maximize();
        log.debug('[WindowState] Window maximized from saved state');
      }
    });

    // Debounced save function to reduce disk writes
    const saveWindowPosition = () => {
      try {
        if (!window.isMaximized() && !window.isDestroyed()) {
          const bounds = window.getBounds();
          store.set('window', {
            bounds,
            isMaximized: false
          });
          log.debug('[WindowState] Saved window position');
        }
      } catch (error) {
        log.error('[WindowState] Failed to save window position:', error);
      }
    };

    // Debounced version for close event to avoid immediate write
    const debouncedSave = debounce(100, saveWindowPosition);

    // Use debounce on close, throttle on resize/move
    window.on('close', debouncedSave);
    window.on('resize', throttle(TIMING.WINDOW_STATE_SAVE, saveWindowPosition));
    window.on('move', throttle(TIMING.WINDOW_STATE_SAVE, saveWindowPosition));

    // Save maximized/unmaximized state immediately
    window.on('maximize', () => {
      try {
        store.set('window.isMaximized', true);
        log.debug('[WindowState] Window maximized');
      } catch (error) {
        log.error('[WindowState] Failed to save maximized state:', error);
      }
    });

    window.on('unmaximize', () => {
      try {
        store.set('window.isMaximized', false);
        log.debug('[WindowState] Window unmaximized');
      } catch (error) {
        log.error('[WindowState] Failed to save unmaximized state:', error);
      }
    });

    log.info('[WindowState] Window state persistence initialized');
  } catch (error) {
    log.error('[WindowState] Failed to initialize window state:', error);
  }
};
