import {throttle} from 'throttle-debounce';
import {BrowserWindow} from 'electron';
import store from '../config';

export default (window: BrowserWindow) => {

  if (store.has('window.bounds')) {
    const bounds = store.get('window.bounds');
    if (bounds.x !== null && bounds.y !== null) {
      window.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    }
  }

  window.on('ready-to-show', () => {
    if (store.get('window.isMaximized')) {
      window.maximize()
    }
  })

  const saveWindowPosition = () => {
    if (!window.isMaximized()) {
      store.set('window', {
        bounds: window.getBounds(),
        isMaximized: false
      });
    }
  }

  window.on('close', saveWindowPosition);
  window.on('resize', throttle(500, saveWindowPosition));
  window.on('move', throttle(500, saveWindowPosition));

  window.on('maximize', () => {
    store.set('window.isMaximized', true);
  });

  window.on('unmaximize', () => {
    store.set('window.isMaximized', false);
  });
}
